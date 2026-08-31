import { describe, expect, it } from 'bun:test';
import type { ActivityMode } from 'services/activity/gameId';
import { BOT_TUNING } from 'services/activity/pong/PongBotAI';
import {
  PongSession,
  type PongSessionIdentity,
} from 'services/activity/pong/PongSession';
import type { GamificationService } from 'services/gamification';

function identity(mode: ActivityMode = 'multi'): PongSessionIdentity {
  return {
    sessionKey: `inst-1:pong:${mode}`,
    instanceId: 'inst-1',
    guildId: 'guild-1',
    mode,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const messages: { key: string; message: unknown }[] = [];
  const snapshots: { key: string; snapshot: DecodedSnapshot }[] = [];
  return {
    broadcast: (key: string, message: unknown) => {
      messages.push({ key, message });
    },
    broadcastBinary: (key: string, data: ArrayBuffer) => {
      snapshots.push({ key, snapshot: decodeStateSnapshot(data) });
    },
    messages,
    snapshots,
  };
}

describe('PongSession', () => {
  it('assigns the first player to left and the second to right', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);

    expect(session.addPlayer('user-a', 'conn-a')).toBe('left');
    expect(session.addPlayer('user-b', 'conn-b')).toBe('right');
  });

  it('returns the same side for a player already in the session', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);

    session.addPlayer('user-a', 'conn-a');
    expect(session.addPlayer('user-a', 'conn-a')).toBe('left');
  });

  it('rejects a third player', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);

    session.addPlayer('user-a', 'conn-a');
    session.addPlayer('user-b', 'conn-b');
    expect(session.addPlayer('user-c', 'conn-c')).toBeNull();
  });

  it('broadcasts state into its own session room on each tick', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a');
    session.addPlayer('user-b', 'conn-b');

    session.tick();

    expect(broadcaster.snapshots.length).toBe(1);
    expect(broadcaster.snapshots[0]!.key).toBe('inst-1:pong:multi');
  });

  it('broadcasts into the key it was given, never one derived from instanceId', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity('single'), broadcaster);
    session.addPlayer('user-a', 'conn-a');

    session.tick();

    expect(broadcaster.snapshots[0]!.key).toBe('inst-1:pong:single');
  });

  it("routes input to the player's own paddle", () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a'); // left
    session.addPlayer('user-b', 'conn-b'); // right

    session.handleInput('user-a', -1);
    session.tick();

    const { paddles } = broadcaster.snapshots[0]!.snapshot;
    expect(paddles.left).toBeLessThan((480 - 80) / 2);
  });

  it('ignores input from a userId that is not part of the session', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a');

    expect(() => session.handleInput('stranger', 1)).not.toThrow();
  });

  it('records a game result exactly once when a winner emerges', () => {
    const broadcaster = fakeBroadcaster();
    const recorded: unknown[] = [];
    const fakeGamification = {
      recordGameResult: (input: unknown) => recorded.push(input),
    } as unknown as GamificationService;

    const session = new PongSession(identity(), broadcaster, fakeGamification, {
      winningScore: 1,
    });
    session.addPlayer('user-a', 'conn-a'); // left
    session.addPlayer('user-b', 'conn-b'); // right

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
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a'); // left
    session.enableBot();

    (session as any).engine.state.paddles.right = 0;
    (session as any).engine.state.ball = { x: 700, y: 400, vx: 100, vy: 0 };
    session.tick();

    const { paddles } = broadcaster.snapshots[0]!.snapshot;
    expect(paddles.right).toBeGreaterThan(0);
  });

  it("anticipates a wall bounce instead of chasing the ball's current position", () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a'); // left
    session.enableBot(undefined, 'hard'); // aimError 0, deadZone 4 -> deterministic

    // Ball heading toward the bot (right) at a steep downward angle: it
    // will hit the bottom wall and bounce back up before arriving, landing
    // around y=280. A naive "aim at ball.y" bot would target 400 instead
    // (400 px off) and see the paddle, already centered on 400, as
    // correctly positioned -> no movement. The predictive bot must move up
    // toward the real landing spot right away.
    (session as any).engine.state.paddles.right = 360; // center = 400
    (session as any).engine.state.ball = { x: 700, y: 400, vx: 100, vy: 300 };
    session.tick();

    const { paddles } = broadcaster.snapshots[0]!.snapshot;
    expect(paddles.right).toBeLessThan(360);
  });

  it('defaults the bot to normal difficulty tuning when none is requested', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a');
    session.enableBot();

    expect((session as any).bot.tuning).toEqual(BOT_TUNING.normal);
  });

  it('tunes the bot according to the requested difficulty', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a');
    session.enableBot(undefined, 'easy');

    expect((session as any).bot.tuning).toEqual(BOT_TUNING.easy);
  });

  it('drives whichever side is not the sole human player, not always right', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    // A stale player already occupies 'left' (e.g. an abandoned earlier
    // attempt that never disconnected), so the real single-player joiner
    // lands on 'right' instead of the usual 'left'.
    session.addPlayer('ghost-left', 'conn-ghost'); // occupies 'left' and never leaves
    session.addPlayer('user-a', 'conn-a'); // the real human ends up on 'right'
    session.enableBot('right');

    (session as any).engine.state.paddles.left = 0;
    (session as any).engine.state.ball = { x: 100, y: 400, vx: -100, vy: 0 };
    session.tick();

    const { paddles } = broadcaster.snapshots[0]!.snapshot;
    expect(paddles.left).toBeGreaterThan(0);
  });

  it("never overrides the human player's own paddle input when the human is on the right", () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('ghost-left', 'conn-ghost');
    session.addPlayer('user-a', 'conn-a'); // human ends up on 'right'
    session.enableBot('right');

    session.handleInput('user-a', -1); // human wants to move up
    (session as any).engine.state.paddles.right = 200;
    // Ball moving away from the human's own paddle — bot logic (if it were
    // still driving 'right') would try to recenter it, fighting the input.
    (session as any).engine.state.ball = { x: 100, y: 400, vx: -100, vy: 0 };
    session.tick();

    const { paddles } = broadcaster.snapshots[0]!.snapshot;
    expect(paddles.right).toBeLessThan(200);
  });

  it('starts and reaches a winner in a solo bot game without a second player', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster, undefined, {
      winningScore: 1,
    });
    session.addPlayer('user-a', 'conn-a'); // left
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

    const session = new PongSession(identity(), broadcaster, fakeGamification, {
      winningScore: 1,
    });
    session.addPlayer('user-a', 'conn-a');
    session.leave('user-a', 'conn-a');

    (session as any).engine.state.paddles.right = 400;
    (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
    session.tick();

    expect(recorded).toEqual([]);
  });

  it('ignores a restart request while the game is still in progress', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a');
    session.addPlayer('user-b', 'conn-b');

    session.requestRestart('user-a');

    expect(broadcaster.messages).toEqual([]);
  });

  it('broadcasts restart_status after one of two players votes to restart', () => {
    const broadcaster = fakeBroadcaster();
    const session = new PongSession(identity(), broadcaster, undefined, {
      winningScore: 1,
    });
    session.addPlayer('user-a', 'conn-a'); // left
    session.addPlayer('user-b', 'conn-b'); // right
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
    const session = new PongSession(identity(), broadcaster, undefined, {
      winningScore: 1,
    });
    session.addPlayer('user-a', 'conn-a'); // left
    session.addPlayer('user-b', 'conn-b'); // right
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
    const session = new PongSession(identity(), broadcaster, undefined, {
      winningScore: 1,
    });
    session.addPlayer('user-a', 'conn-a'); // left
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

    const session = new PongSession(identity(), broadcaster, fakeGamification, {
      winningScore: 1,
    });
    session.addPlayer('user-a', 'conn-a'); // left
    session.addPlayer('user-b', 'conn-b'); // right
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

  describe('disconnect pause/resume/forfeit', () => {
    it('pauseForDisconnect stops the loop and broadcasts opponent_disconnected with the departed side', () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster);
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      session.start();

      session.pauseForDisconnect('user-a', 'conn-a');

      expect((session as any).interval).toBeNull();
      const last = broadcaster.messages[broadcaster.messages.length - 1]!
        .message as {
        type: string;
        payload: { side: string; timeoutMs: number };
      };
      expect(last.type).toBe('opponent_disconnected');
      expect(last.payload.side).toBe('left');
      expect(last.payload.timeoutMs).toBeGreaterThan(0);
    });

    it('pauseForDisconnect for a userId that already left is a no-op', () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster);
      session.addPlayer('user-a', 'conn-a');
      session.leave('user-a', 'conn-a');

      expect(() =>
        session.pauseForDisconnect('user-a', 'conn-a'),
      ).not.toThrow();
      expect(broadcaster.messages).toEqual([]);
    });

    it('a disconnect after the match has already ended is treated as a plain leave, not a pause', () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster, undefined, {
        winningScore: 1,
      });
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      (session as any).engine.state.paddles.right = 400;
      (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
      session.tick(); // left wins, match now over
      const messagesBefore = broadcaster.messages.length;

      session.pauseForDisconnect('user-a', 'conn-a');

      expect(broadcaster.messages.length).toBe(messagesBefore);
      expect(
        (session as any).players.some((p: any) => p.userId === 'user-a'),
      ).toBe(false);
    });

    it('reconnecting via addPlayer before the grace period lapses resumes the loop and broadcasts opponent_reconnected', () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster);
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      session.start();
      session.pauseForDisconnect('user-a', 'conn-a');

      const side = session.addPlayer('user-a', 'conn-a');

      expect(side).toBe('left');
      expect((session as any).interval).not.toBeNull();
      const last = broadcaster.messages[broadcaster.messages.length - 1]!
        .message as { type: string; payload: { side: string } };
      expect(last.type).toBe('opponent_reconnected');
      expect(last.payload.side).toBe('left');
    });

    it('does not resume the loop on reconnect while another player is still disconnected', () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster);
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      session.start();
      session.pauseForDisconnect('user-a', 'conn-a');
      session.pauseForDisconnect('user-b', 'conn-b');

      session.addPlayer('user-a', 'conn-a');

      expect((session as any).interval).toBeNull();
    });

    it('forfeits the disconnected player to the remaining player once the grace period lapses', async () => {
      const broadcaster = fakeBroadcaster();
      const recorded: unknown[] = [];
      const fakeGamification = {
        recordGameResult: (input: unknown) => recorded.push(input),
      } as unknown as GamificationService;
      let ended = false;
      const session = new PongSession(
        identity(),
        broadcaster,
        fakeGamification,
        undefined,
        { disconnectGraceMs: 10, onSessionEnded: () => (ended = true) },
      );
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      session.start();

      session.pauseForDisconnect('user-a', 'conn-a');
      await wait(40);

      const last =
        broadcaster.snapshots[broadcaster.snapshots.length - 1]!.snapshot;
      expect(last.winner).toBe('right');
      expect(recorded).toEqual([
        {
          sessionId: 'inst-1',
          guildId: 'guild-1',
          gameType: 'pong',
          results: [
            { userId: 'user-a', position: 2 },
            { userId: 'user-b', position: 1 },
          ],
        },
      ]);
      expect((session as any).interval).toBeNull();
      // user-b (the winner) is still present — the session stays alive for
      // them to see the result / request a rematch / leave via the menu.
      expect(ended).toBe(false);
    });

    it('reconnecting cancels the pending forfeit timer', async () => {
      const broadcaster = fakeBroadcaster();
      const recorded: unknown[] = [];
      const fakeGamification = {
        recordGameResult: (input: unknown) => recorded.push(input),
      } as unknown as GamificationService;
      const session = new PongSession(
        identity(),
        broadcaster,
        fakeGamification,
        undefined,
        { disconnectGraceMs: 10 },
      );
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      session.start();

      session.pauseForDisconnect('user-a', 'conn-a');
      session.addPlayer('user-a', 'conn-a');
      await wait(40);

      expect(recorded).toEqual([]);
      expect((session as any).engine.getState().winner).toBeNull();
    });

    // A private session has nobody waiting on the other end of the reconnect,
    // so holding the slot open would only leave the user attached to a match
    // they could silently fall back into on their next mode pick.
    it('a solo/bot-mode disconnect tears down immediately, with no grace period and no result', () => {
      const broadcaster = fakeBroadcaster();
      const recorded: unknown[] = [];
      const fakeGamification = {
        recordGameResult: (input: unknown) => recorded.push(input),
      } as unknown as GamificationService;
      let ended = false;
      const session = new PongSession(
        identity('single'),
        broadcaster,
        fakeGamification,
        undefined,
        { disconnectGraceMs: 10_000, onSessionEnded: () => (ended = true) },
      );
      session.addPlayer('user-a', 'conn-a'); // left
      session.enableBot();
      session.start();

      session.pauseForDisconnect('user-a', 'conn-a');

      expect(ended).toBe(true);
      expect(recorded).toEqual([]);
      expect((session as any).interval).toBeNull();
      expect((session as any).disconnectGrace.isArmed('user-a')).toBe(false);
      expect(broadcaster.messages).toEqual([]);
    });

    it('a local hot-seat disconnect also tears down immediately', () => {
      const broadcaster = fakeBroadcaster();
      let ended = false;
      const session = new PongSession(
        identity('local'),
        broadcaster,
        undefined,
        undefined,
        { disconnectGraceMs: 10_000, onSessionEnded: () => (ended = true) },
      );
      session.addPlayer('user-a', 'conn-a');
      session.enableLocalTwoPlayer();
      session.start();

      session.pauseForDisconnect('user-a', 'conn-a');

      expect(ended).toBe(true);
      expect((session as any).disconnectGrace.isArmed('user-a')).toBe(false);
    });
  });

  describe('local hot-seat mode', () => {
    it('lets a single connection drive both paddles via an explicit side', () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster);
      session.addPlayer('user-a', 'conn-a'); // left
      session.enableLocalTwoPlayer();

      session.handleInput('user-a', -1, 1, 'left');
      session.handleInput('user-a', -1, 1, 'right');
      session.tick();

      const { paddles } = broadcaster.snapshots[0]!.snapshot;
      expect(paddles.left).toBeLessThan((480 - 80) / 2);
      expect(paddles.right).toBeLessThan((480 - 80) / 2);
    });

    it('starts with a single connected player, no bot and no second joiner required', () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster);
      session.addPlayer('user-a', 'conn-a');
      session.enableLocalTwoPlayer();
      session.start();

      expect((session as any).interval).not.toBeNull();
      expect((session as any).bot).toBeNull();
    });

    it("ignores an explicit side on a normal (non-local) session, using the sender's own side instead", () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(identity(), broadcaster);
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right

      // user-a tries to spoof control of the right paddle.
      session.handleInput('user-a', -1, 1, 'right');
      session.tick();

      const { paddles } = broadcaster.snapshots[0]!.snapshot;
      expect(paddles.left).toBeLessThan((480 - 80) / 2);
      expect(paddles.right).toBe((480 - 80) / 2);
    });

    it('does not record a gamification result for a local hot-seat match', () => {
      const broadcaster = fakeBroadcaster();
      const recorded: unknown[] = [];
      const fakeGamification = {
        recordGameResult: (input: unknown) => recorded.push(input),
      } as unknown as GamificationService;
      const session = new PongSession(
        identity(),
        broadcaster,
        fakeGamification,
        { winningScore: 1 },
      );
      session.addPlayer('user-a', 'conn-a');
      session.enableLocalTwoPlayer();

      (session as any).engine.state.paddles.right = 400;
      (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
      session.tick();

      expect(recorded).toEqual([]);
    });
  });

  describe('leave', () => {
    it('removes the player and clears any pending disconnect timer', async () => {
      const broadcaster = fakeBroadcaster();
      const session = new PongSession(
        identity(),
        broadcaster,
        undefined,
        undefined,
        { disconnectGraceMs: 10 },
      );
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      session.start();
      session.pauseForDisconnect('user-a', 'conn-a');

      session.leave('user-a', 'conn-a');
      await wait(40);

      expect((session as any).disconnectGrace.isArmed('user-a')).toBe(false);
      expect(
        (session as any).players.some((p: any) => p.userId === 'user-a'),
      ).toBe(false);
    });

    // Quitting an unfinished match is the same abandonment as letting the
    // disconnect grace period lapse, so it settles the same way. Anything
    // less leaves the opponent alone in a match that keeps ticking against a
    // paddle nobody drives.
    it('forfeits to the remaining player when a live match is abandoned', () => {
      const broadcaster = fakeBroadcaster();
      const recorded: unknown[] = [];
      const fakeGamification = {
        recordGameResult: (input: unknown) => recorded.push(input),
      } as unknown as GamificationService;
      const session = new PongSession(
        identity(),
        broadcaster,
        fakeGamification,
      );
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      session.start();

      session.leave('user-a', 'conn-a');

      const last =
        broadcaster.snapshots[broadcaster.snapshots.length - 1]!.snapshot;
      expect(last.winner).toBe('right');
      expect(recorded).toEqual([
        {
          sessionId: 'inst-1',
          guildId: 'guild-1',
          gameType: 'pong',
          results: [
            { userId: 'user-a', position: 2 },
            { userId: 'user-b', position: 1 },
          ],
        },
      ]);
      expect((session as any).interval).toBeNull();
    });

    it('does not re-record a result when the loser leaves a match that already has a winner', () => {
      const broadcaster = fakeBroadcaster();
      const recorded: unknown[] = [];
      const fakeGamification = {
        recordGameResult: (input: unknown) => recorded.push(input),
      } as unknown as GamificationService;
      const session = new PongSession(
        identity(),
        broadcaster,
        fakeGamification,
        { winningScore: 1 },
      );
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      (session as any).engine.state.paddles.right = 400;
      (session as any).engine.state.ball = { x: 900, y: 240, vx: 100, vy: 0 };
      session.tick(); // left wins

      session.leave('user-b', 'conn-b');

      expect(recorded.length).toBe(1);
      expect((recorded[0] as any).results).toContainEqual({
        userId: 'user-a',
        position: 1,
      });
    });

    it('is a no-op for a spectator who was never given a paddle', () => {
      const broadcaster = fakeBroadcaster();
      let ended = false;
      const session = new PongSession(
        identity(),
        broadcaster,
        undefined,
        undefined,
        { onSessionEnded: () => (ended = true) },
      );
      session.addPlayer('user-a', 'conn-a'); // left
      session.addPlayer('user-b', 'conn-b'); // right
      expect(session.addPlayer('user-c', 'conn-c')).toBeNull(); // spectator
      session.start();

      session.leave('user-c', 'conn-c');

      expect(ended).toBe(false);
      expect(session.playerCount).toBe(2);
      expect((session as any).interval).not.toBeNull();
      session.stop();
    });

    it('calls onSessionEnded once the last player leaves', () => {
      const broadcaster = fakeBroadcaster();
      let ended = false;
      const session = new PongSession(
        identity(),
        broadcaster,
        undefined,
        undefined,
        { onSessionEnded: () => (ended = true) },
      );
      session.addPlayer('user-a', 'conn-a');

      session.leave('user-a', 'conn-a');

      expect(ended).toBe(true);
    });
  });
});
