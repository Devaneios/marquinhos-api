import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { DisconnectGraceTimer } from '../shared/DisconnectGraceTimer';
import {
  SnakeEngine,
  type SnakeDirection,
  type SnakeEngineConfig,
} from './SnakeEngine';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
  broadcastBinary(key: string, data: ArrayBuffer): void;
}

interface SnakePlayer {
  userId: string;
  playerId: string;
  connected: boolean;
  connections: Set<unknown>;
}

export interface SnakeSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface SnakeSessionOptions {
  onSessionEnded?: () => void;
  disconnectGraceMs?: number;
}

const FIXED_DT_MS = 150;
const MAX_CATCHUP_MS = 500;
const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

export class SnakeSession {
  private engine: SnakeEngine;
  private players: SnakePlayer[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private resultRecorded = false;
  private snapshotSeq = 0;
  private lastLoopHr: bigint | null = null;
  private accumulatorMs = 0;
  private disconnectGrace = new DisconnectGraceTimer<string>();
  private onSessionEnded?: () => void;
  private disconnectGraceMs: number;

  constructor(
    private identity: SnakeSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    engineConfig: SnakeEngineConfig = {},
    options: SnakeSessionOptions = {},
  ) {
    this.engine = new SnakeEngine(engineConfig);
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

  addPlayer(userId: string, connection: unknown): string | null {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) this.resumeExisting(existing);
      return existing.playerId;
    }
    if (this.players.length >= 2) return null;

    const playerId = `player${this.players.length + 1}`;
    this.players.push({
      userId,
      playerId,
      connected: true,
      connections: new Set([connection]),
    });

    this.engine.addSnake(playerId);

    if (this.identity.mode === 'single') {
      this.start();
    } else if (this.players.length === 2) {
      this.start();
    }

    return playerId;
  }

  private releaseConnection(player: SnakePlayer, connection: unknown): boolean {
    player.connections.delete(connection);
    return player.connections.size === 0;
  }

  private resumeExisting(player: SnakePlayer) {
    player.connected = true;
    this.disconnectGrace.disarm(player.userId);
    if (this.players.every((p) => p.connected)) this.start();
    this.broadcaster.broadcast(this.roomKey, {
      type: 'opponent_reconnected',
      payload: { playerId: player.playerId },
    });
  }

  pauseForDisconnect(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
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
      payload: { playerId: player.playerId, timeoutMs: this.disconnectGraceMs },
    });
    this.disconnectGrace.arm(userId, this.disconnectGraceMs, () =>
      this.forfeitDisconnected(userId),
    );
  }

  private forfeitDisconnected(userId: string) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player || player.connected) return;

    this.forfeitTo(userId);
    this.removePlayer(userId);
  }

  private detach(userId: string) {
    this.disconnectGrace.disarm(userId);
    this.forfeitTo(userId);
    this.removePlayer(userId);
  }

  private forfeitTo(userId: string) {
    const remaining = this.players.find(
      (p) => p.userId !== userId && p.connected,
    );
    if (!remaining || this.engine.getState().winner) return;

    this.engine.forceWinner(remaining.playerId);
    const state = this.broadcastSnapshot();
    if (!this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(state.winner!);
    }
  }

  private removePlayer(userId: string) {
    this.players = this.players.filter((p) => p.userId !== userId);
    this.stop();
    if (this.players.length === 0) this.onSessionEnded?.();
  }

  leave(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    if (!this.releaseConnection(player, connection)) return;

    this.detach(userId);
  }

  handleInput(userId: string, direction: string) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    this.engine.setDirection(player.playerId, direction as SnakeDirection);
  }

  getPublicConfig() {
    const config = this.engine.getConfig();
    return {
      width: config.width,
      height: config.height,
      initialSnakeLength: config.initialSnakeLength,
      winningScore: config.winningScore,
    };
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
    this.engine.tick();
    const state = this.broadcastSnapshot();

    if (state.winner && !this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(state.winner);
      this.stop();
    }
  }

  private broadcastSnapshot() {
    const state = this.engine.getState();
    this.snapshotSeq += 1;
    const payload = {
      seq: this.snapshotSeq,
      state,
    };
    const data = Buffer.from(JSON.stringify(payload));
    this.broadcaster.broadcastBinary(this.roomKey, data as any);
    return state;
  }

  private recordResult(winnerId: string) {
    if (this.players.length < 2) return;

    const results = this.players.map((player) => ({
      userId: player.userId,
      position: player.playerId === winnerId ? 1 : 2,
    }));

    this.gamification.recordGameResult({
      sessionId: this.identity.instanceId,
      guildId: this.identity.guildId,
      gameType: 'snake-game',
      results,
    });
  }
}
