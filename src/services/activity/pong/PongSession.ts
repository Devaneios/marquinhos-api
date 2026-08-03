import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { BOT_TUNING, PongBot, type BotDifficulty } from './PongBotAI';
import {
  PongEngine,
  type PaddleSide,
  type PongEngineConfig,
  type PongState,
} from './PongEngine';
import { encodeStateSnapshot } from './pongProtocol';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
  broadcastBinary(key: string, data: ArrayBuffer): void;
}

interface PongPlayer {
  userId: string;
  side: PaddleSide;
  connected: boolean;
  // Every live socket the user holds on this session. Usually one, but a
  // reconnect can briefly overlap a stale socket, and React remounts open a
  // second one before the first has finished saying goodbye. The slot is only
  // released once the last of them is gone, so a superseded socket can never
  // evict the connection that replaced it.
  connections: Set<unknown>;
}

// The session key doubles as the transport room key — it is produced once by
// ActivityRealtimeServer.roomKey and handed down, so the session and the room
// it broadcasts into can never drift apart. instanceId/guildId are kept only
// for the gamification record.
export interface PongSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface PongSessionOptions {
  onSessionEnded?: () => void;
  disconnectGraceMs?: number;
}

const FIXED_DT_MS = 8;
const MAX_CATCHUP_MS = 250;
const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

export class PongSession {
  private engine: PongEngine;
  private players: PongPlayer[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private resultRecorded = false;
  private botSide: PaddleSide = 'right';
  private bot: PongBot | null = null;
  private localTwoPlayer = false;
  private restartVotes = new Set<string>();
  private snapshotSeq = 0;
  private lastInputSeq: { left: number; right: number } = {
    left: 0,
    right: 0,
  };
  private lastLoopHr: bigint | null = null;
  private accumulatorMs = 0;
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private onSessionEnded?: () => void;
  private disconnectGraceMs: number;

  constructor(
    private identity: PongSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    engineConfig: PongEngineConfig = {},
    options: PongSessionOptions = {},
  ) {
    this.engine = new PongEngine(engineConfig);
    this.onSessionEnded = options.onSessionEnded;
    this.disconnectGraceMs =
      options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
  }

  get playerCount(): number {
    return this.players.length;
  }

  private get roomKey(): string {
    return this.identity.sessionKey;
  }

  addPlayer(userId: string, connection: unknown): PaddleSide | null {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) this.resumeExisting(existing);
      return existing.side;
    }
    if (this.players.length >= 2) return null;
    const side: PaddleSide = this.players.length === 0 ? 'left' : 'right';
    this.players.push({
      userId,
      side,
      connected: true,
      connections: new Set([connection]),
    });
    return side;
  }

  // True when `connection` was the last socket holding the slot — i.e. the
  // user really is gone, rather than one of several sockets dropping.
  private releaseConnection(player: PongPlayer, connection: unknown): boolean {
    player.connections.delete(connection);
    return player.connections.size === 0;
  }

  private resumeExisting(player: PongPlayer) {
    player.connected = true;
    const timer = this.disconnectTimers.get(player.userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(player.userId);
    }
    if (this.players.every((p) => p.connected)) this.start();
    this.broadcaster.broadcast(this.roomKey, {
      type: 'opponent_reconnected',
      payload: { side: player.side },
    });
  }

  // Called when the underlying WebSocket drops without an explicit `leave`
  // message first — a real network blip, not a deliberate exit. If the
  // match already ended there is nothing to pause, so this degrades to a
  // plain leave. Otherwise the loop freezes entirely (not just the
  // departed paddle) and the player's slot is held open for
  // `disconnectGraceMs` so a reconnect can resume the same match.
  //
  // Only 'multi' gets that grace. A private session (bot or hot-seat) has no
  // opponent waiting on the reconnect, so holding the slot would just leave
  // the user attached to a match they can silently fall back into the next
  // time they pick a mode — the exact bug this is guarding against.
  pauseForDisconnect(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return; // spectator, or already handled via an explicit leave
    if (!this.releaseConnection(player, connection)) return;

    if (this.identity.mode !== 'multi' || this.engine.getState().winner) {
      this.detach(userId);
      return;
    }
    if (!player.connected) return;

    player.connected = false;
    this.stop();
    this.broadcaster.broadcast(this.roomKey, {
      type: 'opponent_disconnected',
      payload: { side: player.side, timeoutMs: this.disconnectGraceMs },
    });
    const timer = setTimeout(
      () => this.forfeitDisconnected(userId),
      this.disconnectGraceMs,
    );
    this.disconnectTimers.set(userId, timer);
  }

  private forfeitDisconnected(userId: string) {
    this.disconnectTimers.delete(userId);
    const player = this.players.find((p) => p.userId === userId);
    if (!player || player.connected) return; // reconnected in the meantime

    this.forfeitTo(userId);
    this.removePlayer(userId);
  }

  // Settles and frees the slot: whoever is left wins an unfinished match,
  // then the player is gone for good.
  private detach(userId: string) {
    const timer = this.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(userId);
    }
    this.forfeitTo(userId);
    this.removePlayer(userId);
  }

  // Hands the win to whoever is left when `userId` abandons a match that
  // hasn't produced a winner yet. No-op when nobody is left to award it to.
  private forfeitTo(userId: string) {
    const remaining = this.players.find(
      (p) => p.userId !== userId && p.connected,
    );
    if (!remaining || this.engine.getState().winner) return;

    this.engine.forceWinner(remaining.side);
    const state = this.broadcastSnapshot();
    if (!this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(state.winner!);
    }
  }

  private removePlayer(userId: string) {
    this.players = this.players.filter((p) => p.userId !== userId);
    this.restartVotes.delete(userId);
    this.stop();
    if (this.players.length === 0) this.onSessionEnded?.();
  }

  // Explicit, deliberate exit (the client sent `{type:'leave'}`, or the
  // grace period for a disconnected player lapsed) — the opposite of
  // pauseForDisconnect: no grace period, the player's slot is freed
  // immediately and quitting mid-match forfeits it, exactly as letting the
  // grace period lapse would. Leaving must always fully detach: a player who
  // walked away must never be resumable into this match.
  leave(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return; // a spectator, who holds no slot to give up
    if (!this.releaseConnection(player, connection)) return;

    this.detach(userId);
  }

  // `side` is only honored in local hot-seat mode, where a single connection
  // legitimately drives both paddles (W/S + arrows on one keyboard). In a
  // normal session it's ignored and the sender's own registered side wins,
  // so a networked opponent can't spoof control of the other paddle.
  handleInput(
    userId: string,
    direction: -1 | 0 | 1,
    seq = 0,
    side?: PaddleSide,
  ) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    const targetSide =
      this.localTwoPlayer && side !== undefined ? side : player.side;
    this.engine.setInput(targetSide, direction);
    this.lastInputSeq[targetSide] = Math.max(
      this.lastInputSeq[targetSide],
      seq,
    );
  }

  // Marks the session as single-connection hot-seat play: one human owns
  // both paddles locally, so it should start as soon as that one player
  // joins (no bot, no second joiner to wait for).
  enableLocalTwoPlayer() {
    this.localTwoPlayer = true;
  }

  // The bot must never fight a real player for the same paddle — if the
  // sole human ended up on 'right' (e.g. a stale slot occupied 'left'), the
  // bot has to drive 'left' instead, not hardcode 'right'. The caller
  // (PongActivityManager) always knows the joining human's side, so it's
  // passed in rather than guessed from player order.
  enableBot(humanSide?: PaddleSide, difficulty: BotDifficulty = 'normal') {
    if (humanSide) {
      this.botSide = humanSide === 'left' ? 'right' : 'left';
    }
    this.bot = new PongBot(this.botSide, BOT_TUNING[difficulty]);
  }

  getPublicConfig() {
    const config = this.engine.getConfig();
    return {
      width: config.width,
      height: config.height,
      paddleWidth: config.paddleWidth,
      paddleHeight: config.paddleHeight,
      paddleSpeed: config.paddleSpeed,
      ballRadius: config.ballRadius,
    };
  }

  requestRestart(userId: string) {
    const state = this.engine.getState();
    if (!state.winner) return;
    if (!this.players.some((p) => p.userId === userId)) return;

    this.restartVotes.add(userId);
    const required = this.bot ? 1 : this.players.length;

    if (this.restartVotes.size < required) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'restart_status',
        payload: { votes: this.restartVotes.size, required },
      });
      return;
    }

    this.restartVotes.clear();
    this.resultRecorded = false;
    this.engine.reset();
    this.start();
    this.broadcastSnapshot();
  }

  start() {
    if (this.interval) return;
    this.lastLoopHr = process.hrtime.bigint();
    this.accumulatorMs = 0;
    this.interval = setInterval(() => this.loop(), FIXED_DT_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private loop() {
    const now = process.hrtime.bigint();
    const elapsedMs = Number(now - (this.lastLoopHr ?? now)) / 1e6;
    this.lastLoopHr = now;
    this.accumulatorMs = Math.min(
      this.accumulatorMs + elapsedMs,
      MAX_CATCHUP_MS,
    );

    while (this.accumulatorMs >= FIXED_DT_MS) {
      this.tick();
      this.accumulatorMs -= FIXED_DT_MS;
      if (!this.interval) return;
    }
  }

  tick() {
    this.updateBot(this.engine.getState());
    this.engine.tick(FIXED_DT_MS);
    const state = this.broadcastSnapshot();

    if (state.winner && !this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(state.winner);
      this.stop();
    }
  }

  private broadcastSnapshot(): PongState {
    const state = this.engine.getState();
    this.snapshotSeq += 1;
    this.broadcaster.broadcastBinary(
      this.roomKey,
      encodeStateSnapshot(
        this.snapshotSeq,
        this.lastInputSeq.left,
        this.lastInputSeq.right,
        state,
      ),
    );
    return state;
  }

  private updateBot(state: PongState) {
    if (!this.bot) return;
    const input = this.bot.computeInput(
      state,
      this.engine.getConfig(),
      FIXED_DT_MS,
    );
    this.engine.setInput(this.botSide, input);
  }

  private recordResult(winner: PaddleSide) {
    if (this.players.length < 2) return;
    this.gamification.recordGameResult({
      sessionId: this.identity.instanceId,
      guildId: this.identity.guildId,
      gameType: 'pong',
      results: this.players.map((player) => ({
        userId: player.userId,
        position: player.side === winner ? 1 : 2,
      })),
    });
  }
}
