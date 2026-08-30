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

  it('routes a guess message through the Hangman adapter and returns a response', async () => {
    const key = roomKey({
      instanceId: 'inst-1',
      game: 'hangman',
      mode: 'multi',
      userId: 'user-a',
      roomId: 'ROOM02',
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
      roomId: 'ROOM02',
    });
    const client = await colyseus.connectTo(room, { token, roomKey: key });
    await client.waitForNextMessage(); // init

    // HangmanSession.guessLetter() first broadcasts `game_state` to the
    // whole room, then the adapter sends `guess_success` directly to the
    // guesser — so listen for the specific type rather than "next message".
    const success = new Promise<void>((resolve) => {
      client.onMessage('guess_success', () => resolve());
    });
    client.send('guess', { letter: 'a' });

    // 'a' is always a fresh, valid letter for a brand-new session, so the
    // adapter's guessLetter() call is guaranteed to succeed regardless of
    // which word getHangmanWord() picked.
    await success;
  });

  it('rate-limits rapid guess messages, dropping the one that crosses the window limit', async () => {
    const key = roomKey({
      instanceId: 'inst-1',
      game: 'hangman',
      mode: 'multi',
      userId: 'user-a',
      roomId: 'ROOM03',
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
      roomId: 'ROOM03',
    });
    const client = await colyseus.connectTo(room, { token, roomKey: key });
    await client.waitForNextMessage(); // init

    let replies = 0;
    client.onMessage('guess_success', () => {
      replies += 1;
    });
    client.onMessage('guess_error', () => {
      replies += 1;
    });

    // The Hangman adapter's guess rate limit is 3 per 1000ms; each letter is
    // distinct and unguessed so every processed guess would otherwise
    // succeed, isolating the rate limiter as the only thing that can drop
    // the 4th one.
    for (const letter of ['a', 'e', 'i', 'o']) {
      client.send('guess', { letter });
    }
    await client.waitForNextMessage(200);

    expect(replies).toBe(3);
  });

  it('throws when creating a room for a game with no registered adapter', async () => {
    await expect(
      colyseus.createRoom('match', {
        roomKey: 'inst-1:ROOM04:not-a-real-game:multi',
        game: 'not-a-real-game',
      }),
    ).rejects.toBeTruthy();
  });
});
