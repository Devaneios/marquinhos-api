import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { DisconnectGraceTimer } from '../shared/DisconnectGraceTimer';
import { SeededRng } from '../cards/core/rng';
import { TowerEngine, type TowerState } from './TowerEngine';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
}

interface TowerPlayer {
  userId: string;
  connected: boolean;
  connections: Set<unknown>;
}

export interface TowerSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface TowerSessionOptions {
  onSessionEnded?: () => void;
  disconnectGraceMs?: number;
  // Only for tests: pins the tower's topple rolls to a known sequence
  // instead of a fresh SeededRng.randomSeed() every match.
  seed?: number;
}

const MAX_PLAYERS = 2;
const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

export class TowerSession {
  private engine: TowerEngine | null = null;
  private players: TowerPlayer[] = [];
  private resultRecorded = false;
  private restartVotes = new Set<string>();
  private disconnectGrace = new DisconnectGraceTimer<string>();
  private onSessionEnded?: () => void;
  private disconnectGraceMs: number;
  private seed?: number;

  constructor(
    private identity: TowerSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    options: TowerSessionOptions = {},
  ) {
    this.onSessionEnded = options.onSessionEnded;
    this.disconnectGraceMs =
      options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
    this.seed = options.seed;
  }

  get playerCount(): number {
    return this.players.length;
  }

  private get roomKey(): string {
    return this.identity.sessionKey;
  }

  addPlayer(userId: string, connection: unknown): boolean {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) this.resumeExisting(existing);
      return true;
    }
    if (this.players.length >= MAX_PLAYERS) return false;
    this.players.push({
      userId,
      connected: true,
      connections: new Set([connection]),
    });

    if (this.players.length === MAX_PLAYERS) {
      this.engine = new TowerEngine(
        this.players.map((p) => p.userId),
        this.seed ?? SeededRng.randomSeed(),
      );
    }
    return true;
  }

  private releaseConnection(player: TowerPlayer, connection: unknown): boolean {
    player.connections.delete(connection);
    return player.connections.size === 0;
  }

  private resumeExisting(player: TowerPlayer) {
    player.connected = true;
    this.disconnectGrace.disarm(player.userId);
    this.broadcaster.broadcast(this.roomKey, {
      type: 'opponent_reconnected',
      payload: { userId: player.userId },
    });
  }

  pauseForDisconnect(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    if (!this.releaseConnection(player, connection)) return;

    const state = this.engine?.getState();
    if (this.identity.mode !== 'multi' || !state || state.status === 'ended') {
      this.detach(userId);
      return;
    }
    if (!player.connected) return;

    player.connected = false;
    this.broadcaster.broadcast(this.roomKey, {
      type: 'opponent_disconnected',
      payload: { userId, timeoutMs: this.disconnectGraceMs },
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
    if (!this.engine) return;
    const state = this.engine.getState();
    if (state.status === 'ended') return;

    this.engine.forceEliminate(userId);
    const updated = this.broadcastState();
    if (!this.resultRecorded && updated.status === 'ended' && updated.winner) {
      this.resultRecorded = true;
      this.recordResult(updated.winner);
    }
  }

  private removePlayer(userId: string) {
    this.players = this.players.filter((p) => p.userId !== userId);
    this.restartVotes.delete(userId);
    if (this.players.length === 0) this.onSessionEnded?.();
  }

  leave(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    if (!this.releaseConnection(player, connection)) return;

    this.detach(userId);
  }

  handlePull(userId: string, level: number, position: number) {
    if (!this.players.some((p) => p.userId === userId)) return;
    if (!this.engine) return;

    const result = this.engine.pull(userId, level, position);

    if (!result.success) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'pull_error',
        payload: { error: result.error },
      });
      return;
    }

    const state = this.broadcastState();

    if (state.status === 'ended' && state.winner && !this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(state.winner);
    }
  }

  private broadcastState(): TowerState {
    const state = this.engine!.getState();
    this.broadcaster.broadcast(this.roomKey, {
      type: 'state_update',
      payload: state,
    });
    return state;
  }

  requestRestart(userId: string) {
    const state = this.engine?.getState();
    if (!state || state.status !== 'ended') return;
    if (!this.players.some((p) => p.userId === userId)) return;

    this.restartVotes.add(userId);
    const required = this.players.length;

    if (this.restartVotes.size < required) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'restart_status',
        payload: { votes: this.restartVotes.size, required },
      });
      return;
    }

    this.restartVotes.clear();
    this.resultRecorded = false;
    this.engine = new TowerEngine(
      this.players.map((p) => p.userId),
      this.seed ?? SeededRng.randomSeed(),
    );
    this.broadcastState();
  }

  getPublicState(): TowerState | null {
    return this.engine?.getState() ?? null;
  }

  private recordResult(winner: string) {
    if (this.players.length < 2) return;
    this.gamification.recordGameResult({
      sessionId: this.identity.instanceId,
      guildId: this.identity.guildId,
      gameType: 'tower-unstable',
      results: this.players.map((player) => ({
        userId: player.userId,
        position: player.userId === winner ? 1 : 2,
      })),
    });
  }
}
