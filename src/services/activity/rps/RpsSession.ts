import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { DisconnectGraceTimer } from '../shared/DisconnectGraceTimer';
import {
  RpsEngine,
  type RpsEngineConfig,
  type RoundResult,
} from './RpsEngine';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
}

interface RpsPlayer {
  userId: string;
  playerId: 'player1' | 'player2';
  connected: boolean;
  connections: Set<unknown>;
}

export interface RpsSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface RpsSessionOptions {
  onSessionEnded?: () => void;
  disconnectGraceMs?: number;
}

const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

export class RpsSession {
  private engine: RpsEngine;
  private players: RpsPlayer[] = [];
  private resultRecorded = false;
  private disconnectGrace = new DisconnectGraceTimer<string>();
  private onSessionEnded?: () => void;
  private disconnectGraceMs: number;

  constructor(
    private identity: RpsSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    engineConfig: RpsEngineConfig = {},
    options: RpsSessionOptions = {},
  ) {
    this.engine = new RpsEngine(engineConfig);
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

  addPlayer(userId: string, connection: unknown): 'player1' | 'player2' | null {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) this.resumeExisting(existing);
      return existing.playerId;
    }
    if (this.players.length >= 2) return null;

    const playerId: 'player1' | 'player2' =
      this.players.length === 0 ? 'player1' : 'player2';
    this.players.push({
      userId,
      playerId,
      connected: true,
      connections: new Set([connection]),
    });

    return playerId;
  }

  private resumeExisting(player: RpsPlayer) {
    player.connected = true;
    this.disconnectGrace.disarm(player.userId);
    this.broadcastState();
  }

  submitPick(userId: string, pick: unknown): boolean {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return false;

    const success = this.engine.submitPick(player.playerId, pick);
    if (!success) return false;

    const state = this.engine.getRoundState();
    this.broadcaster.broadcast(this.roomKey, {
      type: 'round_state',
      payload: state,
    });

    if (state.submitted.length === 2) {
      const roundResult = this.engine.resolveRound();
      this.broadcaster.broadcast(this.roomKey, {
        type: 'round_result',
        payload: roundResult,
      });

      const matchWinner = this.engine.getMatchWinner();
      if (matchWinner) {
        this.endMatch(matchWinner);
      }
    }

    return true;
  }

  private endMatch(winnerId: string) {
    if (this.resultRecorded) return;
    this.resultRecorded = true;

    const winner = this.players.find((p) => p.playerId === winnerId);
    if (!winner) return;

    this.broadcaster.broadcast(this.roomKey, {
      type: 'match_end',
      payload: {
        winner: winner.userId,
        history: this.engine.getRoundHistory(),
      },
    });

    this.gamification.recordGameResult({
      sessionId: this.identity.sessionKey,
      guildId: this.identity.guildId,
      gameType: 'rock-paper-scissors',
      results: {
        winner: winner.userId,
        players: this.players.map((p) => p.userId),
      },
    });

    if (this.onSessionEnded) {
      this.onSessionEnded();
    }
  }

  private broadcastState() {
    const state = this.engine.getRoundState();
    this.broadcaster.broadcast(this.roomKey, {
      type: 'round_state',
      payload: state,
    });
  }

  pauseForDisconnect(userId: string, _connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    player.connections.forEach((conn) => {
      if (conn === _connection) player.connections.delete(conn);
    });

    if (player.connections.size === 0) {
      player.connected = false;
      this.disconnectGrace.arm(userId, this.disconnectGraceMs, () => {
        this.forceLeave(userId);
      });
    }
  }

  private forceLeave(userId: string) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    const otherPlayer = this.players.find((p) => p.userId !== userId);
    if (otherPlayer && !this.resultRecorded) {
      this.endMatch(otherPlayer.playerId);
    }
  }

  getPublicConfig(): object {
    return {
      bestOf: this.engine.getRoundState().bestOf,
    };
  }
}
