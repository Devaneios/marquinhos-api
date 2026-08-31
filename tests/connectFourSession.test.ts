import { describe, expect, it } from 'bun:test';
import {
  ConnectFourSession,
  type ConnectFourSessionIdentity,
} from 'services/activity/connectFour/ConnectFourSession';
import type { ActivityMode } from 'services/activity/gameId';

function identity(mode: ActivityMode = 'multi'): ConnectFourSessionIdentity {
  return {
    sessionKey: `inst-1:connect-four:${mode}`,
    instanceId: 'inst-1',
    guildId: 'guild-1',
    mode,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeBroadcaster() {
  const messages: { key: string; message: unknown }[] = [];
  return {
    broadcast: (key: string, message: unknown) => {
      messages.push({ key, message });
    },
    messages,
  };
}

describe('ConnectFourSession', () => {
  it('assigns p1 to the first joiner and p2 to the second', () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(identity(), broadcaster);

    expect(session.addPlayer('u1', {})).toBe('p1');
    expect(session.addPlayer('u2', {})).toBe('p2');
    expect(session.playerCount).toBe(2);
  });

  it('rejects a third joiner', () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(identity(), broadcaster);
    session.addPlayer('u1', {});
    session.addPlayer('u2', {});

    expect(session.addPlayer('u3', {})).toBeNull();
  });

  it('rejects a move from a player not in the session', () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(identity(), broadcaster);
    session.addPlayer('u1', {});
    session.addPlayer('u2', {});

    expect(session.dropDisc('ghost', 3)).toBe(false);
  });

  it('rejects an out-of-turn move', () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(identity(), broadcaster);
    session.addPlayer('u1', {});
    session.addPlayer('u2', {});

    expect(session.dropDisc('u2', 3)).toBe(false);
    expect(session.dropDisc('u1', 3)).toBe(true);
  });

  it('broadcasts state after every accepted move', () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(identity(), broadcaster);
    session.addPlayer('u1', {});
    session.addPlayer('u2', {});

    session.dropDisc('u1', 3);

    const last = broadcaster.messages.at(-1) as {
      message: { type: string; payload: { currentTurn: string } };
    };
    expect(last.message.type).toBe('state');
    expect(last.message.payload.currentTurn).toBe('p2');
  });

  it('forfeits to the remaining player on explicit leave mid-match', () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(identity(), broadcaster);
    const conn1 = {};
    session.addPlayer('u1', conn1);
    session.addPlayer('u2', {});

    session.leave('u1', conn1);

    const forfeitMsg = broadcaster.messages.find(
      (m) =>
        (m.message as { type: string }).type === 'state' &&
        (m.message as { payload: { winner: string | null } }).payload.winner ===
          'p2',
    );
    expect(forfeitMsg).toBeDefined();
    expect(session.playerCount).toBe(1);
  });

  it('single-player mode makes the bot move after the human', async () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(
      identity('single'),
      broadcaster,
      undefined,
      {
        botMoveDelayMs: 5,
      },
    );
    const disc = session.addPlayer('u1', {});
    expect(disc).toBe('p1');
    session.enableBot(disc!);

    session.dropDisc('u1', 3);
    await wait(30);

    const state = session.getPublicState();
    const totalDiscs = state.grid.flat().filter((c) => c !== null).length;
    expect(totalDiscs).toBe(2);
  });

  it('pauses (not forfeits) on disconnect in multi mode, forfeits after grace expires', async () => {
    const broadcaster = fakeBroadcaster();
    const session = new ConnectFourSession(
      identity('multi'),
      broadcaster,
      undefined,
      {
        disconnectGraceMs: 20,
      },
    );
    const conn1 = {};
    session.addPlayer('u1', conn1);
    session.addPlayer('u2', {});

    session.pauseForDisconnect('u1', conn1);
    expect(session.playerCount).toBe(2);

    await wait(40);
    expect(session.playerCount).toBe(1);
  });
});
