import { afterEach, describe, expect, it } from 'bun:test';
import WebSocket from 'ws';
import {
  ActivityRealtimeServer,
  roomKey,
} from '../src/realtime/ActivityRealtimeServer';
import { mintWsSessionToken } from '../src/services/activity/wsSessionToken';

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

    expect(server.getRoomSize(roomKey('inst-1', 'pong'))).toBe(1);
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
    server.broadcast(roomKey('inst-1', 'pong'), {
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
    server.broadcast(roomKey('inst-1', 'pong'), { type: 'state', payload: {} });

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
    expect(server.getRoomSize(roomKey('inst-1', 'pong'))).toBe(1);

    ws.close();
    await wait(50);
    expect(server.getRoomSize(roomKey('inst-1', 'pong'))).toBe(0);
  });

  it('invokes onMessage handlers with the parsed message and sender identity', async () => {
    await startServer();

    const received: unknown[] = [];
    server.onMessage((params) => received.push(params));

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
    expect(received).toEqual([
      {
        instanceId: 'inst-1',
        userId: 'user-1',
        guildId: 'guild-1',
        mode: 'multi',
        game: 'pong',
        message: { type: 'input', payload: { dir: 1 } },
      },
    ]);
  });

  it('passes an optional difficulty through to onJoin handlers', async () => {
    await startServer();

    const joins: unknown[] = [];
    server.onJoin((params) => joins.push(params));

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
    server.onJoin((params) => joins.push(params));
    server.onLeave((params) => leaves.push(params));

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
    expect(leaves).toEqual([
      {
        instanceId: 'inst-1',
        userId: 'user-1',
        guildId: 'guild-1',
        mode: 'multi',
        game: 'pong',
      },
    ]);
  });
});
