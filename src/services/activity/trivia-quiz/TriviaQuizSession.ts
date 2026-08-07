import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { TriviaQuizEngine } from './TriviaQuizEngine';
import type { TriviaQuizState } from './types';
import { getQuestions } from './questions';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
}

export interface TriviaQuizSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

interface TriviaQuizPlayer {
  userId: string;
  connected: boolean;
  connections: Set<unknown>;
}

export class TriviaQuizSession {
  private engine: TriviaQuizEngine;
  private players: TriviaQuizPlayer[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private resultRecorded = false;

  constructor(
    private identity: TriviaQuizSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
  ) {
    this.engine = new TriviaQuizEngine(getQuestions());
  }

  addPlayer(userId: string, connection: unknown): boolean {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) {
        existing.connected = true;
      }
      return true;
    }
    if (this.players.length >= 8) return false;

    try {
      this.engine.addPlayer(userId);
    } catch {
      return false;
    }

    this.players.push({
      userId,
      connected: true,
      connections: new Set([connection]),
    });

    this.broadcastState();
    return true;
  }

  handleAnswer(userId: string, answerIndex: number, submittedAtMs: number): void {
    const accepted = this.engine.submitAnswer(userId, answerIndex, submittedAtMs);
    if (!accepted) return;

    this.broadcastState();

    const state = this.engine.getState();
    const allAnswered = this.players.every((p) => state.playerAnswers.has(p.userId));
    if (allAnswered) {
      this.advanceToNextQuestion();
    }
  }

  tick(): void {
    const { questionEnded } = this.engine.tick(0);
    if (!questionEnded) return;

    this.advanceToNextQuestion();
  }

  private advanceToNextQuestion(): void {
    const hasNext = this.engine.advanceQuestion();
    if (hasNext) {
      this.broadcastState();
    } else {
      this.finishGame();
    }
  }

  private finishGame(): void {
    if (this.resultRecorded) return;
    this.resultRecorded = true;

    const leaderboard = this.engine.getLeaderboard();
    this.broadcast('game_end', { leaderboard });

    const results = leaderboard.map((entry, index) => ({
      userId: entry.userId,
      position: index + 1,
    }));

    this.gamification.recordGameResult({
      sessionId: this.identity.sessionKey,
      guildId: this.identity.guildId,
      gameType: 'trivia-quiz',
      results,
    });

    if (this.interval) clearInterval(this.interval);
  }

  private broadcastState(): void {
    const state = this.engine.getState();
    const question = state.questions[state.currentQuestionIndex];

    if (!question) return;

    this.broadcast('state_update', {
      currentQuestionIndex: state.currentQuestionIndex,
      questionText: question.text,
      options: question.options,
      questionStartedAtMs: state.questionStartedAtMs,
      questionTimerMs: state.questionTimerMs,
      playerScores: Array.from(state.players.entries()).map(([, p]) => ({
        userId: p.userId,
        score: p.totalScore,
      })),
      finished: state.finished,
    });
  }

  private broadcast(type: string, payload: unknown): void {
    this.broadcaster.broadcast('trivia-quiz', {
      type,
      payload,
    });
  }

  start(): void {
    this.engine.startGame();
    this.broadcastState();

    this.interval = setInterval(() => {
      this.tick();
    }, 100);
  }

  getState(): TriviaQuizState {
    return this.engine.getState();
  }

  getLeaderboard(): { userId: string; score: number }[] {
    return this.engine.getLeaderboard();
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
  }
}
