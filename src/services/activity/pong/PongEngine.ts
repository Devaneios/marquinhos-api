export type PaddleSide = 'left' | 'right';
export type PaddleInput = -1 | 0 | 1;

export interface PongEngineConfig {
  width?: number;
  height?: number;
  paddleHeight?: number;
  paddleWidth?: number;
  paddleSpeed?: number;
  ballRadius?: number;
  ballSpeed?: number;
  winningScore?: number;
  paddleHitAcceleration?: number;
  paddleSpinFactor?: number;
  maxBallSpeed?: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PongState {
  width: number;
  height: number;
  ball: Ball;
  paddles: { left: number; right: number };
  score: { left: number; right: number };
  winner: PaddleSide | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const PADDLE_SIDES = ['left', 'right'] as const;

export class PongEngine {
  private config: Required<PongEngineConfig>;
  private state: PongState;
  private input: { left: PaddleInput; right: PaddleInput } = {
    left: 0,
    right: 0,
  };

  constructor(config: PongEngineConfig = {}) {
    const ballSpeed = config.ballSpeed ?? 300;
    this.config = {
      width: config.width ?? 800,
      height: config.height ?? 480,
      paddleHeight: config.paddleHeight ?? 80,
      paddleWidth: config.paddleWidth ?? 12,
      paddleSpeed: config.paddleSpeed ?? 400,
      ballRadius: config.ballRadius ?? 8,
      ballSpeed,
      winningScore: config.winningScore ?? 5,
      paddleHitAcceleration: config.paddleHitAcceleration ?? 1.05,
      paddleSpinFactor: config.paddleSpinFactor ?? 0.3,
      // Otherwise paddleHitAcceleration compounds every hit with nothing to
      // stop it: a long rally eventually moves the ball further in one tick
      // than the paddle is wide, which the collision check can't see past.
      maxBallSpeed: config.maxBallSpeed ?? ballSpeed * 2.5,
    };
    this.state = this.initState();
  }

  reset() {
    this.input = { left: 0, right: 0 };
    this.state = this.initState();
  }

  forceWinner(side: PaddleSide) {
    if (this.state.winner) return;
    this.state.winner = side;
  }

  private initState(): PongState {
    return {
      width: this.config.width,
      height: this.config.height,
      ball: this.servingBall('right'),
      paddles: {
        left: (this.config.height - this.config.paddleHeight) / 2,
        right: (this.config.height - this.config.paddleHeight) / 2,
      },
      score: { left: 0, right: 0 },
      winner: null,
    };
  }

  getConfig(): Readonly<Required<PongEngineConfig>> {
    return this.config;
  }

  getState(): PongState {
    return {
      width: this.state.width,
      height: this.state.height,
      ball: { ...this.state.ball },
      paddles: { ...this.state.paddles },
      score: { ...this.state.score },
      winner: this.state.winner,
    };
  }

  setInput(side: PaddleSide, direction: PaddleInput) {
    this.input[side] = direction;
  }

  tick(dtMs: number) {
    if (this.state.winner) return;
    const dt = dtMs / 1000;

    this.movePaddles(dt);
    const ballOrigin = { x: this.state.ball.x, y: this.state.ball.y };
    this.moveBall(dt);
    this.handleWallBounce();
    this.handlePaddleCollision('left', ballOrigin);
    this.handlePaddleCollision('right', ballOrigin);
    this.handleScoring();
  }

  private movePaddles(dt: number) {
    for (const side of PADDLE_SIDES) {
      const next =
        this.state.paddles[side] +
        this.input[side] * this.config.paddleSpeed * dt;
      this.state.paddles[side] = clamp(
        next,
        0,
        this.config.height - this.config.paddleHeight,
      );
    }
  }

  private moveBall(dt: number) {
    this.state.ball.x += this.state.ball.vx * dt;
    this.state.ball.y += this.state.ball.vy * dt;
  }

  private handleWallBounce() {
    const r = this.config.ballRadius;
    if (this.state.ball.y - r <= 0) {
      this.state.ball.y = r;
      this.state.ball.vy = Math.abs(this.state.ball.vy);
    } else if (this.state.ball.y + r >= this.config.height) {
      this.state.ball.y = this.config.height - r;
      this.state.ball.vy = -Math.abs(this.state.ball.vy);
    }
  }

  private handlePaddleCollision(
    side: PaddleSide,
    ballOrigin: { x: number; y: number },
  ) {
    const r = this.config.ballRadius;
    const paddleY = this.state.paddles[side];
    const paddleX =
      side === 'left'
        ? this.config.paddleWidth
        : this.config.width - this.config.paddleWidth;

    const withinX =
      side === 'left'
        ? this.state.ball.x - r <= paddleX
        : this.state.ball.x + r >= paddleX;
    const movingToward =
      side === 'left' ? this.state.ball.vx < 0 : this.state.ball.vx > 0;
    if (!withinX || !movingToward) return;

    // A fast-enough ball can cross the paddle's whole plane within one
    // tick, so checking the y-range at wherever the tick left the ball can
    // miss a real hit (or register one that never happened). Interpolate
    // the y it actually had at the moment its path crossed the paddle's
    // x-plane instead.
    const dx = this.state.ball.x - ballOrigin.x;
    const crossT = dx !== 0 ? clamp((paddleX - ballOrigin.x) / dx, 0, 1) : 1;
    const impactY = ballOrigin.y + (this.state.ball.y - ballOrigin.y) * crossT;

    const withinY =
      impactY >= paddleY && impactY <= paddleY + this.config.paddleHeight;
    if (!withinY) return;

    this.state.ball.vx =
      -this.state.ball.vx * this.config.paddleHitAcceleration;
    this.state.ball.vy *= this.config.paddleHitAcceleration;
    this.state.ball.x = side === 'left' ? paddleX + r : paddleX - r;
    this.state.ball.y = impactY;

    const paddleVelocity = this.input[side] * this.config.paddleSpeed;
    this.state.ball.vy += paddleVelocity * this.config.paddleSpinFactor;

    this.clampBallSpeed();
  }

  private clampBallSpeed() {
    const speed = Math.hypot(this.state.ball.vx, this.state.ball.vy);
    if (speed <= this.config.maxBallSpeed) return;
    const scale = this.config.maxBallSpeed / speed;
    this.state.ball.vx *= scale;
    this.state.ball.vy *= scale;
  }

  private handleScoring() {
    if (this.state.ball.x < 0) {
      this.score('right');
    } else if (this.state.ball.x > this.config.width) {
      this.score('left');
    }
  }

  private score(side: PaddleSide) {
    this.state.score[side] += 1;
    if (this.state.score[side] >= this.config.winningScore) {
      this.state.winner = side;
      return;
    }
    this.state.ball = this.servingBall(side === 'left' ? 'right' : 'left');
  }

  private servingBall(servingTo: PaddleSide): Ball {
    const maxAngle = 0;
    const angle = (Math.random() * 2 - 1) * maxAngle;
    const direction = servingTo === 'right' ? 1 : -1;
    return {
      x: this.config.width / 2,
      y: this.config.height / 2,
      vx: direction * this.config.ballSpeed * Math.cos(angle),
      vy: this.config.ballSpeed * Math.sin(angle),
    };
  }
}
