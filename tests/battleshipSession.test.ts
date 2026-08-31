import { describe, expect, it } from 'bun:test';
import type { ShipPlacement } from 'services/activity/battleship/BattleshipEngine';
import {
  BattleshipSession,
  type BattleshipSessionIdentity,
} from 'services/activity/battleship/BattleshipSession';
import type { ActivityMode } from 'services/activity/gameId';
import type { GamificationService } from 'services/gamification';

function identity(mode: ActivityMode = 'multi'): BattleshipSessionIdentity {
  return {
    sessionKey: `inst-1:battleship:${mode}`,
    instanceId: 'inst-1',
    guildId: 'guild-1',
    mode,
  };
}

function fakeBroadcaster() {
  const perPlayer: { userId: string; type: string; payload: any }[] = [];
  const publicMessages: { type: string; payload: any }[] = [];
  return {
    sendToPlayer: (
      userId: string,
      message: { type: string; payload?: unknown },
    ) => {
      perPlayer.push({ userId, type: message.type, payload: message.payload });
    },
    broadcastPublic: (message: { type: string; payload?: unknown }) => {
      publicMessages.push({ type: message.type, payload: message.payload });
    },
    perPlayer,
    publicMessages,
    lastStateFor(userId: string) {
      const messages = perPlayer.filter(
        (m) => m.userId === userId && m.type === 'state',
      );
      return messages[messages.length - 1]?.payload;
    },
  };
}

const FLEET_A: ShipPlacement[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' },
  { type: 'battleship', x: 0, y: 1, orientation: 'horizontal' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'horizontal' },
  { type: 'submarine', x: 0, y: 3, orientation: 'horizontal' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'horizontal' },
];

const FLEET_B: ShipPlacement[] = [
  { type: 'carrier', x: 5, y: 0, orientation: 'vertical' },
  { type: 'battleship', x: 6, y: 0, orientation: 'vertical' },
  { type: 'cruiser', x: 7, y: 0, orientation: 'vertical' },
  { type: 'submarine', x: 8, y: 0, orientation: 'vertical' },
  { type: 'destroyer', x: 9, y: 0, orientation: 'vertical' },
];

function placedSession() {
  const broadcaster = fakeBroadcaster();
  const session = new BattleshipSession(identity(), broadcaster);
  session.addPlayer('user-a', 'conn-a');
  session.addPlayer('user-b', 'conn-b');
  session.placeShips('user-a', FLEET_A);
  session.placeShips('user-b', FLEET_B);
  return { broadcaster, session };
}

describe('BattleshipSession', () => {
  it('assigns p1 to the first joiner and p2 to the second', () => {
    const broadcaster = fakeBroadcaster();
    const session = new BattleshipSession(identity(), broadcaster);
    expect(session.addPlayer('user-a', 'conn-a')).toBe('p1');
    expect(session.addPlayer('user-b', 'conn-b')).toBe('p2');
  });

  it('rejects a third player', () => {
    const broadcaster = fakeBroadcaster();
    const session = new BattleshipSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a');
    session.addPlayer('user-b', 'conn-b');
    expect(session.addPlayer('user-c', 'conn-c')).toBeNull();
  });

  it('sends each player only their own masked state, never the same payload', () => {
    const { broadcaster } = placedSession();

    const viewA = broadcaster.lastStateFor('user-a');
    const viewB = broadcaster.lastStateFor('user-b');

    expect(viewA.phase).toBe('battle');
    expect(viewA.own.ships).toHaveLength(5);
    expect(viewA.opponent.ships).toHaveLength(0);
    expect(viewB.own.ships).toHaveLength(5);
    expect(viewB.opponent.ships).toHaveLength(0);
  });

  it('never includes an unsunk opponent ship in either players masked view after shots', () => {
    const { broadcaster, session } = placedSession();
    session.fire('user-a', 0, 0); // miss on p2 board (p2 ships start at x=5)
    session.fire('user-b', 0, 0); // hits p1 carrier, not sunk

    const viewA = broadcaster.lastStateFor('user-a');
    const viewB = broadcaster.lastStateFor('user-b');
    expect(viewA.opponent.ships).toHaveLength(0);
    expect(viewB.opponent.ships).toHaveLength(0);
  });

  it('relays a placement validation error only to the sender', () => {
    const broadcaster = fakeBroadcaster();
    const session = new BattleshipSession(identity(), broadcaster);
    session.addPlayer('user-a', 'conn-a');
    session.addPlayer('user-b', 'conn-b');

    const badFleet = FLEET_A.slice(0, 4);
    session.placeShips('user-a', badFleet);

    const errors = broadcaster.perPlayer.filter(
      (m) => m.type === 'placement_error',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.userId).toBe('user-a');
  });

  it('relays a fire validation error (out of turn) only to the sender', () => {
    const { broadcaster, session } = placedSession();
    session.fire('user-b', 0, 0); // p2 fires out of turn, p1 goes first

    const errors = broadcaster.perPlayer.filter((m) => m.type === 'fire_error');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.userId).toBe('user-b');
  });

  it('rejects firing at an already-fired-upon coordinate', () => {
    const { broadcaster, session } = placedSession();
    session.fire('user-a', 5, 0);
    session.fire('user-b', 0, 0);
    session.fire('user-a', 5, 0);

    const errors = broadcaster.perPlayer.filter((m) => m.type === 'fire_error');
    expect(errors).toHaveLength(1);
  });

  it('rejects placement messages once battle has begun', () => {
    const { broadcaster, session } = placedSession();
    session.placeShips('user-a', FLEET_A);

    const errors = broadcaster.perPlayer.filter(
      (m) => m.type === 'placement_error',
    );
    expect(errors).toHaveLength(1);
  });

  it('reveals a ship to the opponent only once it is fully sunk', () => {
    const { broadcaster, session } = placedSession();
    session.fire('user-a', 9, 0); // hits p2 destroyer, not sunk
    session.fire('user-b', 0, 0);
    session.fire('user-a', 9, 1); // sinks p2 destroyer

    const viewA = broadcaster.lastStateFor('user-a');
    expect(viewA.opponent.ships).toHaveLength(1);
    expect(viewA.opponent.ships[0].type).toBe('destroyer');
  });

  it('records a game result exactly once when a winner emerges via forfeit', () => {
    const broadcaster = fakeBroadcaster();
    const recorded: unknown[] = [];
    const fakeGamification = {
      recordGameResult: (input: unknown) => recorded.push(input),
    } as unknown as GamificationService;

    const session = new BattleshipSession(
      identity(),
      broadcaster,
      fakeGamification,
    );
    session.addPlayer('user-a', 'conn-a');
    session.addPlayer('user-b', 'conn-b');
    session.placeShips('user-a', FLEET_A);
    session.placeShips('user-b', FLEET_B);

    session.leave('user-b', 'conn-b');

    expect(recorded).toEqual([
      {
        sessionId: 'inst-1',
        guildId: 'guild-1',
        gameType: 'battleship',
        results: [
          { userId: 'user-a', position: 1 },
          { userId: 'user-b', position: 2 },
        ],
      },
    ]);
  });

  it('holds a disconnected multi-mode player open for reconnect, without forfeiting immediately', () => {
    const { broadcaster, session } = placedSession();
    session.pauseForDisconnect('user-a', 'conn-a');

    const disconnectMsg = broadcaster.publicMessages.find(
      (m) => m.type === 'opponent_disconnected',
    );
    expect(disconnectMsg).toBeTruthy();
  });

  it('reveals full boards to both players once the game ends', () => {
    const { broadcaster, session } = placedSession();
    session.leave('user-b', 'conn-b');

    const viewA = broadcaster.lastStateFor('user-a');
    expect(viewA.phase).toBe('ended');
    expect(viewA.opponent.ships).toHaveLength(5);
  });
});
