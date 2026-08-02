import { GamificationService } from '../../gamification';
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
}

const FIXED_DT_MS = 8;
const MAX_CATCHUP_MS = 250;

export class PongSession {
  private engine: PongEngine;
  private players: PongPlayer[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private resultRecorded = false;
  private hasBot = false;
  private botTargetY: number | null = null;
  private botReactionElapsedMs = 0;
  private restartVotes = new Set<string>();
  private snapshotSeq = 0;
  private lastInputSeq: { left: number; right: number } = {
    left: 0,
    right: 0,
  };
  private lastLoopHr: bigint | null = null;
  private accumulatorMs = 0;

  private static readonly BOT_REACTION_MS = 250;
  private static readonly BOT_AIM_ERROR = 40;
  private static readonly BOT_DEAD_ZONE = 14;

  constructor(
    private instanceId: string,
    private guildId: string,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    engineConfig: PongEngineConfig = {},
  ) {
    this.engine = new PongEngine(engineConfig);
  }

  get playerCount(): number {
    return this.players.length;
  }

  addPlayer(userId: string): PaddleSide | null {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) return existing.side;
    if (this.players.length >= 2) return null;
    const side: PaddleSide = this.players.length === 0 ? 'left' : 'right';
    this.players.push({ userId, side });
    return side;
  }

  removePlayer(userId: string) {
    this.players = this.players.filter((p) => p.userId !== userId);
  }

  handleInput(userId: string, direction: -1 | 0 | 1, seq = 0) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    this.engine.setInput(player.side, direction);
    this.lastInputSeq[player.side] = Math.max(
      this.lastInputSeq[player.side],
      seq,
    );
  }

  enableBot() {
    this.hasBot = true;
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
    const required = this.hasBot ? 1 : this.players.length;

    if (this.restartVotes.size < required) {
      this.broadcaster.broadcast(this.instanceId, {
        type: 'restart_status',
        payload: { votes: this.restartVotes.size, required },
      });
      return;
    }

    this.restartVotes.clear();
    this.resultRecorded = false;
    this.engine.reset();
    this.start();
    this.snapshotSeq += 1;
    this.broadcaster.broadcastBinary(
      this.instanceId,
      encodeStateSnapshot(
        this.snapshotSeq,
        this.lastInputSeq.left,
        this.lastInputSeq.right,
        this.engine.getState(),
      ),
    );
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
    const state = this.engine.getState();
    this.snapshotSeq += 1;
    this.broadcaster.broadcastBinary(
      this.instanceId,
      encodeStateSnapshot(
        this.snapshotSeq,
        this.lastInputSeq.left,
        this.lastInputSeq.right,
        state,
      ),
    );

    if (state.winner && !this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(state.winner);
      this.stop();
    }
  }

  private updateBot(state: PongState) {
    if (!this.hasBot) return;
    const config = this.engine.getConfig();

    this.botReactionElapsedMs += FIXED_DT_MS;
    const ballIncoming = state.ball.vx > 0;
    if (
      this.botTargetY === null ||
      this.botReactionElapsedMs >= PongSession.BOT_REACTION_MS
    ) {
      this.botReactionElapsedMs = 0;
      const error = (Math.random() * 2 - 1) * PongSession.BOT_AIM_ERROR;
      this.botTargetY = ballIncoming ? state.ball.y + error : config.height / 2;
    }

    const paddleCenter = state.paddles.right + config.paddleHeight / 2;
    const deadZone = PongSession.BOT_DEAD_ZONE;
    if (this.botTargetY < paddleCenter - deadZone) {
      this.engine.setInput('right', -1);
    } else if (this.botTargetY > paddleCenter + deadZone) {
      this.engine.setInput('right', 1);
    } else {
      this.engine.setInput('right', 0);
    }
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
