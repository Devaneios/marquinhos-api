import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

const { Server } = await import('colyseus');
const { WebSocketTransport } = await import('@colyseus/ws-transport');
const { boot } = await import('@colyseus/testing');
const { MatchRoom } = await import('../src/realtime/MatchRoom');
const { mintWsSessionToken } =
  await import('../src/services/activity/wsSessionToken');
const { roomKey } = await import('../src/services/activity/roomKey');
const { ACTION_REJECTED } =
  await import('../src/services/activity/shared/ActionResult');

type ColyseusTestServer = import('@colyseus/testing').ColyseusTestServer;

let colyseus: ColyseusTestServer;

function ticTacToeCreds(userId: string, roomId: string) {
  const key = roomKey({
    instanceId: 'inst-1',
    game: 'tic-tac-toe',
    mode: 'multi',
    userId,
    roomId,
  });
  const token = mintWsSessionToken({
    userId,
    instanceId: 'inst-1',
    guildId: 'guild-1',
    mode: 'multi',
    game: 'tic-tac-toe',
    roomId,
  });
  return { key, token };
}

// Plays out the exact move sequence used throughout this file: X (user-a)
// completes the top row on move 5, with O (user-b) losing.
async function playXWinsTopRow(
  room: Awaited<ReturnType<ColyseusTestServer['createRoom']>>,
  clientA: Awaited<ReturnType<ColyseusTestServer['connectTo']>>,
  clientB: Awaited<ReturnType<ColyseusTestServer['connectTo']>>,
) {
  clientA.send('move', { row: 0, col: 0 });
  await room.waitForNextPatch();
  clientB.send('move', { row: 1, col: 0 });
  await room.waitForNextPatch();
  clientA.send('move', { row: 0, col: 1 });
  await room.waitForNextPatch();
  clientB.send('move', { row: 1, col: 1 });
  await room.waitForNextPatch();
  clientA.send('move', { row: 0, col: 2 }); // X completes the top row
  await room.waitForNextPatch();
}

// Shared setup: two players play out a match to a decisive win with the
// queue OFF (so nothing auto-rotates), then the host turns the queue on and
// a third client joins it — leaving a stable, concluded match with a seated
// winner+loser and one queued challenger, ready for a deliberate manual
// `rotate_seat` or an explicit `'leave'` in a test.
async function concludedMatchWithQueue(roomId: string) {
  const { key } = ticTacToeCreds('user-a', roomId);
  const room = await colyseus.createRoom('match', {
    roomKey: key,
    game: 'tic-tac-toe',
    queueEnabled: false,
  });
  const clientA = await colyseus.connectTo(room, {
    token: ticTacToeCreds('user-a', roomId).token,
    roomKey: key,
  });
  const clientB = await colyseus.connectTo(room, {
    token: ticTacToeCreds('user-b', roomId).token,
    roomKey: key,
  });

  await playXWinsTopRow(room, clientA, clientB);

  clientA.send('toggle_queue', { enabled: true });
  await room.waitForNextPatch();

  return { room, key, clientA, clientB };
}

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

  it('does not leak game_ready broadcasts across two concurrent Tic-Tac-Toe rooms', async () => {
    // ADAPTER_REGISTRY holds one shared adapter object per game across every
    // concurrent room of that game. Regression test for a bug where the
    // Tic-Tac-Toe adapter captured its AdapterContext in a module-level
    // variable inside setup() — the second room's setup() call clobbered the
    // first room's captured context, so a game_ready broadcast triggered by
    // filling room A's second seat would fire through room B's ctx.broadcast
    // into room B's connections instead. Room A is created first but filled
    // second, which is the exact ordering that would trigger the bug: room
    // B's setup() (called when B is created, after A) overwrites the
    // module-level capture before A's second player ever joins.
    function ticTacToeSession(userId: string, roomId: string) {
      const key = roomKey({
        instanceId: 'inst-1',
        game: 'tic-tac-toe',
        mode: 'multi',
        userId,
        roomId,
      });
      const token = mintWsSessionToken({
        userId,
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
        game: 'tic-tac-toe',
        roomId,
      });
      return { key, token };
    }

    const a1 = ticTacToeSession('a-user-1', 'ROOMA');
    const roomA = await colyseus.createRoom('match', {
      roomKey: a1.key,
      game: 'tic-tac-toe',
    });
    const clientA1 = await colyseus.connectTo(roomA, {
      token: a1.token,
      roomKey: a1.key,
    });
    await clientA1.waitForNextMessage(); // init

    const b1 = ticTacToeSession('b-user-1', 'ROOMB');
    const roomB = await colyseus.createRoom('match', {
      roomKey: b1.key,
      game: 'tic-tac-toe',
    });
    const clientB1 = await colyseus.connectTo(roomB, {
      token: b1.token,
      roomKey: b1.key,
    });
    await clientB1.waitForNextMessage(); // init

    const b2 = ticTacToeSession('b-user-2', 'ROOMB');
    const clientB2 = await colyseus.connectTo(roomB, {
      token: b2.token,
      roomKey: b2.key,
    });
    await clientB2.waitForNextMessage(); // init

    let aGotGameReady = false;
    let bGotGameReady = false;
    clientA1.onMessage('game_ready', () => {
      aGotGameReady = true;
    });
    clientB1.onMessage('game_ready', () => {
      bGotGameReady = true;
    });

    const a2 = ticTacToeSession('a-user-2', 'ROOMA');
    const clientA2 = await colyseus.connectTo(roomA, {
      token: a2.token,
      roomKey: a2.key,
    });
    await clientA2.waitForNextMessage(); // init

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(aGotGameReady).toBe(true);
    expect(bGotGameReady).toBe(false);
  });

  it('rotates the loser to the back of the queue and promotes the queue head', async () => {
    const key = roomKey({
      instanceId: 'inst-1',
      game: 'tic-tac-toe',
      mode: 'multi',
      userId: 'user-a',
      roomId: 'ROOM02',
    });
    const room = await colyseus.createRoom('match', {
      roomKey: key,
      game: 'tic-tac-toe',
      queueEnabled: true,
    });

    const tokenFor = (userId: string) =>
      mintWsSessionToken({
        userId,
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
        game: 'tic-tac-toe',
        roomId: 'ROOM02',
      });

    const clientA = await colyseus.connectTo(room, {
      token: tokenFor('user-a'),
      roomKey: key,
    });
    const clientB = await colyseus.connectTo(room, {
      token: tokenFor('user-b'),
      roomKey: key,
    });
    const clientC = await colyseus.connectTo(room, {
      token: tokenFor('user-c'),
      roomKey: key,
    });

    // user-a is X, user-b is O, user-c queues. X wins top row; O (user-b)
    // should rotate to the back of the queue and user-c should be promoted.
    clientA.send('move', { row: 0, col: 0 });
    await room.waitForNextPatch();
    clientB.send('move', { row: 1, col: 0 });
    await room.waitForNextPatch();
    clientA.send('move', { row: 0, col: 1 });
    await room.waitForNextPatch();
    clientB.send('move', { row: 1, col: 1 });
    await room.waitForNextPatch();
    clientA.send('move', { row: 0, col: 2 });
    await room.waitForNextPatch();

    // Room-level "match ended, queue rotated" happens synchronously inside
    // the room's message handler, driven off the same session state the
    // move above already flushed — no further tick to wait for.
    const roomInternals = room as unknown as {
      members: Array<{ userId: string; role: string }>;
    };
    const b = roomInternals.members.find((m) => m.userId === 'user-b');
    const c = roomInternals.members.find((m) => m.userId === 'user-c');
    expect(b?.role).toBe('queued');
    expect(c?.role).toBe('player');

    clientA.leave();
    clientB.leave();
    clientC.leave();
  });

  it('does not cascade a rotation onto the next broadcast once a match has already rotated', async () => {
    // Regression test for the bug where `maybeRotateAfterMatchEnd()` had no
    // "already rotated" guard: the engine's winner stays set until both
    // remaining players vote restart, so the very next broadcast (here, a
    // partial restart vote) would recompute "loser" as the just-promoted
    // challenger and rotate them straight back out.
    const key = roomKey({
      instanceId: 'inst-1',
      game: 'tic-tac-toe',
      mode: 'multi',
      userId: 'user-a',
      roomId: 'ROOM20',
    });
    const room = await colyseus.createRoom('match', {
      roomKey: key,
      game: 'tic-tac-toe',
      queueEnabled: true,
    });

    const clientA = await colyseus.connectTo(room, {
      token: ticTacToeCreds('user-a', 'ROOM20').token,
      roomKey: key,
    });
    const clientB = await colyseus.connectTo(room, {
      token: ticTacToeCreds('user-b', 'ROOM20').token,
      roomKey: key,
    });
    const clientC = await colyseus.connectTo(room, {
      token: ticTacToeCreds('user-c', 'ROOM20').token,
      roomKey: key,
    });
    const clientD = await colyseus.connectTo(room, {
      token: ticTacToeCreds('user-d', 'ROOM20').token,
      roomKey: key,
    });

    await playXWinsTopRow(room, clientA, clientB);

    const roomInternals = room as unknown as {
      members: Array<{ userId: string; role: string }>;
    };
    // First rotation: user-b (loser) -> queued, user-c (queue head) -> player.
    expect(roomInternals.members.find((m) => m.userId === 'user-b')?.role).toBe(
      'queued',
    );
    expect(roomInternals.members.find((m) => m.userId === 'user-c')?.role).toBe(
      'player',
    );
    expect(roomInternals.members.find((m) => m.userId === 'user-d')?.role).toBe(
      'queued',
    );

    // A partial restart vote still broadcasts `restart_status` (only 1 of the
    // 2 required votes is in), which re-invokes the ctx.broadcast rotation
    // hook against the same still-set winner. Without the dedup guard this
    // would incorrectly rotate user-c back out and promote user-d.
    clientA.send('restart', {});
    await room.waitForNextPatch();

    expect(roomInternals.members.find((m) => m.userId === 'user-c')?.role).toBe(
      'player',
    );
    expect(roomInternals.members.find((m) => m.userId === 'user-d')?.role).toBe(
      'queued',
    );
    expect(roomInternals.members.find((m) => m.userId === 'user-b')?.role).toBe(
      'queued',
    );

    clientA.leave();
    clientB.leave();
    clientC.leave();
    clientD.leave();
  });

  describe('switch_game', () => {
    it('rejects a non-host request', async () => {
      const { key } = ticTacToeCreds('user-a', 'ROOM30');
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'tic-tac-toe',
      });
      const clientA = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-a', 'ROOM30').token,
        roomKey: key,
      });
      const clientB = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-b', 'ROOM30').token,
        roomKey: key,
      });

      const rejection = new Promise<{ error: string }>((resolve) => {
        clientB.onMessage(ACTION_REJECTED, (payload: { error: string }) =>
          resolve(payload),
        );
      });
      clientB.send('switch_game', { game: 'hangman' });
      const payload = await rejection;
      expect(payload.error).toMatch(/host/i);

      clientA.leave();
      clientB.leave();
    });

    it('rejects a switch while a match is in progress', async () => {
      const { key } = ticTacToeCreds('user-a', 'ROOM31');
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'tic-tac-toe',
      });
      const clientA = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-a', 'ROOM31').token,
        roomKey: key,
      });
      const clientB = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-b', 'ROOM31').token,
        roomKey: key,
      });

      // Both seats are full and there's no winner yet — a match is in progress.
      const rejection = new Promise<{ error: string }>((resolve) => {
        clientA.onMessage(ACTION_REJECTED, (payload: { error: string }) =>
          resolve(payload),
        );
      });
      clientA.send('switch_game', { game: 'hangman' });
      const payload = await rejection;
      expect(payload.error).toMatch(/mid-match/i);

      clientA.leave();
      clientB.leave();
    });

    it("rejects 'cards' as a switch target", async () => {
      const { key, token } = ticTacToeCreds('user-a', 'ROOM32');
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'tic-tac-toe',
      });
      const clientA = await colyseus.connectTo(room, { token, roomKey: key });

      const rejection = new Promise<{ error: string }>((resolve) => {
        clientA.onMessage(ACTION_REJECTED, (payload: { error: string }) =>
          resolve(payload),
        );
      });
      clientA.send('switch_game', { game: 'cards' });
      const payload = await rejection;
      expect(payload.error).toMatch(/unknown or unswitchable/i);

      clientA.leave();
    });

    it('rejects an unregistered game id', async () => {
      const { key, token } = ticTacToeCreds('user-a', 'ROOM33');
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'tic-tac-toe',
      });
      const clientA = await colyseus.connectTo(room, { token, roomKey: key });

      const rejection = new Promise<{ error: string }>((resolve) => {
        clientA.onMessage(ACTION_REJECTED, (payload: { error: string }) =>
          resolve(payload),
        );
      });
      clientA.send('switch_game', { game: 'not-a-real-game' });
      const payload = await rejection;
      expect(payload.error).toMatch(/unknown or unswitchable/i);

      clientA.leave();
    });
  });

  describe('toggle_queue', () => {
    it('flips queueEnabled and updates room metadata when the host toggles it', async () => {
      const { key, token } = ticTacToeCreds('user-a', 'ROOM34');
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'tic-tac-toe',
      });
      const clientA = await colyseus.connectTo(room, { token, roomKey: key });

      clientA.send('toggle_queue', { enabled: true });
      await room.waitForNextPatch();

      expect(
        (room as unknown as { metadata: { queueEnabled: boolean } }).metadata
          .queueEnabled,
      ).toBe(true);

      clientA.leave();
    });

    it('rejects a non-host request and leaves queueEnabled unchanged', async () => {
      const { key, token: tokenA } = ticTacToeCreds('user-a', 'ROOM35');
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'tic-tac-toe',
      });
      const clientA = await colyseus.connectTo(room, {
        token: tokenA,
        roomKey: key,
      });
      const clientB = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-b', 'ROOM35').token,
        roomKey: key,
      });

      const rejection = new Promise<{ error: string }>((resolve) => {
        clientB.onMessage(ACTION_REJECTED, (payload: { error: string }) =>
          resolve(payload),
        );
      });
      clientB.send('toggle_queue', { enabled: true });
      const payload = await rejection;
      expect(payload.error).toMatch(/host/i);
      expect(
        (room as unknown as { metadata: { queueEnabled: boolean } }).metadata
          .queueEnabled,
      ).toBe(false);

      clientA.leave();
      clientB.leave();
    });
  });

  describe('rotate_seat', () => {
    it('rejects a request from someone who is not a seated player', async () => {
      const { room, key, clientA, clientB } =
        await concludedMatchWithQueue('ROOM36');
      const clientC = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-c', 'ROOM36').token,
        roomKey: key,
      });

      const rejection = new Promise<{ error: string }>((resolve) => {
        clientC.onMessage(ACTION_REJECTED, (payload: { error: string }) =>
          resolve(payload),
        );
      });
      clientC.send('rotate_seat');
      const payload = await rejection;
      expect(payload.error).toMatch(/seated player/i);

      clientA.leave();
      clientB.leave();
      clientC.leave();
    });

    it('rejects a request when the queue is empty', async () => {
      const { clientA, clientB } = await concludedMatchWithQueue('ROOM37');

      const rejection = new Promise<{ error: string }>((resolve) => {
        clientA.onMessage(ACTION_REJECTED, (payload: { error: string }) =>
          resolve(payload),
        );
      });
      clientA.send('rotate_seat');
      const payload = await rejection;
      expect(payload.error).toMatch(/no one is waiting/i);

      clientA.leave();
      clientB.leave();
    });

    it('succeeds and promotes the queue head when a seated player rotates out', async () => {
      const { room, key, clientA, clientB } =
        await concludedMatchWithQueue('ROOM38');
      const clientC = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-c', 'ROOM38').token,
        roomKey: key,
      });

      clientB.send('rotate_seat');
      await room.waitForNextPatch();

      const roomInternals = room as unknown as {
        members: Array<{ userId: string; role: string }>;
      };
      expect(
        roomInternals.members.find((m) => m.userId === 'user-b')?.role,
      ).toBe('queued');
      expect(
        roomInternals.members.find((m) => m.userId === 'user-c')?.role,
      ).toBe('player');

      clientA.leave();
      clientB.leave();
      clientC.leave();
    });

    it('does not get reversed by a later broadcast for the same match', async () => {
      // Regression test: a manual rotate_seat must also arm the
      // rotatedForCurrentMatch guard, or the very next broadcast for this
      // still-unrestarted match (here, a partial restart vote) would find
      // the guard untouched, see the same winner still set, and
      // auto-rotate the just-promoted player straight back out.
      const { room, key, clientA, clientB } =
        await concludedMatchWithQueue('ROOM39');
      const clientC = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-c', 'ROOM39').token,
        roomKey: key,
      });
      const clientD = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-d', 'ROOM39').token,
        roomKey: key,
      });

      clientB.send('rotate_seat');
      await room.waitForNextPatch();

      const roomInternals = room as unknown as {
        members: Array<{ userId: string; role: string }>;
      };
      expect(
        roomInternals.members.find((m) => m.userId === 'user-c')?.role,
      ).toBe('player');
      expect(
        roomInternals.members.find((m) => m.userId === 'user-d')?.role,
      ).toBe('queued');

      // The winner's restart vote is only 1 of the 2 now required — it
      // still broadcasts `restart_status`, re-invoking the deferred
      // rotation hook against the same still-set winner.
      clientA.send('restart', {});
      await room.waitForNextPatch();

      expect(
        roomInternals.members.find((m) => m.userId === 'user-c')?.role,
      ).toBe('player');
      expect(
        roomInternals.members.find((m) => m.userId === 'user-d')?.role,
      ).toBe('queued');
      expect(
        roomInternals.members.find((m) => m.userId === 'user-b')?.role,
      ).toBe('queued');

      clientA.leave();
      clientB.leave();
      clientC.leave();
      clientD.leave();
    });
  });

  describe("'leave' message after a match concludes", () => {
    it("promotes the queue head into the departing player's vacated seat", async () => {
      // TicTacToeSession.leave() -> detach() unconditionally removes the
      // departing player from the session (forfeit-then-remove), even when
      // the match had already concluded — so the queue hand-off has to be
      // attempted BEFORE the adapter's own 'leave' handler runs, while the
      // departing player's marker is still present for substitutePlayer()
      // to find. This exercises that ordering: the match is already over
      // (user-a won) before user-b, the loser, explicitly leaves.
      const { room, key, clientA, clientB } =
        await concludedMatchWithQueue('ROOM40');
      const clientC = await colyseus.connectTo(room, {
        token: ticTacToeCreds('user-c', 'ROOM40').token,
        roomKey: key,
      });

      // user-b (the loser) sends the application-level 'leave' message
      // rather than closing the socket.
      clientB.send('leave');
      await room.waitForNextPatch();

      const roomInternals = room as unknown as {
        members: Array<{ userId: string; role: string }>;
      };
      expect(
        roomInternals.members.find((m) => m.userId === 'user-b'),
      ).toBeUndefined();
      expect(
        roomInternals.members.find((m) => m.userId === 'user-c')?.role,
      ).toBe('player');

      clientA.leave();
      clientC.leave();
    });
  });

  describe('Connect Four', () => {
    function connectFourCreds(userId: string, roomId: string) {
      const key = roomKey({
        instanceId: 'inst-1',
        game: 'connect-four',
        mode: 'multi',
        userId,
        roomId,
      });
      const token = mintWsSessionToken({
        userId,
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
        game: 'connect-four',
        roomId,
      });
      return { key, token };
    }

    // p1 (user-a) wins with a vertical line in column 0; p2 (user-b) drops
    // into column 1 between each of user-a's moves so it never blocks.
    async function playP1WinsColumnZero(
      room: Awaited<ReturnType<ColyseusTestServer['createRoom']>>,
      clientA: Awaited<ReturnType<ColyseusTestServer['connectTo']>>,
      clientB: Awaited<ReturnType<ColyseusTestServer['connectTo']>>,
    ) {
      clientA.send('drop', { col: 0 });
      await room.waitForNextPatch();
      clientB.send('drop', { col: 1 });
      await room.waitForNextPatch();
      clientA.send('drop', { col: 0 });
      await room.waitForNextPatch();
      clientB.send('drop', { col: 1 });
      await room.waitForNextPatch();
      clientA.send('drop', { col: 0 });
      await room.waitForNextPatch();
      clientB.send('drop', { col: 1 });
      await room.waitForNextPatch();
      clientA.send('drop', { col: 0 }); // p1 completes a vertical line in col 0
      await room.waitForNextPatch();
    }

    it('sends init with a null disc to a spectator/queued joiner', async () => {
      const key = roomKey({
        instanceId: 'inst-1',
        game: 'connect-four',
        mode: 'multi',
        userId: 'user-a',
        roomId: 'ROOM50',
      });
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'connect-four',
      });
      const clientA = await colyseus.connectTo(room, {
        token: connectFourCreds('user-a', 'ROOM50').token,
        roomKey: key,
      });
      const clientB = await colyseus.connectTo(room, {
        token: connectFourCreds('user-b', 'ROOM50').token,
        roomKey: key,
      });

      const clientC = await colyseus.connectTo(room, {
        token: connectFourCreds('user-c', 'ROOM50').token,
        roomKey: key,
      });
      const [, payload] = (await clientC.waitForNextMessage()) as [
        string,
        { disc: string | null },
      ];
      expect(payload.disc).toBeNull();

      clientA.leave();
      clientB.leave();
      clientC.leave();
    });

    it("promotes the queue head into the departing player's vacated seat on an explicit 'leave'", async () => {
      const key = roomKey({
        instanceId: 'inst-1',
        game: 'connect-four',
        mode: 'multi',
        userId: 'user-a',
        roomId: 'ROOM51',
      });
      const room = await colyseus.createRoom('match', {
        roomKey: key,
        game: 'connect-four',
        queueEnabled: false,
      });
      const clientA = await colyseus.connectTo(room, {
        token: connectFourCreds('user-a', 'ROOM51').token,
        roomKey: key,
      });
      const clientB = await colyseus.connectTo(room, {
        token: connectFourCreds('user-b', 'ROOM51').token,
        roomKey: key,
      });

      await playP1WinsColumnZero(room, clientA, clientB);

      clientA.send('toggle_queue', { enabled: true });
      await room.waitForNextPatch();

      const clientC = await colyseus.connectTo(room, {
        token: connectFourCreds('user-c', 'ROOM51').token,
        roomKey: key,
      });

      // user-b (the loser) sends the application-level 'leave' message
      // rather than closing the socket — this is the exact wiring the
      // ConnectFourAdapter was missing.
      clientB.send('leave');
      await room.waitForNextPatch();

      const roomInternals = room as unknown as {
        members: Array<{ userId: string; role: string }>;
      };
      expect(
        roomInternals.members.find((m) => m.userId === 'user-b'),
      ).toBeUndefined();
      expect(
        roomInternals.members.find((m) => m.userId === 'user-c')?.role,
      ).toBe('player');

      clientA.leave();
      clientC.leave();
    });
  });
});
