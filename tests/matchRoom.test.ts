import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

const { Server } = await import('colyseus');
const { WebSocketTransport } = await import('@colyseus/ws-transport');
const { boot } = await import('@colyseus/testing');
const { MatchRoom } = await import('../src/realtime/MatchRoom');
const { mintWsSessionToken } =
  await import('../src/services/activity/wsSessionToken');
const { roomKey } = await import('../src/services/activity/roomKey');

type ColyseusTestServer = import('@colyseus/testing').ColyseusTestServer;

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define('match', MatchRoom).filterBy(['roomKey']);
  colyseus = await boot(gameServer);
});

afterEach(async () => {
  await colyseus.cleanup();
});

afterAll(async () => {
  await colyseus.shutdown();
});

describe('MatchRoom', () => {
  it('seats the first joiner as host and player for a Hangman room', async () => {
    const key = roomKey({
      instanceId: 'inst-1',
      game: 'hangman',
      mode: 'multi',
      userId: 'user-a',
      roomId: 'ROOM01',
    });
    const room = await colyseus.createRoom('match', {
      roomKey: key,
      game: 'hangman',
    });
    const token = mintWsSessionToken({
      userId: 'user-a',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'hangman',
      roomId: 'ROOM01',
    });

    const client = await colyseus.connectTo(room, { token, roomKey: key });
    expect(client).toBeTruthy();
  });

  it('rejects a join with an invalid session token', async () => {
    const key = 'inst-1:ROOM01:hangman:multi';
    const room = await colyseus.createRoom('match', {
      roomKey: key,
      game: 'hangman',
    });

    await expect(
      colyseus.connectTo(room, { token: 'garbage', roomKey: key }),
    ).rejects.toBeTruthy();
  });
});
