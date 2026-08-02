import { describe, expect, it } from 'bun:test';
import { PongSession } from '../src/services/activity/pong/PongSession';
import type { GamificationService } from '../src/services/gamification';

interface DecodedSnapshot {
  seq: number;
  ackLeft: number;
  ackRight: number;
  paddles: { left: number; right: number };
  ball: { x: number; y: number };
  score: { left: number; right: number };
  winner: 'left' | 'right' | null;
}

function decodeStateSnapshot(buffer: ArrayBuffer): DecodedSnapshot {
  const view = new DataView(buffer);
  const winnerByte = view.getUint8(30);
  return {
    seq: view.getUint32(0),
    ackLeft: view.getUint32(4),
    ackRight: view.getUint32(8),
    paddles: {
      left: view.getFloat32(12),
      right: view.getFloat32(16),
    },
    ball: {
      x: view.getFloat32(20),
      y: view.getFloat32(24),
    },
    score: {
      left: view.getUint8(28),
      right: view.getUint8(29),
    },
    winner: winnerByte === 1 ? 'left' : winnerByte === 2 ? 'right' : null,
  };
}

function fakeBroadcaster() {
  const messages: { instanceId: string; message: unknown }[] = [];
  const snapshots: { instanceId: string; snapshot: DecodedSnapshot }[] = [];
  return {
    broadcast: (instanceId: string, message: unknown) => {
      messages.push({ instanceId, message });
    },
    broadcastBinary: (instanceId: string, data: ArrayBuffer) => {
      snapshots.push({ instanceId, snapshot: decodeStateSnapshot(data) });
    },
    messages,
    snapshots,
  };
}

describe('PongSession', () => {
  it('assigns the first player to left and the second to right', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);

    expect(session.addPlayer('user-a')).toBe('left');
    expect(session.addPlayer('user-b')).toBe('right');
  });

  it('returns the same side for a player already in the session', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);

    session.addPlayer('user-a');
    expect(session.addPlayer('user-a')).toBe('left');
  });

  it('rejects a third player', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);

    session.addPlayer('user-a');
    session.addPlayer('user-b');
    expect(session.addPlayer('user-c')).toBeNull();
  });

  it('broadcasts state to the instance room on each tick', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);
    session.addPlayer('user-a');
    session.addPlayer('user-b');

    session.tick();

    expect(broadcaster.snapshots.length).toBe(1);
    expect(broadcaster.snapshots[0]!.instanceId).toBe('inst-1');
  });

  it("routes input to the player's own paddle", () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);
    session.addPlayer('user-a'); // left
    session.addPlayer('user-b'); // right

    session.handleInput('user-a', -1);
    session.tick();

    const { paddles } = broadcaster.snapshots[0]!.snapshot;
    expect(paddles.left).toBeLessThan((480 - 80) / 2);
  });

  it('ignores input from a userId that is not part of the session', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);
    session.addPlayer('user-a');

    expect(() => session.handleInput('stranger', 1)).not.toThrow();
  });

  it('records a game result exactly once when a winner emerges', () => {
    const broadcaster = fakeBroadcaster();
    const recorded: unknown[] = [];
    const fakeGamification = {
      recordGameResult: (input: unknown) => recorded.push(input),
    } as unknown as GamificationService;

    const session = new PongSession(
      'inst-1',
      'guild-1',
      broadcaster,
      fakeGamification,
      { winningScore: 1 },
    );
    session.addPlayer('user-a'); // left
    session.addPlayer('user-b'); // right

    // Ball already past the right edge — left concedes the winning point.
    // Move the right paddle out of the ball's y-range so it doesn't block the shot.
    (session as any).engine.state.paddles.right = 400;
    (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
    session.tick();
    session.tick(); // frozen match, must not record a second time

    expect(recorded).toEqual([
      {
        sessionId: 'inst-1',
        guildId: 'guild-1',
        gameType: 'pong',
        results: [
          { userId: 'user-a', position: 1 },
          { userId: 'user-b', position: 2 },
        ],
      },
    ]);
  });

  it('moves the bot-controlled right paddle toward the ball when enabled', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);
    session.addPlayer('user-a'); // left
    session.enableBot();

    (session as any).engine.state.paddles.right = 0;
    (session as any).engine.state.ball = { x: 700, y: 400, vx: 100, vy: 0 };
    session.tick();

    const { paddles } = broadcaster.snapshots[0]!.snapshot;
    expect(paddles.right).toBeGreaterThan(0);
  });

  it('starts and reaches a winner in a solo bot game without a second player', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(
      'inst-1',
      'guild-1',
      broadcaster,
      undefined,
      { winningScore: 1 },
    );
    session.addPlayer('user-a'); // left
    session.enableBot();

    (session as any).engine.state.paddles.left = 400;
    (session as any).engine.state.ball = { x: -10, y: 240, vx: -100, vy: 0 };
    session.tick();

    expect(broadcaster.snapshots[0]!.snapshot.winner).toBe('right');
  });

  it('does not record a result if a player left before a winner emerged', () => {
    const broadcaster = fakeBroadcaster();
    const recorded: unknown[] = [];
    const fakeGamification = {
      recordGameResult: (input: unknown) => recorded.push(input),
    } as unknown as GamificationService;

    const session = new PongSession(
      'inst-1',
      'guild-1',
      broadcaster,
      fakeGamification,
      { winningScore: 1 },
    );
    session.addPlayer('user-a');
    session.removePlayer('user-a');

    (session as any).engine.state.paddles.right = 400;
    (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
    session.tick();

    expect(recorded).toEqual([]);
  });

  it('ignores a restart request while the game is still in progress', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession('inst-1', 'guild-1', broadcaster);
    session.addPlayer('user-a');
    session.addPlayer('user-b');

    session.requestRestart('user-a');

    expect(broadcaster.messages).toEqual([]);
  });

  it('broadcasts restart_status after one of two players votes to restart', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(
      'inst-1',
      'guild-1',
      broadcaster,
      undefined,
      { winningScore: 1 },
    );
    session.addPlayer('user-a'); // left
    session.addPlayer('user-b'); // right
    (session as any).engine.state.paddles.right = 400;
    (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
    session.tick(); // left wins

    session.requestRestart('user-a');

    const last = broadcaster.messages[broadcaster.messages.length - 1]!
      .message as {
      type: string;
      payload: { votes: number; required: number };
    };
    expect(last.type).toBe('restart_status');
    expect(last.payload).toEqual({ votes: 1, required: 2 });
  });

  it('resets the game once both players vote to restart', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(
      'inst-1',
      'guild-1',
      broadcaster,
      undefined,
      { winningScore: 1 },
    );
    session.addPlayer('user-a'); // left
    session.addPlayer('user-b'); // right
    (session as any).engine.state.paddles.right = 400;
    (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
    session.tick(); // left wins, interval stopped

    session.requestRestart('user-a');
    session.requestRestart('user-b');

    const last =
      broadcaster.snapshots[broadcaster.snapshots.length - 1]!.snapshot;
    expect(last.winner).toBeNull();
    expect(last.score).toEqual({ left: 0, right: 0 });
  });

  it('lets a single restart vote suffice in bot mode', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(
      'inst-1',
      'guild-1',
      broadcaster,
      undefined,
      { winningScore: 1 },
    );
    session.addPlayer('user-a'); // left
    session.enableBot();
    (session as any).engine.state.paddles.left = 400;
    (session as any).engine.state.ball = { x: -10, y: 240, vx: -100, vy: 0 };
    session.tick(); // right (bot) wins

    session.requestRestart('user-a');

    const last =
      broadcaster.snapshots[broadcaster.snapshots.length - 1]!.snapshot;
    expect(last.winner).toBeNull();
  });

  it('records a new result after a restart and a second win', () => {
    const broadcaster = fakeBroadcaster();
    const recorded: unknown[] = [];
    const fakeGamification = {
      recordGameResult: (input: unknown) => recorded.push(input),
    } as unknown as GamificationService;

    const session = new PongSession(
      'inst-1',
      'guild-1',
      broadcaster,
      fakeGamification,
      { winningScore: 1 },
    );
    session.addPlayer('user-a'); // left
    session.addPlayer('user-b'); // right
    (session as any).engine.state.paddles.right = 400;
    (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
    session.tick(); // left wins (1st result)

    session.requestRestart('user-a');
    session.requestRestart('user-b'); // resets and restarts the interval

    (session as any).engine.state.paddles.right = 400;
    (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
    session.tick(); // left wins again (2nd result)
    session.stop();

    expect(recorded.length).toBe(2);
  });
});
