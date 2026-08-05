import { afterEach, describe, expect, it } from 'bun:test';
import WebSocket from 'ws';
import {
  ActivityRealtimeServer,
  roomKey,
} from '../src/realtime/ActivityRealtimeServer';
import { mintWsSessionToken } from '../src/services/activity/wsSessionToken';

// 'multi' rooms are shared across an instance, so the userId here is ignored
// by roomKey — any member of the instance resolves to the same key.
const MULTI_SCOPE = {
  instanceId: 'inst-1',
  game: 'pong',
  mode: 'multi',
  userId: 'user-1',
} as const;

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number }> {
  return new Promise((resolve) => {
    ws.once('close', (code: number) => resolve({ code }));
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ActivityRealtimeServer', () => {
  let server: ActivityRealtimeServer;
  let port: number;
  const clients: WebSocket[] = [];

  afterEach(() => {
    for (const c of clients) c.terminate();
    clients.length = 0;
    server?.close().catch(() => {});
  });

  async function startServer() {
    server = new ActivityRealtimeServer({ port: 0 });
    await server.whenReady();
    port = server.port!;
  }

  function connect(token: string): WebSocket {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/ws/activity?token=${encodeURIComponent(token)}`,
    );
    clients.push(ws);
    return ws;
  }

  it('rejects a connection with an invalid session token', async () => {
    await startServer();

    const ws = connect('not-a-real-token');
    const closed = await waitForClose(ws);

    expect(closed.code).toBe(4001);
  });

  it('accepts a connection with a valid session token and joins the instance room', async () => {
    await startServer();

    const token = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const ws = connect(token);
    await waitForOpen(ws);

    expect(server.getRoomSize(roomKey(MULTI_SCOPE))).toBe(1);
  });

  it('broadcasts a message to other clients in the same instance room', async () => {
    await startServer();

    const tokenA = mintWsSessionToken({
      userId: 'user-a',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const tokenB = mintWsSessionToken({
      userId: 'user-b',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const wsA = connect(tokenA);
    const wsB = connect(tokenB);
    await Promise.all([waitForOpen(wsA), waitForOpen(wsB)]);

    const received = waitForMessage(wsB);
    server.broadcast(roomKey(MULTI_SCOPE), {
      type: 'state',
      payload: { x: 1 },
    });

    expect(await received).toEqual({ type: 'state', payload: { x: 1 } });
  });

  it('does not broadcast across different instance rooms', async () => {
    await startServer();

    const tokenA = mintWsSessionToken({
      userId: 'user-a',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const tokenB = mintWsSessionToken({
      userId: 'user-b',
      instanceId: 'inst-2',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const wsA = connect(tokenA);
    const wsB = connect(tokenB);
    await Promise.all([waitForOpen(wsA), waitForOpen(wsB)]);

    let gotMessage = false;
    wsB.once('message', () => {
      gotMessage = true;
    });
    server.broadcast(roomKey(MULTI_SCOPE), { type: 'state', payload: {} });

    await wait(50);
    expect(gotMessage).toBe(false);
  });

  it('does not broadcast across different games in the same instance room', async () => {
    await startServer();

    const tokenPong = mintWsSessionToken({
      userId: 'user-a',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const wsPong = connect(tokenPong);
    await waitForOpen(wsPong);

    let gotMessage = false;
    wsPong.once('message', () => {
      gotMessage = true;
    });
    // Simulates a second, not-yet-existing game sharing the same instanceId —
    // its room must be isolated even though only 'pong' is a real GameId today.
    server.broadcast('inst-1:other-game', { type: 'state', payload: {} });

    await wait(50);
    expect(gotMessage).toBe(false);
  });

  it('removes a client from the room on disconnect', async () => {
    await startServer();

    const token = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const ws = connect(token);
    await waitForOpen(ws);
    expect(server.getRoomSize(roomKey(MULTI_SCOPE))).toBe(1);

    ws.close();
    await wait(50);
    expect(server.getRoomSize(roomKey(MULTI_SCOPE))).toBe(0);
  });

  it('invokes the registered game handler with the parsed message and sender identity', async () => {
    await startServer();

    const received: unknown[] = [];
    server.registerGame('pong', {
      onMessage: (params) => received.push(params),
    });

    const token = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const ws = connect(token);
    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: 'input', payload: { dir: 1 } }));

    await wait(50);
    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({
      instanceId: 'inst-1',
      userId: 'user-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
      sessionKey: 'inst-1:pong:multi',
      message: { type: 'input', payload: { dir: 1 } },
    });
    // The originating socket rides along so a session can tell one of a
    // user's connections from another.
    expect((received[0] as { ws: unknown }).ws).toBeDefined();
  });

  it('passes an optional difficulty through to onJoin handlers', async () => {
    await startServer();

    const joins: unknown[] = [];
    server.registerGame('pong', { onJoin: (params) => joins.push(params) });

    const token = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'pong',
      difficulty: 'easy',
    });
    const ws = connect(token);
    await waitForOpen(ws);

    expect(joins[0]).toMatchObject({ mode: 'single', difficulty: 'easy' });
  });

  it('invokes onJoin and onLeave handlers', async () => {
    await startServer();

    const joins: unknown[] = [];
    const leaves: unknown[] = [];
    server.registerGame('pong', {
      onJoin: (params) => joins.push(params),
      onLeave: (params) => leaves.push(params),
    });

    const token = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const ws = connect(token);
    await waitForOpen(ws);
    expect(joins.length).toBe(1);
    expect(joins[0]).toMatchObject({
      instanceId: 'inst-1',
      userId: 'user-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });

    ws.close();
    await wait(50);
    expect(leaves.length).toBe(1);
    expect(leaves[0]).toMatchObject({
      instanceId: 'inst-1',
      userId: 'user-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
      sessionKey: 'inst-1:pong:multi',
    });
    expect((leaves[0] as { ws: unknown }).ws).toBe(
      (joins[0] as { ws: unknown }).ws,
    );
  });

  it('throws when a game is registered twice', async () => {
    await startServer();
    server.registerGame('pong', {});
    expect(() => server.registerGame('pong', {})).toThrow();
  });

  it('never delivers a message from one game to another game handler', async () => {
    await startServer();

    const pongMessages: unknown[] = [];
    const pongLeaves: unknown[] = [];
    const wordleMessages: unknown[] = [];
    const wordleLeaves: unknown[] = [];
    server.registerGame('pong', {
      onMessage: (params) => pongMessages.push(params),
      onLeave: (params) => pongLeaves.push(params),
    });
    server.registerGame('wordle', {
      onMessage: (params) => wordleMessages.push(params),
      onLeave: (params) => wordleLeaves.push(params),
    });

    const wordleToken = mintWsSessionToken({
      userId: 'user-1',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'wordle',
    });
    const wsWordle = connect(wordleToken);
    await waitForOpen(wsWordle);

    // Adversarial case: reuse Pong's exact type-string vocabulary on a
    // Wordle-tagged connection. The dispatcher must route this to Wordle's
    // handler only, never Pong's, purely by connection identity.
    wsWordle.send(JSON.stringify({ type: 'input', payload: {} }));
    wsWordle.send(JSON.stringify({ type: 'leave', payload: {} }));
    await wait(50);
    wsWordle.close();
    await wait(50);

    expect(pongMessages.length).toBe(0);
    expect(pongLeaves.length).toBe(0);
    expect(wordleMessages.length).toBe(2);
    expect(wordleLeaves.length).toBe(1);
  });

  it('puts two users playing the same private mode in the same instance into separate rooms', async () => {
    await startServer();

    const tokenFor = (userId: string) =>
      mintWsSessionToken({
        userId,
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'single',
        game: 'pong',
      });
    const wsA = connect(tokenFor('user-a'));
    const wsB = connect(tokenFor('user-b'));
    await Promise.all([waitForOpen(wsA), waitForOpen(wsB)]);

    const keyA = roomKey({ ...MULTI_SCOPE, mode: 'single', userId: 'user-a' });
    expect(server.getRoomSize(keyA)).toBe(1);
    expect(
      server.getRoomSize(
        roomKey({ ...MULTI_SCOPE, mode: 'single', userId: 'user-b' }),
      ),
    ).toBe(1);

    let gotMessage = false;
    wsB.once('message', () => {
      gotMessage = true;
    });
    server.broadcast(keyA, { type: 'state', payload: {} });

    await wait(50);
    expect(gotMessage).toBe(false);
  });

  it('keeps a private-mode socket out of the shared multi room of the same instance', async () => {
    await startServer();

    const soloToken = mintWsSessionToken({
      userId: 'user-a',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'pong',
    });
    const multiToken = mintWsSessionToken({
      userId: 'user-b',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'multi',
      game: 'pong',
    });
    const wsSolo = connect(soloToken);
    const wsMulti = connect(multiToken);
    await Promise.all([waitForOpen(wsSolo), waitForOpen(wsMulti)]);

    expect(server.getRoomSize(roomKey(MULTI_SCOPE))).toBe(1);

    let gotMessage = false;
    wsSolo.once('message', () => {
      gotMessage = true;
    });
    server.broadcast(roomKey(MULTI_SCOPE), { type: 'state', payload: {} });

    await wait(50);
    expect(gotMessage).toBe(false);
  });
});
