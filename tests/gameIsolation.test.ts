import { afterEach, describe, expect, it } from 'bun:test';
import WebSocket from 'ws';

process.env.SQLITE_PATH = ':memory:';

const { ActivityRealtimeServer } =
  await import('../src/realtime/ActivityRealtimeServer');
const { mintWsSessionToken } =
  await import('../src/services/activity/wsSessionToken');
const { wirePongActivity } =
  await import('../src/services/activity/pong/PongActivityManager');
const { wireWordleActivity } =
  await import('../src/services/activity/wordle/WordleActivityManager');

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

// End-to-end proof of the isolation the dispatcher refactor exists for:
// both real game managers wired into one real server, several sockets
// mixing pong and wordle across multiple instances, and an assertion that
// each socket only ever receives frames belonging to its own game.
describe('game isolation (real server, real managers)', () => {
  let server: InstanceType<typeof ActivityRealtimeServer>;
  let port: number;
  const clients: WebSocket[] = [];

  afterEach(() => {
    for (const c of clients) c.terminate();
    clients.length = 0;
    server?.close().catch(() => {});
  });

  function connect(token: string): WebSocket {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/ws/activity?token=${encodeURIComponent(token)}`,
    );
    clients.push(ws);
    return ws;
  }

  it('never delivers a pong frame to a wordle socket or a wordle frame to a pong socket, across multiple instances', async () => {
    server = new ActivityRealtimeServer({ port: 0 });
    wirePongActivity(server);
    wireWordleActivity(server);
    await server.whenReady();
    port = server.port!;

    const pongReceived: { instanceId: string; data: unknown[] } = {
      instanceId: 'inst-1',
      data: [],
    };
    const wordleReceived: { instanceId: string; data: unknown[] } = {
      instanceId: 'inst-2',
      data: [],
    };

    const pongToken = mintWsSessionToken({
      userId: 'user-pong',
      instanceId: 'inst-1',
      guildId: 'guild-1',
      mode: 'single',
      game: 'pong',
      difficulty: 'easy',
    });
    const wordleToken = mintWsSessionToken({
      userId: 'user-wordle',
      instanceId: 'inst-2',
      guildId: 'guild-2',
      mode: 'single',
      game: 'wordle',
    });

    const wsPong = connect(pongToken);
    const wsWordle = connect(wordleToken);

    wsPong.on('message', (data, isBinary) => {
      pongReceived.data.push(isBinary ? 'binary' : JSON.parse(data.toString()));
    });
    wsWordle.on('message', (data, isBinary) => {
      wordleReceived.data.push(
        isBinary ? 'binary' : JSON.parse(data.toString()),
      );
    });

    await Promise.all([waitForOpen(wsPong), waitForOpen(wsWordle)]);

    // Adversarial: send Pong's exact type vocabulary from the Wordle socket,
    // and vice versa. If dispatch ever crossed games, one of these would
    // show up on the wrong socket's received list.
    wsWordle.send(JSON.stringify({ type: 'input', payload: {} }));
    wsWordle.send(JSON.stringify({ type: 'restart', payload: {} }));
    wsPong.send(JSON.stringify({ type: 'guess', payload: { guess: 'xxxxx' } }));

    // Pong's bot session ticks and produces real binary snapshots — proof
    // that the wordle socket never ends up subscribed to a pong room.
    await wait(60);

    expect(pongReceived.data.some((m) => m === 'binary')).toBe(true);
    expect(wordleReceived.data.some((m) => m === 'binary')).toBe(false);

    const wordleMessageTypes = wordleReceived.data
      .filter((m): m is { type: string } => typeof m === 'object' && m !== null)
      .map((m) => m.type);
    // Only ever its own 'init' (from join) — the 'input'/'restart' it sent
    // under Pong's vocabulary must never come back as a Pong-shaped reply,
    // and nothing it sent should have reached Pong's handlers at all.
    expect(wordleMessageTypes).toEqual(['init']);

    const pongMessageTypes = pongReceived.data
      .filter((m): m is { type: string } => typeof m === 'object' && m !== null)
      .map((m) => m.type);
    expect(pongMessageTypes).toContain('init');
    expect(pongMessageTypes).not.toContain('guess_result');
    expect(pongMessageTypes).not.toContain('guess_error');
  });

  it('keeps N concurrent sockets across mixed games and instances fully partitioned', async () => {
    server = new ActivityRealtimeServer({ port: 0 });
    wirePongActivity(server);
    wireWordleActivity(server);
    await server.whenReady();
    port = server.port!;

    const sockets: {
      kind: 'pong' | 'wordle';
      ws: WebSocket;
      received: unknown[];
    }[] = [];

    for (let i = 0; i < 3; i++) {
      const pongToken = mintWsSessionToken({
        userId: `pong-user-${i}`,
        instanceId: `pong-inst-${i}`,
        guildId: 'guild-1',
        mode: 'single',
        game: 'pong',
      });
      const wordleToken = mintWsSessionToken({
        userId: `wordle-user-${i}`,
        instanceId: `wordle-inst-${i}`,
        guildId: 'guild-1',
        mode: 'single',
        game: 'wordle',
      });

      const wsPong = connect(pongToken);
      const wsWordle = connect(wordleToken);
      const pongEntry = {
        kind: 'pong' as const,
        ws: wsPong,
        received: [] as unknown[],
      };
      const wordleEntry = {
        kind: 'wordle' as const,
        ws: wsWordle,
        received: [] as unknown[],
      };
      wsPong.on('message', (data, isBinary) =>
        pongEntry.received.push(
          isBinary ? 'binary' : JSON.parse(data.toString()),
        ),
      );
      wsWordle.on('message', (data, isBinary) =>
        wordleEntry.received.push(
          isBinary ? 'binary' : JSON.parse(data.toString()),
        ),
      );
      sockets.push(pongEntry, wordleEntry);
    }

    await Promise.all(sockets.map((s) => waitForOpen(s.ws)));

    // Fire guesses from every wordle socket and inputs from every pong
    // socket concurrently.
    for (const s of sockets) {
      if (s.kind === 'wordle') {
        s.ws.send(
          JSON.stringify({ type: 'guess', payload: { guess: 'zzzzz' } }),
        );
      } else {
        s.ws.send(
          JSON.stringify({ type: 'input', payload: { direction: 1, seq: 1 } }),
        );
      }
    }

    await wait(60);

    for (const s of sockets) {
      const jsonTypes = s.received
        .filter(
          (m): m is { type: string } => typeof m === 'object' && m !== null,
        )
        .map((m) => m.type);
      if (s.kind === 'wordle') {
        expect(s.received.some((m) => m === 'binary')).toBe(false);
        expect(
          jsonTypes.every((t) => t === 'init' || t.startsWith('guess')),
        ).toBe(true);
      } else {
        expect(
          jsonTypes.every((t) => t === 'init' || t === 'restart_status'),
        ).toBe(true);
      }
    }
  });
});
