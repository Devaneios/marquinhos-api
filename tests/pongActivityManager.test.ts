import { describe, expect, it } from 'bun:test';
import {
  roomKey,
  type ActivityRealtimeServer,
} from '../src/realtime/ActivityRealtimeServer';
import { wirePongActivity } from '../src/services/activity/pong/PongActivityManager';

type Handler = (params: any) => void;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors what ActivityRealtimeServer stamps onto every handler payload, so
// these tests exercise the same scoping the transport actually applies.
function scoped(params: {
  instanceId?: string;
  userId: string;
  mode: 'single' | 'multi' | 'local';
  game?: string;
  [key: string]: unknown;
}) {
  const instanceId = params.instanceId ?? 'inst-1';
  const game = params.game ?? 'pong';
  return {
    guildId: 'guild-1',
    ...params,
    instanceId,
    game,
    sessionKey: roomKey({
      instanceId,
      game: game as 'pong',
      mode: params.mode,
      userId: params.userId,
    }),
  };
}

function fakeRealtime() {
  // The real ActivityRealtimeServer dispatches only to the handler set
  // registered for a connection's own game (see activityRealtimeServer.test.ts's
  // isolation tests) — that filtering is no longer PongActivityManager's job,
  // so this fake just captures whatever wirePongActivity registers under
  // 'pong' and invokes it directly.
  let handlers: {
    onJoin?: Handler;
    onMessage?: Handler;
    onLeave?: Handler;
  } = {};
  const sent: { ws: unknown; message: any }[] = [];
  const broadcasts: { key: string; message: any }[] = [];
  const binaryBroadcasts: string[] = [];

  const realtime = {
    registerGame: (_game: string, h: typeof handlers) => {
      handlers = h;
    },
    send: (ws: unknown, message: unknown) => sent.push({ ws, message }),
    broadcast: (key: string, message: unknown) =>
      broadcasts.push({ key, message }),
    broadcastBinary: (key: string) => binaryBroadcasts.push(key),
  };

  return {
    realtime: realtime as unknown as ActivityRealtimeServer,
    join: (params: any) => handlers.onJoin?.(scoped(params)),
    message: (params: any) => handlers.onMessage?.(scoped(params)),
    leave: (params: any) => handlers.onLeave?.(scoped(params)),
    sent,
    broadcasts,
    binaryBroadcasts,
    binaryBroadcastCount: () => binaryBroadcasts.length,
    sideOf: (index: number) =>
      (sent[index]!.message as { payload: { side: string | null } }).payload
        .side,
  };
}

describe('wirePongActivity', () => {
  it('assigns a side and sends init on join', () => {
    const { realtime, join, sent, sideOf } = fakeRealtime();
    wirePongActivity(realtime);

    join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });

    expect(sent.length).toBe(1);
    expect(sent[0]!.ws).toBe('ws-a');
    expect((sent[0]!.message as { type: string }).type).toBe('init');
    expect(sideOf(0)).toBe('left');
  });

  it('accepts a single-player join carrying a difficulty without erroring', () => {
    const { realtime, join, sent } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      userId: 'user-a',
      mode: 'single',
      difficulty: 'hard',
      ws: 'ws-a',
    });

    expect(sent.length).toBe(1);
    expect((sent[0]!.message as { type: string }).type).toBe('init');
  });

  it('starts immediately on a local hot-seat join, needing no second player', async () => {
    const { realtime, join, sent, binaryBroadcastCount } = fakeRealtime();
    wirePongActivity(realtime);

    join({ userId: 'user-a', mode: 'local', ws: 'ws-a' });

    expect(sent.length).toBe(1);
    expect((sent[0]!.message as { type: string }).type).toBe('init');
    await wait(30);
    expect(binaryBroadcastCount()).toBeGreaterThan(0);
  });

  it('does not start a plain multi-mode session on a single join (control for the local-mode test above)', async () => {
    const { realtime, join, binaryBroadcastCount } = fakeRealtime();
    wirePongActivity(realtime);

    join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });

    await wait(30);
    expect(binaryBroadcastCount()).toBe(0);
  });

  it('accepts a single-player join carrying a winningScore without erroring', () => {
    const { realtime, join, sent } = fakeRealtime();
    wirePongActivity(realtime);

    join({ userId: 'user-a', mode: 'single', winningScore: 21, ws: 'ws-a' });

    expect(sent.length).toBe(1);
    expect((sent[0]!.message as { type: string }).type).toBe('init');
  });

  it('pauses instead of tearing down on a raw disconnect (no prior leave message)', () => {
    const { realtime, join, leave, broadcasts } = fakeRealtime();
    wirePongActivity(realtime);

    join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });
    join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });

    leave({ userId: 'user-a', ws: 'ws-a', mode: 'multi' });

    const last = broadcasts[broadcasts.length - 1]!.message as {
      type: string;
    };
    expect(last.type).toBe('opponent_disconnected');
  });

  it('an explicit leave message tears the session down once the last player is gone, freeing the key for a fresh session', () => {
    const { realtime, join, message, sideOf } = fakeRealtime();
    wirePongActivity(realtime);

    join({ userId: 'user-a', mode: 'single', ws: 'ws-a' });
    message({
      userId: 'user-a',
      ws: 'ws-a',
      mode: 'single',
      message: { type: 'leave' },
    });

    // The same user coming back must look like a brand new match (fresh
    // 'left' assignment), proving the old map entry was actually deleted
    // rather than left dangling for them to fall back into.
    join({ userId: 'user-a', mode: 'single', ws: 'ws-a2' });

    expect(sideOf(1)).toBe('left');
  });

  describe('session isolation', () => {
    // The reported bug: leave a multiplayer match, pick CPU, and land back in
    // the very match you just walked out of — same score, same opponent, with
    // the bot bolted onto their paddle.
    it('gives a CPU game its own session instead of the multiplayer match the user just left', async () => {
      const { realtime, join, message, binaryBroadcasts, sideOf } =
        fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });
      join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });
      message({
        userId: 'user-a',
        ws: 'ws-a',
        mode: 'multi',
        message: { type: 'leave' },
      });

      join({ userId: 'user-a', mode: 'single', ws: 'ws-a2' });
      await wait(30);

      // A fresh private session on the left paddle, broadcasting into its own
      // room — not the multi room.
      expect(sideOf(2)).toBe('left');
      expect(binaryBroadcasts).toContain('inst-1:pong:single:user-a');
    });

    it('never routes a CPU game into the shared multi room even while a match is live', async () => {
      const { realtime, join, binaryBroadcasts } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });
      join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });
      join({ userId: 'user-c', mode: 'single', ws: 'ws-c' });
      await wait(30);

      expect(binaryBroadcasts).toContain('inst-1:pong:single:user-c');
      expect(new Set(binaryBroadcasts)).toEqual(
        new Set(['inst-1:pong:multi', 'inst-1:pong:single:user-c']),
      );
    });

    it('gives two users each playing the CPU in one instance independent sessions', async () => {
      const { realtime, join, binaryBroadcasts, sideOf } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'single', ws: 'ws-a' });
      join({ userId: 'user-b', mode: 'single', ws: 'ws-b' });
      await wait(30);

      // Both are player one of their own match, not left/right of a shared one.
      expect(sideOf(0)).toBe('left');
      expect(sideOf(1)).toBe('left');
      expect(new Set(binaryBroadcasts)).toEqual(
        new Set(['inst-1:pong:single:user-a', 'inst-1:pong:single:user-b']),
      );
    });

    it('gives two users each playing hot-seat in one instance independent sessions', async () => {
      const { realtime, join, binaryBroadcasts, sideOf } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'local', ws: 'ws-a' });
      join({ userId: 'user-b', mode: 'local', ws: 'ws-b' });
      await wait(30);

      expect(sideOf(0)).toBe('left');
      expect(sideOf(1)).toBe('left');
      expect(new Set(binaryBroadcasts)).toEqual(
        new Set(['inst-1:pong:local:user-a', 'inst-1:pong:local:user-b']),
      );
    });

    it('keeps separate instances apart', () => {
      const { realtime, join, sideOf } = fakeRealtime();
      wirePongActivity(realtime);

      join({ instanceId: 'inst-1', userId: 'user-a', mode: 'multi', ws: 'a' });
      join({ instanceId: 'inst-2', userId: 'user-b', mode: 'multi', ws: 'b' });

      expect(sideOf(0)).toBe('left');
      expect(sideOf(1)).toBe('left');
    });
  });

  describe('spectators', () => {
    it('admits a third joiner with a null side instead of a silent dead socket', () => {
      const { realtime, join, sent, sideOf } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });
      join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });
      join({ userId: 'user-c', mode: 'multi', ws: 'ws-c' });

      expect(sent.length).toBe(3);
      expect(sent[2]!.ws).toBe('ws-c');
      expect((sent[2]!.message as { type: string }).type).toBe('init');
      expect(sideOf(2)).toBeNull();
    });

    it('does not let a spectator start or end the match they are watching', async () => {
      const { realtime, join, message, leave, broadcasts, binaryBroadcasts } =
        fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });
      join({ userId: 'user-c', mode: 'multi', ws: 'ws-c' }); // 2nd player
      const ticksBefore = binaryBroadcasts.length;
      join({ userId: 'user-s', mode: 'multi', ws: 'ws-s' }); // spectator

      message({
        userId: 'user-s',
        ws: 'ws-s',
        mode: 'multi',
        message: { type: 'leave' },
      });
      leave({ userId: 'user-s', ws: 'ws-s', mode: 'multi' });
      await wait(30);

      // The match is still running and nobody was told an opponent vanished.
      expect(binaryBroadcasts.length).toBeGreaterThan(ticksBefore);
      expect(
        broadcasts.some(
          (b) =>
            (b.message as { type: string }).type === 'opponent_disconnected',
        ),
      ).toBe(false);
    });

    it('ignores a spectator join on a full session rather than restarting it', async () => {
      const { realtime, join, message, binaryBroadcasts } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });
      join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });
      message({
        userId: 'user-a',
        mode: 'multi',
        message: { type: 'input', payload: { direction: 1, seq: 1 } },
      });
      await wait(20);

      join({ userId: 'user-s', mode: 'multi', ws: 'ws-s' });
      await wait(20);

      expect(new Set(binaryBroadcasts)).toEqual(new Set(['inst-1:pong:multi']));
    });
  });

  // React StrictMode mounts, unmounts and remounts in one commit, so the
  // second socket routinely opens before the first has finished saying
  // goodbye. The goodbye belongs to the socket that sent it, not to the user.
  describe('overlapping connections for one user', () => {
    it('keeps the slot when a superseded socket says goodbye after the new one joined', () => {
      const { realtime, join, message, sideOf } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-old' });
      join({ userId: 'user-a', mode: 'multi', ws: 'ws-new' });
      message({
        userId: 'user-a',
        mode: 'multi',
        ws: 'ws-old',
        message: { type: 'leave' },
      });

      // The surviving socket still owns 'left': a rejoin returns the same
      // side rather than starting a brand new session.
      join({ userId: 'user-a', mode: 'multi', ws: 'ws-new' });
      expect(sideOf(2)).toBe('left');
      expect(sideOf(1)).toBe('left');
    });

    it('does not pause the match when a superseded socket drops', () => {
      const { realtime, join, leave, broadcasts } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-old' });
      join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });
      join({ userId: 'user-a', mode: 'multi', ws: 'ws-new' });

      leave({ userId: 'user-a', mode: 'multi', ws: 'ws-old' });

      expect(
        broadcasts.some(
          (b) =>
            (b.message as { type: string }).type === 'opponent_disconnected',
        ),
      ).toBe(false);
    });

    it('releases the slot once the last of a user’s sockets is gone', () => {
      const { realtime, join, message, sideOf } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-old' });
      join({ userId: 'user-a', mode: 'multi', ws: 'ws-new' });
      message({
        userId: 'user-a',
        mode: 'multi',
        ws: 'ws-old',
        message: { type: 'leave' },
      });
      message({
        userId: 'user-a',
        mode: 'multi',
        ws: 'ws-new',
        message: { type: 'leave' },
      });

      // Session torn down, so somebody else now gets 'left'.
      join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });
      expect(sideOf(2)).toBe('left');
    });
  });

  describe('leaving a live match', () => {
    it('forfeits the match to the opponent instead of leaving them alone in it', async () => {
      const { realtime, join, message, binaryBroadcasts } = fakeRealtime();
      wirePongActivity(realtime);

      join({ userId: 'user-a', mode: 'multi', ws: 'ws-a' });
      join({ userId: 'user-b', mode: 'multi', ws: 'ws-b' });
      await wait(20);
      const ticksAtLeave = binaryBroadcasts.length;

      message({
        userId: 'user-a',
        ws: 'ws-a',
        mode: 'multi',
        message: { type: 'leave' },
      });
      await wait(30);

      // The forfeit snapshot goes out, and then the loop stops dead rather
      // than ticking on against a paddle nobody drives.
      expect(binaryBroadcasts.length).toBe(ticksAtLeave + 1);
    });
  });
});
