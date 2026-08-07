import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { BingoSpeedEngine, type BingoCard } from './BingoSpeedEngine';
import type { ActivityBroadcaster } from '../pong/PongSession';

interface BingoPlayer {
  userId: string;
  card: BingoCard;
  connected: boolean;
}

export interface BingoSpeedSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface BingoSpeedSessionOptions {
  drawIntervalMs?: number;
  onSessionEnded?: () => void;
}

export interface BingoSpeedPublicState {
  playerCount: number;
  drawnNumbers: number[];
  gameStarted: boolean;
  winner: string | null;
}

const DEFAULT_DRAW_INTERVAL_MS = 3000;

export class BingoSpeedSession {
  private engine: BingoSpeedEngine;
  private players: Map<string, BingoPlayer> = new Map();
  private drawInterval: ReturnType<typeof setInterval> | null = null;
  private resultRecorded = false;
  private winner: string | null = null;
  private drawIntervalMs: number;
  private onSessionEnded?: () => void;

  constructor(
    private identity: BingoSpeedSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    options: BingoSpeedSessionOptions = {},
  ) {
    this.engine = new BingoSpeedEngine();
    this.drawIntervalMs = options.drawIntervalMs ?? DEFAULT_DRAW_INTERVAL_MS;
    this.onSessionEnded = options.onSessionEnded;
  }

  get playerCount(): number {
    return this.players.size;
  }

  private get roomKey(): string {
    return this.identity.sessionKey;
  }

  addPlayer(userId: string, connection: unknown): BingoCard | null {
    const existing = this.players.get(userId);
    if (existing) {
      return existing.card;
    }

    if (this.players.size >= 4) return null; // Limit to 4 players

    const card = this.engine.generateCard();
    this.players.set(userId, {
      userId,
      card,
      connected: true,
    });

    return card;
  }

  removePlayer(userId: string): void {
    this.players.delete(userId);
    if (this.players.size === 0) {
      this.stop();
      this.onSessionEnded?.();
    }
  }

  start(): void {
    if (this.drawInterval) return;

    this.drawInterval = setInterval(() => this.tick(), this.drawIntervalMs);
    this.broadcaster.broadcast(this.roomKey, {
      type: 'game_started',
      payload: {},
    });
  }

  stop(): void {
    if (this.drawInterval) {
      clearInterval(this.drawInterval);
      this.drawInterval = null;
    }
  }

  private tick(): void {
    const number = this.engine.drawNumber();
    if (number === null) {
      this.stop();
      return;
    }

    // Mark the number on all player cards
    for (const player of this.players.values()) {
      this.engine.markNumber(player.card, number);
    }

    // Check for bingo
    for (const player of this.players.values()) {
      if (this.engine.checkBingo(player.card)) {
        this.winner = player.userId;
        if (!this.resultRecorded) {
          this.recordResult(player.userId);
          this.resultRecorded = true;
        }
        this.broadcastGameEnd(player.userId);
        this.stop();
        return;
      }
    }

    this.broadcastNumberDrawn(number);
  }

  markNumber(userId: string, number: number): void {
    const player = this.players.get(userId);
    if (!player) return;

    this.engine.markNumber(player.card, number);
  }

  claimBingo(userId: string): { success: boolean } | { error: string } {
    const player = this.players.get(userId);
    if (!player) {
      return { error: 'Player not found' };
    }

    if (!this.engine.checkBingo(player.card)) {
      return { error: 'No bingo on your card' };
    }

    if (!this.engine.verifyBingoClaim(player.card, 0)) {
      return { error: 'Bingo claim is invalid - not all numbers were drawn' };
    }

    this.winner = userId;
    if (!this.resultRecorded) {
      this.recordResult(userId);
      this.resultRecorded = true;
    }

    this.broadcastGameEnd(userId);
    this.stop();

    return { success: true };
  }

  private broadcastNumberDrawn(number: number): void {
    this.broadcaster.broadcast(this.roomKey, {
      type: 'number_drawn',
      payload: { number },
    });
  }

  private broadcastGameEnd(winnerId: string): void {
    this.broadcaster.broadcast(this.roomKey, {
      type: 'game_end',
      payload: { winner: winnerId },
    });
  }

  getPublicState(): BingoSpeedPublicState {
    return {
      playerCount: this.players.size,
      drawnNumbers: this.engine.getState().drawnNumbers,
      gameStarted: this.drawInterval !== null,
      winner: this.winner,
    };
  }

  getPlayerCard(userId: string): BingoCard | null {
    return this.players.get(userId)?.card ?? null;
  }

  private recordResult(winnerId: string): void {
    const players = Array.from(this.players.values());
    if (players.length < 2) return;

    this.gamification.recordGameResult({
      sessionId: this.identity.instanceId,
      guildId: this.identity.guildId,
      gameType: 'bingo-speed',
      results: players.map((player) => ({
        userId: player.userId,
        position: player.userId === winnerId ? 1 : 2,
      })),
    });
  }
}
