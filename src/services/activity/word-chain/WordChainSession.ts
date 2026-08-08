import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { DisconnectGraceTimer } from '../shared/DisconnectGraceTimer';
import { WordChainEngine, type WordChainState } from './WordChainEngine';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
  broadcastBinary(key: string, data: ArrayBuffer): void;
}

export interface WordChainSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface WordChainSessionOptions {
  onSessionEnded?: () => void;
  disconnectGraceMs?: number;
}

interface WordChainPlayer {
  userId: string;
  connected: boolean;
  connections: Set<unknown>;
}

const DEFAULT_DISCONNECT_GRACE_MS = 30_000;
const TURN_TIMEOUT_MS = 10_000;

export class WordChainSession {
  private engine: WordChainEngine;
  private players: WordChainPlayer[] = [];
  private broadcaster: ActivityBroadcaster;
  private disconnectGrace = new DisconnectGraceTimer<string>();
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private gamification = new GamificationService();
  private sessionStartTime = Date.now();
  private onSessionEnded?: () => void;
  private disconnectGraceMs: number;

  constructor(
    private identity: WordChainSessionIdentity,
    broadcaster: ActivityBroadcaster,
    options: WordChainSessionOptions = {},
  ) {
    this.broadcaster = broadcaster;
    this.engine = new WordChainEngine();
    this.onSessionEnded = options.onSessionEnded;
    this.disconnectGraceMs =
      options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
  }

  get playerCount(): number {
    return this.players.length;
  }

  get state(): WordChainState {
    return this.engine.getState();
  }

  addPlayer(userId: string, connection: unknown): boolean {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) {
        existing.connected = true;
        this.disconnectGrace.disarm(userId);
      }
      return true;
    }

    this.players.push({
      userId,
      connected: true,
      connections: new Set([connection]),
    });

    this.engine.addPlayer(userId);
    this.broadcastState();

    if (this.players.length === 1) {
      this.startTurnTimer();
    }

    return true;
  }

  handleWordSubmission(userId: string, word: string): void {
    const result = this.engine.submitWord(userId, word);

    if (result.valid) {
      this.broadcastState();
      this.resetTurnTimer();

      if (this.engine.getState().gameOver) {
        this.endGame();
      }
    } else {
      const player = this.players.find((p) => p.userId === userId);
      if (player) {
        for (const _conn of player.connections) {
          this.broadcaster.broadcast(this.identity.sessionKey, {
            type: 'word_rejected',
            payload: { error: result.error },
          });
        }
      }
    }
  }

  pauseForDisconnect(userId: string, _client: unknown): void {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    player.connections.clear();
    player.connected = false;

    this.disconnectGrace.arm(userId, this.disconnectGraceMs, () => {
      this.eliminatePlayer(userId);
    });
  }

  leave(userId: string): void {
    this.eliminatePlayer(userId);
  }

  private eliminatePlayer(userId: string): void {
    const playerIndex = this.players.findIndex((p) => p.userId === userId);
    if (playerIndex >= 0) {
      this.players.splice(playerIndex, 1);
      this.engine.removePlayer(userId);
      this.broadcastState();

      if (this.engine.getState().gameOver) {
        this.endGame();
      }
    }
  }

  private startTurnTimer(): void {
    this.resetTurnTimer();
  }

  private resetTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);

    this.turnTimer = setTimeout(() => {
      const state = this.engine.getState();
      if (!state.gameOver) {
        this.eliminatePlayer(state.currentTurn);
      }
    }, TURN_TIMEOUT_MS);
  }

  private broadcastState(): void {
    const state = this.engine.getState();
    this.broadcaster.broadcast(this.identity.sessionKey, {
      type: 'state',
      payload: {
        gameOver: state.gameOver,
        winner: state.winner,
        currentTurn: state.currentTurn,
        currentWord: state.currentWord,
        usedWords: Array.from(state.usedWords),
        players: state.players,
      },
    });
  }

  private endGame(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.disconnectGrace.clear();

    const state = this.engine.getState();
    const durationMs = Date.now() - this.sessionStartTime;

    const results = state.players
      .filter((p) => p.alive)
      .map((p, idx) => ({
        userId: p.userId,
        position: idx === 0 ? 1 : 2,
      }));

    this.gamification.recordGameResult({
      sessionId: this.identity.sessionKey,
      guildId: this.identity.guildId,
      gameType: 'word-chain',
      durationMs,
      results,
    });

    this.broadcastState();
    this.onSessionEnded?.();
  }
}
