import { describe, expect, it } from 'bun:test';
import type { ActivityRealtimeServer } from '../src/realtime/ActivityRealtimeServer';
import { wirePongActivity } from '../src/services/activity/pong/PongActivityManager';

type Handler = (params: any) => void;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeRealtime() {
  const joinHandlers: Handler[] = [];
  const messageHandlers: Handler[] = [];
  const leaveHandlers: Handler[] = [];
  const sent: { ws: unknown; message: any }[] = [];
  const broadcasts: { key: string; message: any }[] = [];
  let binaryBroadcastCount = 0;

  const realtime = {
    onJoin: (h: Handler) => joinHandlers.push(h),
    onMessage: (h: Handler) => messageHandlers.push(h),
    onLeave: (h: Handler) => leaveHandlers.push(h),
    send: (ws: unknown, message: unknown) => sent.push({ ws, message }),
    broadcast: (key: string, message: unknown) =>
      broadcasts.push({ key, message }),
    broadcastBinary: () => {
      binaryBroadcastCount += 1;
    },
  };

  return {
    realtime: realtime as unknown as ActivityRealtimeServer,
    join: (params: any) => joinHandlers.forEach((h) => h(params)),
    message: (params: any) => messageHandlers.forEach((h) => h(params)),
    leave: (params: any) => leaveHandlers.forEach((h) => h(params)),
    sent,
    broadcasts,
    binaryBroadcastCount: () => binaryBroadcastCount,
  };
}

describe('wirePongActivity', () => {
  it('assigns a side and sends init on join', () => {
    const { realtime, join, sent } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'multi',
      game: 'pong',
      ws: 'ws-a',
    });

    expect(sent.length).toBe(1);
    expect(sent[0]!.ws).toBe('ws-a');
    expect((sent[0]!.message as { type: string }).type).toBe('init');
  });

  it('ignores join/message/leave events for a different game', () => {
    const { realtime, join, message, leave, sent } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'multi',
      game: 'chess',
      ws: 'ws-a',
    });
    message({
      instanceId: 'inst-1',
      userId: 'user-a',
      game: 'chess',
      message: { type: 'input', payload: { direction: 1, seq: 1 } },
    });
    leave({
      instanceId: 'inst-1',
      userId: 'user-a',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'chess',
    });

    expect(sent).toEqual([]);
  });

  it('accepts a single-player join carrying a difficulty without erroring', () => {
    const { realtime, join, sent } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'single',
      difficulty: 'hard',
      game: 'pong',
      ws: 'ws-a',
    });

    expect(sent.length).toBe(1);
    expect((sent[0]!.message as { type: string }).type).toBe('init');
  });

  it('starts immediately on a local hot-seat join, needing no second player', async () => {
    const { realtime, join, sent, binaryBroadcastCount } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'local',
      game: 'pong',
      ws: 'ws-a',
    });

    expect(sent.length).toBe(1);
    expect((sent[0]!.message as { type: string }).type).toBe('init');
    await wait(30);
    expect(binaryBroadcastCount()).toBeGreaterThan(0);
  });

  it('does not start a plain multi-mode session on a single join (control for the local-mode test above)', async () => {
    const { realtime, join, binaryBroadcastCount } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'multi',
      game: 'pong',
      ws: 'ws-a',
    });

    await wait(30);
    expect(binaryBroadcastCount()).toBe(0);
  });

  it('accepts a single-player join carrying a winningScore without erroring', () => {
    const { realtime, join, sent } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'single',
      winningScore: 21,
      game: 'pong',
      ws: 'ws-a',
    });

    expect(sent.length).toBe(1);
    expect((sent[0]!.message as { type: string }).type).toBe('init');
  });

  it('pauses instead of tearing down on a raw disconnect (no prior leave message)', () => {
    const { realtime, join, leave, broadcasts } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'multi',
      game: 'pong',
      ws: 'ws-a',
    });
    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-b',
      mode: 'multi',
      game: 'pong',
      ws: 'ws-b',
    });

    leave({
      instanceId: 'inst-1',
      userId: 'user-a',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });

    const last = broadcasts[broadcasts.length - 1]!.message as {
      type: string;
    };
    expect(last.type).toBe('opponent_disconnected');
  });

  it('an explicit leave message tears the session down once the last player is gone, freeing the instanceId for a fresh session', () => {
    const { realtime, join, message, sent } = fakeRealtime();
    wirePongActivity(realtime);

    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-a',
      mode: 'single',
      game: 'pong',
      ws: 'ws-a',
    });
    message({
      instanceId: 'inst-1',
      userId: 'user-a',
      game: 'pong',
      message: { type: 'leave' },
    });

    // Rejoining after the session was torn down must look like a brand new
    // match (fresh 'left' assignment), proving the old session/map entry
    // was actually deleted rather than left dangling.
    join({
      instanceId: 'inst-1',
      guildId: 'guild-1',
      userId: 'user-b',
      mode: 'single',
      game: 'pong',
      ws: 'ws-b',
    });

    expect(sent.length).toBe(2);
    expect(
      (sent[1]!.message as { payload: { side: string } }).payload.side,
    ).toBe('left');
  });
});
