import { roomKey } from '../../../realtime/ActivityRealtimeServer';
import { GamificationService } from '../../gamification';
import { BOT_TUNING, PongBot, type BotDifficulty } from './PongBotAI';
import {
  PongEngine,
  type PaddleSide,
  type PongEngineConfig,
  type PongState,
} from './PongEngine';
import { encodeStateSnapshot } from './pongProtocol';

export interface ActivityBroadcaster {
  broadcast(
    instanceId: string,
    message: { type: string; payload?: unknown },
  ): void;
  broadcastBinary(instanceId: string, data: ArrayBuffer): void;
}

interface PongPlayer {
  userId: string;
  side: PaddleSide;
  connected: boolean;
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
    private instanceId: string,
    private guildId: string,
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
    return roomKey(this.instanceId, 'pong');
  }

  addPlayer(userId: string): PaddleSide | null {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      if (!existing.connected) this.resumeExisting(existing);
      return existing.side;
    }
    if (this.players.length >= 2) return null;
    const side: PaddleSide = this.players.length === 0 ? 'left' : 'right';
    this.players.push({ userId, side, connected: true });
    return side;
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
  pauseForDisconnect(userId: string) {
    if (this.engine.getState().winner) {
      this.leave(userId);
      return;
    }
    const player = this.players.find((p) => p.userId === userId && p.connected);
    if (!player) return; // already handled via an explicit leave

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

    const remaining = this.players.find(
      (p) => p.userId !== userId && p.connected,
    );
    if (remaining && !this.engine.getState().winner) {
      this.engine.forceWinner(remaining.side);
      const state = this.broadcastSnapshot();
      if (!this.resultRecorded) {
        this.resultRecorded = true;
        this.recordResult(state.winner!);
      }
    }

    this.players = this.players.filter((p) => p.userId !== userId);
    this.stop();
    if (this.players.length === 0) this.onSessionEnded?.();
  }

  // Explicit, deliberate exit (the client sent `{type:'leave'}`, or the
  // grace period for a disconnected player lapsed) — the opposite of
  // pauseForDisconnect: no grace period, the player's slot is freed
  // immediately.
  leave(userId: string) {
    const timer = this.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(userId);
    }
    this.players = this.players.filter((p) => p.userId !== userId);
    if (this.players.length === 0) {
      this.stop();
      this.onSessionEnded?.();
    }
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
      sessionId: this.instanceId,
      guildId: this.guildId,
      gameType: 'pong',
      results: this.players.map((player) => ({
        userId: player.userId,
        position: player.side === winner ? 1 : 2,
      })),
    });
  }
}
