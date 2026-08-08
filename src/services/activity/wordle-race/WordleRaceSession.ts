import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { WordleRaceEngine } from './WordleRaceEngine';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
}

interface WordleRaceSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

interface WordleRacePlayer {
  userId: string;
  connected: boolean;
  connections: Set<unknown>;
}

export interface WordleRaceSessionOptions {
  onSessionEnded?: () => void;
}

export class WordleRaceSession {
  private engine: WordleRaceEngine;
  private players: WordleRacePlayer[] = [];
  private roomKey: string;
  private gamification: GamificationService;
  private resultRecorded = false;
  private onSessionEnded?: () => void;

  constructor(
    private identity: WordleRaceSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    gamification: GamificationService = new GamificationService(),
    options: WordleRaceSessionOptions = {},
  ) {
    this.roomKey = identity.sessionKey;
    this.gamification = gamification;
    this.onSessionEnded = options.onSessionEnded;

    const targetWord = this.pickRandomWord();
    this.engine = new WordleRaceEngine(targetWord, Date.now());
  }

  private pickRandomWord(): string {
    const wordlist = [
      'abrir',
      'acaso',
      'aceno',
      'aceso',
      'aceto',
      'achar',
      'acima',
      'acaba',
      'acabo',
      'acaju',
      'acari',
      'adaga',
      'adega',
      'adeus',
      'adiar',
      'adobe',
      'adubo',
      'afago',
      'afeto',
      'afiar',
      'agave',
      'agora',
      'aguar',
      'agudo',
      'ainda',
      'ajuda',
      'alado',
      'alama',
      'alano',
      'alces',
      'alelo',
      'aleta',
      'alfas',
      'algar',
      'algoz',
      'alias',
      'alibe',
      'alice',
      'aliei',
      'aliem',
      'alier',
      'alies',
      'alifs',
      'alijo',
      'alila',
      'alima',
      'alimo',
      'aline',
    ];
    return wordlist[Math.floor(Math.random() * wordlist.length)]!;
  }

  get playerCount(): number {
    return this.players.length;
  }

  addPlayer(userId: string, connection: unknown): void {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      existing.connected = true;
      this.engine.addPlayer(userId);
      this.broadcastPlayerJoined(userId);
      return;
    }

    this.players.push({
      userId,
      connected: true,
      connections: new Set([connection]),
    });
    this.engine.addPlayer(userId);
    this.broadcastPlayerJoined(userId);
  }

  private releaseConnection(
    player: WordleRacePlayer,
    connection: unknown,
  ): boolean {
    player.connections.delete(connection);
    return player.connections.size === 0;
  }

  leave(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    if (!this.releaseConnection(player, connection)) return;

    player.connected = false;
    this.engine.removePlayer(userId);
    this.broadcastPlayerLeft(userId);

    if (this.engine.isGameOver()) {
      this.endGame();
    }
  }

  submitGuess(userId: string, guess: string): void {
    const result = this.engine.submitGuess(userId, guess);

    if ('error' in result) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'guess_error',
        payload: { userId, error: result.error },
      });
      return;
    }

    const engineState = this.engine.getState();
    const player = engineState.players.get(userId);

    this.broadcaster.broadcast(this.roomKey, {
      type: 'guess_submitted',
      payload: {
        userId,
        guess,
        feedback: result.feedback,
        attempts: player?.attempts ?? 0,
        solved: result.solved,
      },
    });

    if (result.solved) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'player_solved',
        payload: {
          userId,
          firstSolver: engineState.firstSolver === userId,
        },
      });
    }

    if (player?.exhausted) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'player_exhausted',
        payload: { userId },
      });
    }

    if (this.engine.isGameOver()) {
      this.endGame();
    }
  }

  private broadcastPlayerJoined(userId: string) {
    this.broadcaster.broadcast(this.roomKey, {
      type: 'player_joined',
      payload: {
        userId,
        targetWordLength: this.engine.getTargetWord().length,
        maxAttempts: this.engine.getMaxAttempts(),
        totalPlayers: this.players.length,
      },
    });
  }

  private broadcastPlayerLeft(userId: string) {
    this.broadcaster.broadcast(this.roomKey, {
      type: 'player_left',
      payload: { userId },
    });
  }

  private endGame() {
    if (this.resultRecorded) return;
    this.resultRecorded = true;

    const engineState = this.engine.getState();
    const results = Array.from(engineState.players.values())
      .sort((a, b) => {
        if (a.solved && !b.solved) return -1;
        if (!a.solved && b.solved) return 1;
        return a.attempts - b.attempts;
      })
      .map((player, index) => ({
        userId: player.userId,
        position: index + 1,
        solved: player.solved,
      }));

    this.broadcaster.broadcast(this.roomKey, {
      type: 'game_ended',
      payload: {
        targetWord: engineState.targetWord,
        results,
      },
    });

    try {
      this.gamification.recordGameResult({
        sessionId: this.roomKey,
        guildId: this.identity.guildId,
        gameType: 'wordle-race',
        results: results.map((r) => ({
          userId: r.userId,
          position: r.position,
        })),
      });
    } catch (err) {
      console.error('Failed to record game result:', err);
    }

    if (this.onSessionEnded) {
      setTimeout(() => this.onSessionEnded?.(), 3000);
    }
  }

  getGameState() {
    const engineState = this.engine.getState();
    return {
      targetWordLength: engineState.targetWord.length,
      maxAttempts: this.engine.getMaxAttempts(),
      players: Array.from(engineState.players.entries()).map(
        ([userId, player]) => ({
          userId,
          attempts: player.attempts,
          solved: player.solved,
          exhausted: player.exhausted,
          guesses: player.guesses,
        }),
      ),
      firstSolver: engineState.firstSolver,
      gameOver: this.engine.isGameOver(),
    };
  }
}
