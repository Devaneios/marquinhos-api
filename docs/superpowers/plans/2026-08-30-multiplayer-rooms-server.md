# Multiplayer Rooms (Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 19 per-game Colyseus `Room` subclasses in `src/realtime/` with one generic `MatchRoom` driven by per-game `GameRoomAdapter`s, adding host authority, spectating, and queue-based winner-stays-on rotation without rewriting any game engine.

**Architecture:** One Colyseus room type (`'match'`) owns everything cross-cutting (host, seat assignment, queue rotation, game-switching) as synced state; each of the 19 games becomes a `GameRoomAdapter` wrapping its existing, unchanged `*Session`/`*Engine` classes. The 6 games eligible for queueing (tic-tac-toe, connect-four, checkers, rock-paper-scissors, battleship, pong) each gain two small new session methods — `getWinnerUserId()` and `substitutePlayer()` — since none of them can currently reseat a single vacated slot without colliding with the remaining player's marker.

**Tech Stack:** Colyseus 0.17 (`colyseus`, `@colyseus/ws-transport`, `@colyseus/testing`), Bun test runner, TypeScript, Express/Zod for REST.

**Spec:** `docs/superpowers/specs/2026-08-30-multiplayer-rooms-server-design.md` (companion client spec: `marquinhos-activity-client/docs/superpowers/specs/2026-08-30-multiplayer-rooms-client-design.md`)

**Corrections to the spec, discovered while writing this plan:**
1. The spec describes `MatchRoom` "wrapping the broadcaster" to intercept `extractWinnerUserId(broadcastType, payload)`. Having now read all 6 queue-eligible sessions in full, this doesn't work: three incompatible broadcaster shapes exist (`ActivityBroadcaster.broadcast`, Pong's added `broadcastBinary`, and Battleship's `PerClientBroadcaster.sendToPlayer`/`broadcastPublic`), and none of their payloads carry a `userId` — only an internal marker (`'X'`, `'p1'`, `'red'`, `'left'`, a `'player1'|'player2'` id) that only the session's private player list can resolve. This plan instead has each queue-eligible session expose a plain `getWinnerUserId(): string | null` method that `MatchRoom` polls after routing each message — no broadcast interception.
2. The spec's room-listing metadata includes `hostName`, but `WsSessionPayload` only ever carries a `userId`, never a display name — the server has nothing to put there. This plan's `syncMetadata()` sets `hostUserId` instead; resolving a display name from it is a client-side concern.

Task 22 (final cutover) includes updating both spec documents to match both corrections.

## Global Constraints

- Existing per-game `Session`/`Engine` classes are not rewritten — only their Colyseus integration (`*Room.ts`) is replaced by an adapter wrapping the same session.
- Existing message protocols per game (message names/payload shapes) are unchanged.
- `verifyWsSessionToken`/`wsSessionToken` signing logic is reused as-is; `roomId` becomes part of the signed payload and part of what `roomKey()` encodes.
- Rate limiting per message type (`RateLimiter`) moves into each adapter's own `onCreate`, exactly as today — no change to `RateLimiter` itself.
- Test runner is `bun test` (`bun:test` imports); Colyseus room-level tests use `@colyseus/testing`'s `boot`/`ColyseusTestServer`, matching `tests/battleshipRoom.test.ts`.
- Never use `git commit` (per user's global instructions) — every task ends with a `git add` + local verification, no commit step.

---

### Task 1: `roomKey()` and `WsSessionPayload` gain a `roomId` axis

**Files:**
- Modify: `src/services/activity/roomKey.ts`
- Modify: `src/services/activity/wsSessionToken.ts`
- Modify: `tests/roomKey.test.ts`
- Test: `tests/wsSessionToken.test.ts` (extend existing)

**Interfaces:**
- Produces: `roomKey({ instanceId, game, mode, userId, roomId?, ruleset? }): string` — `roomId` required (throws if missing) when `mode === 'multi'`, ignored otherwise. `WsSessionPayload` gains `roomId?: string`, validated/round-tripped by `verifyWsSessionToken`.

Current `roomKey()` (full file, for reference — this task rewrites it):
```ts
export interface ActivityScope {
  instanceId: string;
  game: GameId;
  mode: ActivityMode;
  userId: string;
  ruleset?: string;
}

export function roomKey({
  instanceId,
  game,
  mode,
  userId,
  ruleset,
}: ActivityScope): string {
  const base =
    mode === 'multi'
      ? `${instanceId}:${game}:multi`
      : `${instanceId}:${game}:${mode}:${userId}`;
  return ruleset ? `${base}:${ruleset}` : base;
}
```

- [ ] **Step 1: Write the failing tests for the new `roomId` axis**

Add to `tests/roomKey.test.ts` (keep all existing `it` blocks — they still pass unchanged for `mode: 'single'`/`'local'`; only the `mode: 'multi'` ones below are new/changed):

```ts
  it('requires a roomId for multi-mode sessions and scopes the key to it', () => {
    expect(
      roomKey({
        instanceId: 'inst-1',
        game: 'pong',
        mode: 'multi',
        userId: 'user-1',
        roomId: 'ABC123',
      }),
    ).toBe('inst-1:ABC123:pong:multi');
  });

  it('throws when mode is multi and roomId is missing', () => {
    expect(() =>
      roomKey({
        instanceId: 'inst-1',
        game: 'pong',
        mode: 'multi',
        userId: 'user-1',
      }),
    ).toThrow();
  });

  it('appends the ruleset after the roomId-scoped multi-mode base', () => {
    expect(
      roomKey({
        instanceId: 'inst-1',
        game: 'cards',
        mode: 'multi',
        userId: 'user-1',
        roomId: 'ABC123',
        ruleset: 'truco',
      }),
    ).toBe('inst-1:ABC123:cards:multi:truco');
  });
```

Update the two existing multi-mode assertions (`'scopes multi-mode sessions...'` and `'is unaffected by an absent ruleset...'` and `'appends the ruleset to a multi-mode key...'`) to pass `roomId: 'ABC123'` and expect `'inst-1:ABC123:pong:multi'` / `'inst-1:ABC123:cards:multi:truco'` instead of the old `roomId`-less strings — they exercise the same behavior, just through the new required parameter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/roomKey.test.ts`
Expected: FAIL — `roomKey` doesn't accept/require `roomId` yet, so the new-format assertions produce the old strings and the throw assertion doesn't throw.

- [ ] **Step 3: Rewrite `roomKey()`**

```ts
import type { ActivityMode, GameId } from './gameId';

export interface ActivityScope {
  instanceId: string;
  game: GameId;
  mode: ActivityMode;
  userId: string;
  // Required for mode 'multi' (a room subdivides a Discord instance);
  // absent for 'single'/'local', which stay scoped per-user as before.
  roomId?: string;
  // Only meaningful for games that host more than one pluggable ruleset
  // (cards). Appended when present so two people in the same Activity
  // instance choosing different rulesets never collide on room key; absent
  // for every other caller, so this is purely additive.
  ruleset?: string;
}

export function roomKey({
  instanceId,
  game,
  mode,
  userId,
  roomId,
  ruleset,
}: ActivityScope): string {
  let base: string;
  if (mode === 'multi') {
    if (!roomId) {
      throw new Error('roomKey: roomId is required for mode "multi"');
    }
    base = `${instanceId}:${roomId}:${game}:multi`;
  } else {
    base = `${instanceId}:${game}:${mode}:${userId}`;
  }
  return ruleset ? `${base}:${ruleset}` : base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/roomKey.test.ts`
Expected: PASS

- [ ] **Step 5: Extend `WsSessionPayload` and `verifyWsSessionToken` with `roomId`**

Read `tests/wsSessionToken.test.ts` first to match its existing assertion style before adding to it. Add a new `it` block asserting: `mintWsSessionToken({ ..., mode: 'multi', roomId: 'ABC123' })` then `verifyWsSessionToken(token)` returns an object with `roomId: 'ABC123'`, and a second `it` asserting a token minted without `roomId` round-trips with `roomId` absent (`undefined`) from the returned object — mirroring the existing `ruleset`/`difficulty`/`winningScore` optional-field tests in that file.

In `src/services/activity/wsSessionToken.ts`, add `roomId?: string;` to the `WsSessionPayload` interface (next to the existing `ruleset?: string;` field), and in `verifyWsSessionToken`, add `typeof parsed?.roomId === 'string' || parsed?.roomId === undefined` to the validation `if` condition (alongside `hasValidRuleset` etc. — name it `hasValidRoomId` for consistency) and add `...(parsed.roomId !== undefined ? { roomId: parsed.roomId } : {})` to the returned object, in the same style as the existing `ruleset`/`options` spreads.

- [ ] **Step 6: Run the full test file to verify it passes**

Run: `bun test tests/wsSessionToken.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/activity/roomKey.ts src/services/activity/wsSessionToken.ts tests/roomKey.test.ts tests/wsSessionToken.test.ts
git status
```
(Per this repo's constraint, do not run `git commit` — stage and verify only.)

---

### Task 2: `POST /activities/rooms` endpoint + `roomId` in `/activities/ws-session`

**Files:**
- Modify: `src/schemas/activity.schema.ts`
- Modify: `src/controllers/activity.controller.ts`
- Modify: `src/routes/activity.route.ts`
- Test: `tests/activitySchema.test.ts` (extend)
- Test: `tests/activityController.test.ts` (extend)

**Interfaces:**
- Consumes: `roomKey()` and `WsSessionPayload`/`mintWsSessionToken`/`verifyWsSessionToken` from Task 1.
- Produces: `POST /api/activities/rooms` → `{ data: { roomId: string, token: string, roomKey: string } }`. `POST /api/activities/ws-session` body gains optional `roomId: string`, required when `mode === 'multi'`.

Current `activityWsSessionSchema` (from `src/schemas/activity.schema.ts`) lacks `roomId`; current `getWsSessionToken` controller method (from `src/controllers/activity.controller.ts`) doesn't forward one to `mintWsSessionToken`/`roomKey`. Read both files in full before editing (already read during brainstorming — reproduced above in this plan's research, not repeated here) so the diff below applies cleanly.

- [ ] **Step 1: Write the failing schema test**

Read `tests/activitySchema.test.ts` first to match its existing style (it tests `activityTokenExchangeSchema`/`activityWsSessionSchema` via `.safeParse`). Add:

```ts
  it('accepts a multi-mode ws-session request with a roomId', () => {
    const result = activityWsSessionSchema.safeParse({
      body: {
        accessToken: 'token',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
        game: 'tic-tac-toe',
        roomId: 'ABC123',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a single-mode ws-session request without a roomId', () => {
    const result = activityWsSessionSchema.safeParse({
      body: {
        accessToken: 'token',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'single',
        game: 'tic-tac-toe',
      },
    });
    expect(result.success).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/activitySchema.test.ts`
Expected: PASS already for both (an unknown/optional-shaped field doesn't fail Zod's default `.object()` parsing unless the schema is `.strict()`) — check whether `activityWsSessionSchema`'s `z.object({...})` is `.strict()`. If it is not strict (it isn't, per the file read during brainstorming — plain `z.object`), these two tests will pass even before Step 3, because Zod's non-strict objects ignore unknown keys by default rather than rejecting them. In that case, skip ahead: the schema technically already "accepts" a `roomId`, it just silently drops it. Replace the two tests above with a single test asserting the field is actually *parsed through*, not just tolerated:

```ts
  it('parses roomId through when present', () => {
    const result = activityWsSessionSchema.parse({
      body: {
        accessToken: 'token',
        instanceId: 'inst-1',
        guildId: 'guild-1',
        mode: 'multi',
        game: 'tic-tac-toe',
        roomId: 'ABC123',
      },
    });
    expect(result.body.roomId).toBe('ABC123');
  });
```

Run: `bun test tests/activitySchema.test.ts`
Expected: FAIL — `result.body.roomId` is `undefined` because the schema doesn't declare the field, so Zod strips it during parsing.

- [ ] **Step 3: Add `roomId` to the schema**

In `src/schemas/activity.schema.ts`, add `roomId: z.string().min(1).optional(),` to `activityWsSessionSchema`'s `body` object (next to `winningScore`). Also add a new schema for the create-room endpoint:

```ts
export const activityCreateRoomSchema = z.object({
  body: z.object({
    accessToken: z.string().min(1),
    instanceId: z.string().min(1),
    guildId: z.string().min(1),
    game: z.enum([
      'pong',
      'wordle',
      'cards',
      'tic-tac-toe',
      'connect-four',
      'hangman',
      'battleship',
      'checkers',
      'rock-paper-scissors',
      'wordle-race',
      'minesweeper-versus',
      'trivia-quiz',
      'dominoes-block',
      'word-search-race',
      'bingo-speed',
      'tower-unstable',
      'boggle-word-race',
      'word-chain',
      'snake-game',
    ]),
    queueEnabled: z.boolean(),
  }),
});
```

(Duplicating the `game` enum here matches this file's existing style — `activityWsSessionSchema` already inlines the same enum rather than sharing a constant.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/activitySchema.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing controller test for `POST /activities/rooms`**

Read `tests/activityController.test.ts` first to match its existing mocking style (it constructs `new ActivityController(mockDiscordService)` with a stubbed `DiscordService`). Add:

```ts
  describe('createRoom', () => {
    it('mints a roomId and a multi-mode token/roomKey', async () => {
      const discordService = {
        getDiscordUser: async () => ({ id: 'user-1' }),
      } as unknown as DiscordService;
      const controller = new ActivityController(discordService);
      const req = {
        body: {
          accessToken: 'token',
          instanceId: 'inst-1',
          guildId: 'guild-1',
          game: 'tic-tac-toe',
          queueEnabled: true,
        },
      } as Request;
      const json = mock();
      const res = { status: mock(() => ({ json })) } as unknown as Response;

      await controller.createRoom(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = json.mock.calls[0][0];
      expect(typeof payload.data.roomId).toBe('string');
      expect(payload.data.roomId.length).toBeGreaterThan(0);
      expect(typeof payload.data.token).toBe('string');
      expect(payload.data.roomKey).toBe(`inst-1:${payload.data.roomId}:tic-tac-toe:multi`);
    });
  });
```

Match whatever mocking helper (`mock`, `jest.fn`-equivalent) the existing tests in this file already import from `bun:test` — reuse it rather than introducing a new one.

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/activityController.test.ts`
Expected: FAIL with "controller.createRoom is not a function"

- [ ] **Step 7: Implement `createRoom` on `ActivityController`**

In `src/controllers/activity.controller.ts`, add (using the same `nanoid` approach as the client spec's server design — install `nanoid` if not already a dependency: check `package.json` first; if absent, add it via `bun add nanoid` before this step):

```ts
import { customAlphabet } from 'nanoid';

const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
```

(Alphabet excludes visually ambiguous characters `I`, `O`, `0`, `1` — this code is only ever displayed in room-list UI, never typed, but keeping it unambiguous costs nothing.)

Add the method to the `ActivityController` class, alongside `getWsSessionToken`:

```ts
  createRoom = async (req: Request, res: Response) => {
    try {
      const { accessToken, instanceId, guildId, game, queueEnabled } =
        req.body as {
          accessToken: string;
          instanceId: string;
          guildId: string;
          game: GameId;
          queueEnabled: boolean;
        };
      const user = await this.discordService.getDiscordUser(accessToken);
      if (!user?.id) {
        return res.status(401).json({ message: 'Invalid access token' });
      }

      const roomId = generateRoomId();
      const token = mintWsSessionToken({
        userId: user.id,
        instanceId,
        guildId,
        mode: 'multi',
        game,
        roomId,
      });
      const key = roomKey({
        instanceId,
        game,
        mode: 'multi',
        userId: user.id,
        roomId,
      });
      return res.status(200).json({ data: { roomId, token, roomKey: key } });
    } catch (error) {
      logger.error('activity.controller.create_room_failed', { error });
      return res.status(500).json({ message: 'Unknown Error' });
    }
  };
```

Also update `getWsSessionToken` to forward `roomId` (destructure it from `req.body`, pass `...(roomId !== undefined ? { roomId } : {})` into both `mintWsSessionToken` and `roomKey`, exactly like the existing `ruleset`/`options` spreads in that method).

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test tests/activityController.test.ts`
Expected: PASS

- [ ] **Step 9: Wire the route**

In `src/routes/activity.route.ts`, import `activityCreateRoomSchema` and add:

```ts
router.post(
  '/rooms',
  activityLimiter,
  validateRequest(activityCreateRoomSchema),
  activity.createRoom,
);
```

- [ ] **Step 10: Run the full activity test suite**

Run: `bun test tests/activityController.test.ts tests/activitySchema.test.ts tests/roomKey.test.ts tests/wsSessionToken.test.ts`
Expected: PASS (all four files)

- [ ] **Step 11: Commit**

```bash
git add src/schemas/activity.schema.ts src/controllers/activity.controller.ts src/routes/activity.route.ts tests/activitySchema.test.ts tests/activityController.test.ts package.json
git status
```

---

### Task 3: `GameRoomAdapter` interface + `MatchRoom` core (proven with Hangman + a minimal Tic-Tac-Toe adapter)

This task builds the generic room shell — auth, seat assignment, host assignment, message dispatch, metadata — without queueing or game-switching yet (Task 4 adds those). It's proven against the two simplest adapters: Hangman (no bot, no queue, single message type) and a *minimal* Tic-Tac-Toe adapter (bot support, but queue wiring comes in Task 4).

**Files:**
- Create: `src/realtime/GameRoomAdapter.ts`
- Create: `src/realtime/MatchRoom.ts`
- Create: `src/realtime/adapters/registry.ts`
- Create: `src/realtime/adapters/hangmanAdapter.ts`
- Create: `src/realtime/adapters/ticTacToeAdapter.ts`
- Test: `tests/matchRoom.test.ts`

**Interfaces:**
- Consumes: `roomKey()`, `WsSessionPayload`, `verifyWsSessionToken` (Task 1); `RateLimiter`, `ACTION_REJECTED` (existing, unchanged).
- Produces:
  - `AdapterContext` (below) — every later adapter task consumes this exact shape.
  - `GameRoomAdapter<TSession>.setup(ctx): { session: TSession, messageHandlers: Record<string, { rateLimit?: {windowMs:number,max:number}, handle: (auth: WsSessionPayload, client: Client, payload: unknown) => void }> }` — every later adapter task implements this.
  - `GameRoomAdapter<TSession>.onJoin/onLeave/onDispose(session, ...)` — same signatures every adapter implements.
  - `ADAPTER_REGISTRY: Partial<Record<GameId, GameRoomAdapter<unknown>>>` — later tasks add one entry each; `MatchRoom` looks games up here.
  - `MatchRoom` registered under the Colyseus room name `'match'`.

- [ ] **Step 1: Write `GameRoomAdapter.ts`**

```ts
import type { Client } from 'colyseus';
import type { BotDifficulty } from '../services/activity/pong/PongBotAI';
import type { ActivityMode } from '../services/activity/gameId';
import type { WsSessionPayload } from '../services/activity/wsSessionToken';

export type SeatRole = 'player' | 'spectator' | 'queued';

// Everything an adapter needs to talk to the outside world, backed by the
// live MatchRoom instance. One shape covers all three broadcaster styles
// used across the 19 existing *Room.ts files (plain broadcast, Pong's binary
// variant, Battleship/CardTable/Dominoes' per-client sends) — each adapter
// builds whatever shape its Session constructor expects from these
// primitives, exactly as today's Room.ts files build an inline broadcaster
// object from `this.broadcast`/`this.clients`.
export interface AdapterContext {
  roomKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
  difficulty?: BotDifficulty;
  winningScore?: number;
  ruleset?: string;
  options?: Record<string, unknown>;
  broadcast: (type: string, payload?: unknown) => void;
  broadcastBinary: (type: string, data: Uint8Array) => void;
  sendToPlayer: (userId: string, type: string, payload?: unknown) => void;
  onSessionEnded: () => void;
}

export interface MessageHandler {
  rateLimit?: { windowMs: number; max: number };
  handle: (auth: WsSessionPayload, client: Client, payload: unknown) => void;
}

export interface GameRoomAdapter<TSession> {
  maxPlayers: number;
  supportsBot: boolean;
  supportsQueue: boolean;

  setup(ctx: AdapterContext): {
    session: TSession;
    messageHandlers: Record<string, MessageHandler>;
  };
  onJoin(
    session: TSession,
    auth: WsSessionPayload,
    client: Client,
    seat: SeatRole,
  ): void;
  onLeave(session: TSession, auth: WsSessionPayload, client: Client): void;
  onDispose(session: TSession): void;

  // Required only for the 6 queue-eligible games (supportsQueue: true).
  getWinnerUserId?(session: TSession): string | null;
  substitutePlayer?(
    session: TSession,
    outgoingUserId: string,
    incomingUserId: string,
    incomingClient: Client,
  ): boolean;
}
```

- [ ] **Step 2: Write the failing `MatchRoom` test (Hangman path — no bot, no queue)**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';

const { Server } = await import('colyseus');
const { WebSocketTransport } = await import('@colyseus/ws-transport');
const { boot } = await import('@colyseus/testing');
const { MatchRoom } = await import('../src/realtime/MatchRoom');
const { mintWsSessionToken } = await import(
  '../src/services/activity/wsSessionToken'
);
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — `../src/realtime/MatchRoom` doesn't exist yet.

- [ ] **Step 4: Write the Hangman adapter**

Read `src/realtime/HangmanRoom.ts` (already read in full during plan research — reproduced in the "remaining games" research above this task) and `src/services/activity/hangman/HangmanSession.ts`'s constructor signature before writing this, to confirm the constructor's exact parameter order. Based on `HangmanRoom.ts`'s existing `onCreate` (`new HangmanSession(identity, broadcaster, undefined, word, { onSessionEnded })`):

```ts
import type { Client } from 'colyseus';
import { HangmanSession } from '../../services/activity/hangman/HangmanSession';
import { getHangmanWord } from '../../services/activity/hangman/wordList';
import type { WsSessionPayload } from '../../services/activity/wsSessionToken';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const GUESS_RATE_LIMIT_WINDOW_MS = 1000;
const GUESS_RATE_LIMIT_MAX = 3;

export const hangmanAdapter: GameRoomAdapter<HangmanSession> = {
  maxPlayers: 2,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new HangmanSession(
      {
        sessionKey: ctx.roomKey,
        instanceId: ctx.instanceId,
        guildId: ctx.guildId,
        mode: ctx.mode,
      },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      getHangmanWord(),
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        guess: {
          rateLimit: { windowMs: GUESS_RATE_LIMIT_WINDOW_MS, max: GUESS_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const letter = (payload as { letter?: string })?.letter ?? '';
            const result = session.guessLetter(auth.userId, letter);
            if (!result.success) {
              client.send('guess_error', { message: result.message });
              return;
            }
            client.send('guess_success', {});
          },
        },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const added = session.addPlayer(auth.userId, client);
    if (!added) {
      client.leave(1008, 'Room is full');
      return;
    }
    client.send('init', session.getState());
  },

  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },

  onDispose(session) {
    session.dispose();
  },
};
```

Note: the original `HangmanRoom.onMessage('leave', ...)` calls `pauseForDisconnect` (not a `leave` method — `HangmanSession` has no separate `leave`, per the file read earlier), so this adapter doesn't register a `leave` message handler at all; `onLeave` (Colyseus's own disconnect hook) already calls `pauseForDisconnect`, covering both the explicit-leave and network-drop cases identically to how the original Room already conflates them.

- [ ] **Step 5: Write the minimal Tic-Tac-Toe adapter (no queue yet)**

```ts
import type { Client } from 'colyseus';
import { TicTacToeSession } from '../../services/activity/ticTacToe/TicTacToeSession';
import type { WsSessionPayload } from '../../services/activity/wsSessionToken';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const MOVE_RATE_LIMIT_WINDOW_MS = 1000;
const MOVE_RATE_LIMIT_MAX = 10;

export const ticTacToeAdapter: GameRoomAdapter<TicTacToeSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    const session = new TicTacToeSession(
      {
        sessionKey: ctx.roomKey,
        instanceId: ctx.instanceId,
        guildId: ctx.guildId,
        mode: ctx.mode,
      },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        move: {
          rateLimit: { windowMs: MOVE_RATE_LIMIT_WINDOW_MS, max: MOVE_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const { row, col } = (payload as { row?: number; col?: number }) ?? {};
            const result = session.handleMove(auth.userId, row ?? -1, col ?? -1);
            if (!result.ok) client.send('action_rejected', { error: result.error });
          },
        },
        restart: {
          handle: (auth) => session.requestRestart(auth.userId),
        },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const player = session.addPlayer(auth.userId, client);
    client.send('init', { player, state: session.getPublicState() });
    if (!player) return;
    if (auth.mode === 'single') session.enableBot(player);
  },

  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },

  onDispose(session) {
    session.dispose();
  },
};
```

(`getWinnerUserId`/`substitutePlayer` are added to this same adapter object in Task 4, once the underlying session gains those methods — this task deliberately leaves `supportsQueue: true` unbacked, since Task 4 lands in the same file area and the field is harmless until then: `MatchRoom`'s Task-3 seat assignment never reads `supportsQueue` yet.)

- [ ] **Step 6: Write the adapter registry**

```ts
import type { GameId } from '../../services/activity/gameId';
import type { GameRoomAdapter } from '../GameRoomAdapter';
import { hangmanAdapter } from './hangmanAdapter';
import { ticTacToeAdapter } from './ticTacToeAdapter';

export const ADAPTER_REGISTRY: Partial<Record<GameId, GameRoomAdapter<any>>> = {
  hangman: hangmanAdapter,
  'tic-tac-toe': ticTacToeAdapter,
};
```

(Each later adapter task adds one import + one entry here — this file is the only thing every adapter task touches in common, so conflicts are limited to one line per task.)

- [ ] **Step 7: Write `MatchRoom`**

```ts
import { Room, type Client } from 'colyseus';
import type { GameId } from '../services/activity/gameId';
import { roomKey } from '../services/activity/roomKey';
import { RateLimiter } from '../services/activity/shared/RateLimiter';
import {
  verifyWsSessionToken,
  type WsSessionPayload,
} from '../services/activity/wsSessionToken';
import { ADAPTER_REGISTRY } from './adapters/registry';
import type { GameRoomAdapter, SeatRole } from './GameRoomAdapter';

interface Member {
  userId: string;
  role: SeatRole;
}

export class MatchRoom extends Room {
  private adapter!: GameRoomAdapter<unknown>;
  private session!: unknown;
  private members: Member[] = [];
  private hostUserId: string | null = null;
  private mode: 'single' | 'multi' | 'local' = 'multi';
  private rateLimiters = new Map<string, RateLimiter>();
  // Stored on the instance (not read back from `this.metadata`) so it's
  // available synchronously the moment onCreate runs, and again later from
  // `loadSession()` when Task 4's `switch_game` calls it a second time
  // without a fresh `options` object.
  private roomKeyValue = '';

  override async onAuth(
    _client: Client,
    options: { token?: string; roomKey?: string },
  ): Promise<WsSessionPayload> {
    const session = options.token ? verifyWsSessionToken(options.token) : null;
    if (!session) throw new Error('Invalid or expired session token');
    if (roomKey(session) !== options.roomKey) {
      throw new Error('Room key does not match session identity');
    }
    return session;
  }

  override onCreate(options: { roomKey: string; token?: string; game?: GameId }) {
    this.roomKeyValue = options.roomKey;
    this.setMetadata({ roomKey: options.roomKey });

    const initialSession = options.token
      ? verifyWsSessionToken(options.token)
      : null;
    this.mode = initialSession?.mode ?? 'multi';

    // The real client join (`client.joinOrCreate('match', { token, roomKey })`)
    // never needs to pass `game` — it's already encoded in the signed token.
    // `options.game` exists purely so tests can create a room without first
    // minting a token (see this task's own test above).
    const game = options.game ?? initialSession?.game;
    if (!game) throw new Error('Cannot determine which game this room is for');
    const adapter = ADAPTER_REGISTRY[game];
    if (!adapter) throw new Error(`No adapter registered for game "${game}"`);
    this.adapter = adapter;

    this.loadSession(initialSession);
  }

  private loadSession(initialSession: WsSessionPayload | null) {
    const ctx = {
      roomKey: this.roomKeyValue,
      instanceId: initialSession?.instanceId ?? '',
      guildId: initialSession?.guildId ?? '',
      mode: this.mode,
      difficulty: initialSession?.difficulty,
      winningScore: initialSession?.winningScore,
      ruleset: initialSession?.ruleset,
      options: initialSession?.options,
      broadcast: (type: string, payload?: unknown) => this.broadcast(type, payload),
      broadcastBinary: (type: string, data: Uint8Array) =>
        this.broadcastBytes(type, data, {}),
      sendToPlayer: (userId: string, type: string, payload?: unknown) => {
        for (const client of this.clients) {
          if ((client.auth as WsSessionPayload)?.userId !== userId) continue;
          client.send(type, payload);
        }
      },
      onSessionEnded: () => this.disconnect(),
    };

    const { session, messageHandlers } = this.adapter.setup(ctx);
    this.session = session;
    this.rateLimiters.clear();

    for (const [type, { rateLimit, handle }] of Object.entries(messageHandlers)) {
      if (rateLimit) this.rateLimiters.set(type, new RateLimiter(rateLimit));
      this.onMessage(type, (client, payload) => {
        const limiter = this.rateLimiters.get(type);
        if (limiter?.isOverLimit(client)) return;
        handle(client.auth as WsSessionPayload, client, payload);
      });
    }
  }

  private assignSeat(): SeatRole {
    if (this.mode !== 'multi') return 'player';
    const playerCount = this.members.filter((m) => m.role === 'player').length;
    return playerCount < this.adapter.maxPlayers ? 'player' : 'spectator';
  }

  override onJoin(client: Client, _options: unknown, auth: WsSessionPayload) {
    if (this.hostUserId === null) this.hostUserId = auth.userId;

    const role = this.assignSeat();
    this.members.push({ userId: auth.userId, role });
    this.adapter.onJoin(this.session, auth, client, role);
  }

  override onLeave(client: Client) {
    const auth = client.auth as WsSessionPayload;
    this.adapter.onLeave(this.session, auth, client);

    const wasHost = auth.userId === this.hostUserId;
    this.members = this.members.filter((m) => m.userId !== auth.userId);
    if (wasHost && this.members.length > 0) {
      this.hostUserId = this.members[0]!.userId;
    }
  }

  override onDispose() {
    this.adapter.onDispose(this.session);
  }
}
```

(`assignSeat` deliberately has no `queued` branch yet — Task 4 adds `queueEnabled`/`toggle_queue`/`rotate_seat` and extends this method. `loadSession` reads `this.roomKeyValue` rather than taking a `roomKey` parameter because Task 4's `switch_game` calls `loadSession()` a second time without a fresh `options` object — storing it on the instance now avoids a signature change later.)

- [ ] **Step 8: Register `'match'` for the test server and run the test**

The test file's `beforeAll` already does `gameServer.define('match', MatchRoom)` — this doesn't touch `src/index.ts` yet (that happens in the final cutover task, once every adapter exists).

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 9: Run the full existing test suite to confirm nothing broke**

Run: `bun test`
Expected: PASS (the 19 old `*Room.ts` files and their tests are untouched and still registered in `src/index.ts` — this task only adds new files)

- [ ] **Step 10: Commit**

```bash
git add src/realtime/GameRoomAdapter.ts src/realtime/MatchRoom.ts src/realtime/adapters/registry.ts src/realtime/adapters/hangmanAdapter.ts src/realtime/adapters/ticTacToeAdapter.ts tests/matchRoom.test.ts
git status
```

---

### Task 4: Queue mechanics in `MatchRoom` (`switch_game`/`toggle_queue`/`rotate_seat`) + Tic-Tac-Toe's `getWinnerUserId`/`substitutePlayer`

**Files:**
- Modify: `src/realtime/MatchRoom.ts`
- Modify: `src/services/activity/ticTacToe/TicTacToeSession.ts`
- Modify: `src/realtime/adapters/ticTacToeAdapter.ts`
- Test: `tests/ticTacToe.test.ts` → new file `tests/ticTacToeSession.test.ts` (session-level tests don't currently exist as a separate file; `tests/ticTacToe.test.ts` only covers `TicTacToeEngine` — create the new file rather than overloading the engine one)
- Test: `tests/matchRoom.test.ts` (extend)

**Interfaces:**
- Consumes: `MatchRoom` core, `GameRoomAdapter` (Task 3).
- Produces: `TicTacToeSession.getWinnerUserId(): string | null`, `TicTacToeSession.substitutePlayer(outgoingUserId, incomingUserId, connection): boolean` — the exact two-method shape every one of the other 5 queue-eligible sessions (Tasks 5-9) implements identically, just swapping the marker field name (`disc`/`color`/`side`/`playerId`) and, for RPS/Battleship, adding a stored `lastWinner*` field since those two don't expose a plain `getState().winner`.

**Known, accepted limitation carried into this task:** `switch_game` cannot target `'cards'` (its room requires a ruleset chosen at creation, which a bare `{ game }` switch message can't supply) and resets any game-specific creation option (Pong's `difficulty`/`winningScore`) to defaults — the room's original creation options aren't re-derivable once the room exists. `switch_game` rejects `'cards'` explicitly; switching to Pong mid-room always uses default difficulty/winning score.

- [ ] **Step 1: Add `getWinnerUserId`/`substitutePlayer` to `TicTacToeSession`, test-first**

Create `tests/ticTacToeSession.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { TicTacToeSession } from '../src/services/activity/ticTacToe/TicTacToeSession';

function noopBroadcaster() {
  return { broadcast: () => {} };
}

describe('TicTacToeSession.getWinnerUserId', () => {
  it('returns null before a winner exists', () => {
    const session = new TicTacToeSession(
      { sessionKey: 'k', instanceId: 'i', guildId: 'g', mode: 'multi' },
      noopBroadcaster(),
    );
    session.addPlayer('user-x', {});
    session.addPlayer('user-o', {});
    expect(session.getWinnerUserId()).toBe(null);
  });

  it('resolves the winning marker back to the winning userId', () => {
    const session = new TicTacToeSession(
      { sessionKey: 'k', instanceId: 'i', guildId: 'g', mode: 'multi' },
      noopBroadcaster(),
    );
    session.addPlayer('user-x', {}); // X
    session.addPlayer('user-o', {}); // O
    session.handleMove('user-x', 0, 0);
    session.handleMove('user-o', 1, 0);
    session.handleMove('user-x', 0, 1);
    session.handleMove('user-o', 1, 1);
    session.handleMove('user-x', 0, 2); // X completes the top row
    expect(session.getWinnerUserId()).toBe('user-x');
  });
});

describe('TicTacToeSession.substitutePlayer', () => {
  it('reseats the incoming player into the outgoing player\'s exact marker', () => {
    const session = new TicTacToeSession(
      { sessionKey: 'k', instanceId: 'i', guildId: 'g', mode: 'multi' },
      noopBroadcaster(),
    );
    session.addPlayer('user-x', {}); // X
    session.addPlayer('user-o', {}); // O

    const ok = session.substitutePlayer('user-o', 'user-new', {});
    expect(ok).toBe(true);

    // 'user-new' now owns O's seat: a move from 'user-o' is no longer valid...
    const rejected = session.handleMove('user-o', 1, 1);
    expect(rejected.ok).toBe(false);
    // ...but the same board position from 'user-new' plays as O.
    session.handleMove('user-x', 0, 0);
    const accepted = session.handleMove('user-new', 1, 1);
    expect(accepted.ok).toBe(true);
  });

  it('returns false when the outgoing userId is not seated', () => {
    const session = new TicTacToeSession(
      { sessionKey: 'k', instanceId: 'i', guildId: 'g', mode: 'multi' },
      noopBroadcaster(),
    );
    session.addPlayer('user-x', {});
    expect(session.substitutePlayer('nobody', 'user-new', {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/ticTacToeSession.test.ts`
Expected: FAIL with "getWinnerUserId is not a function"

- [ ] **Step 3: Implement both methods in `TicTacToeSession`**

In `src/services/activity/ticTacToe/TicTacToeSession.ts`, add right after `leave()` (the method ending at line 216 in the current file):

```ts
  getWinnerUserId(): string | null {
    const winner = this.engine.getState().winner;
    if (!winner) return null;
    return this.players.find((p) => p.player === winner)?.userId ?? null;
  }

  // Reseats `incomingUserId` into whichever marker `outgoingUserId` held,
  // without the forfeit/onSessionEnded side effects `detach`/`leave` carry —
  // this runs between matches during queue rotation, never mid-match.
  // addPlayer() can't be reused here: it assigns markers by array length
  // (`players.length === 0 ? 'X' : 'O'`), which collides with the remaining
  // player's marker once one seat is vacated and refilled.
  substitutePlayer(
    outgoingUserId: string,
    incomingUserId: string,
    connection: unknown,
  ): boolean {
    const outgoing = this.players.find((p) => p.userId === outgoingUserId);
    if (!outgoing) return false;

    this.players = this.players.filter((p) => p.userId !== outgoingUserId);
    this.restartVotes.delete(outgoingUserId);
    this.players.push({
      userId: incomingUserId,
      player: outgoing.player,
      connected: true,
      connections: new Set([connection]),
    });
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/ticTacToeSession.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the two methods into `ticTacToeAdapter`**

In `src/realtime/adapters/ticTacToeAdapter.ts`, add to the `ticTacToeAdapter` object (alongside `onDispose`):

```ts
  getWinnerUserId(session) {
    return session.getWinnerUserId();
  },
  substitutePlayer(session, outgoingUserId, incomingUserId, incomingClient) {
    return session.substitutePlayer(outgoingUserId, incomingUserId, incomingClient);
  },
```

- [ ] **Step 6: Write the failing `MatchRoom` queue-rotation test**

Add to `tests/matchRoom.test.ts`:

```ts
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

    const clientA = await colyseus.connectTo(room, { token: tokenFor('user-a'), roomKey: key });
    const clientB = await colyseus.connectTo(room, { token: tokenFor('user-b'), roomKey: key });
    const clientC = await colyseus.connectTo(room, { token: tokenFor('user-c'), roomKey: key });

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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — `MatchRoom` doesn't read `options.queueEnabled`, doesn't seat a third joiner as `'queued'`, and doesn't rotate on a win.

- [ ] **Step 8: Extend `MatchRoom` with queue state, `switch_game`/`toggle_queue`/`rotate_seat`, and match-end rotation**

Replace the whole `MatchRoom` class body written in Task 3 with:

```ts
import { Room, type Client } from 'colyseus';
import type { GameId } from '../services/activity/gameId';
import { roomKey } from '../services/activity/roomKey';
import { ACTION_REJECTED } from '../services/activity/shared/ActionResult';
import { RateLimiter } from '../services/activity/shared/RateLimiter';
import {
  verifyWsSessionToken,
  type WsSessionPayload,
} from '../services/activity/wsSessionToken';
import { ADAPTER_REGISTRY } from './adapters/registry';
import type { GameRoomAdapter, SeatRole } from './GameRoomAdapter';

interface Member {
  userId: string;
  role: SeatRole;
}

const SWITCHABLE_GAMES: ReadonlySet<GameId> = new Set(
  Object.keys(ADAPTER_REGISTRY).filter((g) => g !== 'cards') as GameId[],
);

export class MatchRoom extends Room {
  private adapter!: GameRoomAdapter<unknown>;
  private session!: unknown;
  private members: Member[] = [];
  private hostUserId: string | null = null;
  private mode: 'single' | 'multi' | 'local' = 'multi';
  private queueEnabled = false;
  private rateLimiters = new Map<string, RateLimiter>();
  // Stored separately from `this.metadata` (Colyseus's own metadata object,
  // used for `getAvailableRooms` filtering) purely so this room's own logic
  // never has to read values back out of that object.
  private roomKeyValue = '';
  private roomIdValue = '';
  private game!: GameId;
  private identity: {
    instanceId: string;
    guildId: string;
    difficulty?: WsSessionPayload['difficulty'];
    winningScore?: WsSessionPayload['winningScore'];
    ruleset?: WsSessionPayload['ruleset'];
    options?: WsSessionPayload['options'];
  } = { instanceId: '', guildId: '' };

  override async onAuth(
    _client: Client,
    options: { token?: string; roomKey?: string },
  ): Promise<WsSessionPayload> {
    const session = options.token ? verifyWsSessionToken(options.token) : null;
    if (!session) throw new Error('Invalid or expired session token');
    if (roomKey(session) !== options.roomKey) {
      throw new Error('Room key does not match session identity');
    }
    return session;
  }

  override onCreate(options: {
    roomKey: string;
    token?: string;
    game?: GameId;
    roomId?: string;
    queueEnabled?: boolean;
  }) {
    this.roomKeyValue = options.roomKey;
    const initialSession = options.token
      ? verifyWsSessionToken(options.token)
      : null;
    // The real client join (`client.joinOrCreate('match', { token, roomKey })`)
    // never needs to pass `game`/`roomId` — both are already encoded in the
    // signed token. `options.game`/`options.roomId` exist purely so tests can
    // create a room without first minting a token (see Task 3's test). When a
    // token IS present, it must agree with any raw `options.game` also
    // supplied, or a client could load one game's adapter against another
    // game's roomKey/token.
    if (initialSession && options.game && initialSession.game !== options.game) {
      throw new Error('game mismatch between token and join options');
    }
    const game = options.game ?? initialSession?.game;
    if (!game) throw new Error('Cannot determine which game this room is for');
    this.mode = initialSession?.mode ?? 'multi';
    this.queueEnabled = this.mode === 'multi' ? Boolean(options.queueEnabled) : false;
    this.roomIdValue = options.roomId ?? initialSession?.roomId ?? '';
    this.game = game;
    this.identity = {
      instanceId: initialSession?.instanceId ?? '',
      guildId: initialSession?.guildId ?? '',
      difficulty: initialSession?.difficulty,
      winningScore: initialSession?.winningScore,
      ruleset: initialSession?.ruleset,
      options: initialSession?.options,
    };

    const adapter = ADAPTER_REGISTRY[game];
    if (!adapter) throw new Error(`No adapter registered for game "${game}"`);
    this.adapter = adapter;

    this.loadSession();
    this.registerRoomLevelMessages();
    this.syncMetadata();
  }

  // Populates the fields `client.getAvailableRooms('match')` reads client-side
  // for the room list (see this plan's Shared Contract section). `hostName`
  // is deliberately not included — WsSessionPayload only carries a userId,
  // never a display name, so resolving "host's display name" is a client-side
  // concern (matching hostUserId against Discord SDK participant data), not
  // something this server can populate. Both companion specs are updated to
  // say `hostUserId` instead of `hostName` in Task 22.
  private syncMetadata() {
    this.setMetadata({
      roomKey: this.roomKeyValue,
      instanceId: this.identity.instanceId,
      roomId: this.roomIdValue,
      game: this.game,
      hostUserId: this.hostUserId,
      playerCount: this.members.filter((m) => m.role === 'player').length,
      spectatorCount: this.members.filter((m) => m.role === 'spectator').length,
      queueDepth: this.members.filter((m) => m.role === 'queued').length,
      queueEnabled: this.queueEnabled,
      mode: this.mode,
    });
  }

  private loadSession() {
    const ctx = {
      roomKey: this.roomKeyValue,
      instanceId: this.identity.instanceId,
      guildId: this.identity.guildId,
      mode: this.mode,
      difficulty: this.identity.difficulty,
      winningScore: this.identity.winningScore,
      ruleset: this.identity.ruleset,
      options: this.identity.options,
      broadcast: (type: string, payload?: unknown) => this.broadcast(type, payload),
      broadcastBinary: (type: string, data: Uint8Array) =>
        this.broadcastBytes(type, data, {}),
      sendToPlayer: (userId: string, type: string, payload?: unknown) => {
        for (const client of this.clients) {
          if ((client.auth as WsSessionPayload)?.userId !== userId) continue;
          client.send(type, payload);
        }
      },
      onSessionEnded: () => this.disconnect(),
    };

    const { session, messageHandlers } = this.adapter.setup(ctx);
    this.session = session;
    this.rateLimiters.clear();

    for (const [type, { rateLimit, handle }] of Object.entries(messageHandlers)) {
      if (rateLimit) this.rateLimiters.set(type, new RateLimiter(rateLimit));
      this.onMessage(type, (client, payload) => {
        const limiter = this.rateLimiters.get(type);
        if (limiter?.isOverLimit(client)) return;
        handle(client.auth as WsSessionPayload, client, payload);
        this.maybeRotateAfterMatchEnd();
      });
    }
  }

  private registerRoomLevelMessages() {
    this.onMessage('switch_game', (client, payload: { game?: GameId }) => {
      const auth = client.auth as WsSessionPayload;
      if (auth.userId !== this.hostUserId) {
        client.send(ACTION_REJECTED, { error: 'Only the host can switch games' });
        return;
      }
      if (this.isMatchInProgress()) {
        client.send(ACTION_REJECTED, { error: 'Cannot switch games mid-match' });
        return;
      }
      const game = payload?.game;
      if (!game || !SWITCHABLE_GAMES.has(game)) {
        client.send(ACTION_REJECTED, { error: 'Unknown or unswitchable game' });
        return;
      }
      this.switchGame(game);
    });

    this.onMessage('toggle_queue', (client, payload: { enabled?: boolean }) => {
      const auth = client.auth as WsSessionPayload;
      if (auth.userId !== this.hostUserId) {
        client.send(ACTION_REJECTED, { error: 'Only the host can toggle the queue' });
        return;
      }
      this.queueEnabled = Boolean(payload?.enabled);
      this.syncMetadata();
    });

    this.onMessage('rotate_seat', (client) => {
      const auth = client.auth as WsSessionPayload;
      if (this.isMatchInProgress()) {
        client.send(ACTION_REJECTED, { error: 'Cannot rotate seats mid-match' });
        return;
      }
      const sender = this.members.find(
        (m) => m.userId === auth.userId && m.role === 'player',
      );
      if (!sender) {
        client.send(ACTION_REJECTED, { error: 'Only a seated player can rotate out' });
        return;
      }
      const queueHead = this.members.find((m) => m.role === 'queued');
      if (!queueHead) {
        client.send(ACTION_REJECTED, { error: 'No one is waiting in the queue' });
        return;
      }
      this.rotateSeat(sender.userId, queueHead.userId);
    });
  }

  private isMatchInProgress(): boolean {
    if (!this.adapter.getWinnerUserId) return false;
    const playerCount = this.members.filter((m) => m.role === 'player').length;
    if (playerCount < this.adapter.maxPlayers) return false;
    return this.adapter.getWinnerUserId(this.session) === null;
  }

  private maybeRotateAfterMatchEnd() {
    if (!this.queueEnabled || !this.adapter.getWinnerUserId || !this.adapter.substitutePlayer) {
      return;
    }
    const winnerUserId = this.adapter.getWinnerUserId(this.session);
    if (!winnerUserId) return;

    const loser = this.members.find(
      (m) => m.role === 'player' && m.userId !== winnerUserId,
    );
    const queueHead = this.members.find((m) => m.role === 'queued');
    if (!loser || !queueHead) return; // no one waiting — winner and loser stay seated for a rematch

    this.rotateSeat(loser.userId, queueHead.userId);
  }

  private rotateSeat(outgoingUserId: string, incomingUserId: string) {
    const incomingClient = this.clients.find(
      (c) => (c.auth as WsSessionPayload)?.userId === incomingUserId,
    );
    if (!incomingClient || !this.adapter.substitutePlayer) return;

    const ok = this.adapter.substitutePlayer(
      this.session,
      outgoingUserId,
      incomingUserId,
      incomingClient,
    );
    if (!ok) return;

    const outgoing = this.members.find((m) => m.userId === outgoingUserId);
    const incoming = this.members.find((m) => m.userId === incomingUserId);
    if (outgoing) outgoing.role = 'queued';
    if (incoming) incoming.role = 'player';
    // Re-seat the outgoing member at the back of the queue, incoming at the front of the (former) player set.
    this.members = [
      ...this.members.filter((m) => m.userId !== outgoingUserId),
      ...(outgoing ? [outgoing] : []),
    ];
  }

  private assignSeat(): SeatRole {
    if (this.mode !== 'multi') return 'player';
    const playerCount = this.members.filter((m) => m.role === 'player').length;
    if (playerCount < this.adapter.maxPlayers) return 'player';
    if (this.queueEnabled && this.adapter.supportsQueue) return 'queued';
    return 'spectator';
  }

  override onJoin(client: Client, _options: unknown, auth: WsSessionPayload) {
    if (this.hostUserId === null) this.hostUserId = auth.userId;

    const role = this.assignSeat();
    this.members.push({ userId: auth.userId, role });
    this.adapter.onJoin(this.session, auth, client, role);
    this.syncMetadata();
  }

  override onLeave(client: Client) {
    const auth = client.auth as WsSessionPayload;
    this.adapter.onLeave(this.session, auth, client);

    const wasHost = auth.userId === this.hostUserId;
    this.members = this.members.filter((m) => m.userId !== auth.userId);
    if (wasHost && this.members.length > 0) {
      this.hostUserId = this.members[0]!.userId;
    }
    this.syncMetadata();
  }

  override onDispose() {
    this.adapter.onDispose(this.session);
  }

  private switchGame(game: GameId) {
    this.adapter.onDispose(this.session);
    this.adapter = ADAPTER_REGISTRY[game]!;
    this.game = game;
    this.loadSession();

    this.members = [];
    for (const client of this.clients) {
      const auth = client.auth as WsSessionPayload;
      const role = this.assignSeat();
      this.members.push({ userId: auth.userId, role });
      this.adapter.onJoin(this.session, auth, client, role);
    }
    this.syncMetadata();
  }
}
```

Note the `rateLimiters` reuse across `switch_game`'s call to `loadSession()`: `onMessage` calls made a second time on the same Colyseus `Room` instance for the same message type simply replace the previous handler (Colyseus's `onMessage` keys by type internally), so re-registering `move`/`restart`/etc. after a game switch is safe and doesn't leak duplicate handlers.

- [ ] **Step 9: Run test to verify it passes**

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 10: Run the full test suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/realtime/MatchRoom.ts src/services/activity/ticTacToe/TicTacToeSession.ts src/realtime/adapters/ticTacToeAdapter.ts tests/ticTacToeSession.test.ts tests/matchRoom.test.ts
git status
```

---

### Task 5: Connect Four adapter + queue support

Same pattern as Task 4's Tic-Tac-Toe work: `ConnectFourSession` has the identical `players: ConnectFourPlayer[]` / length-based `addPlayer` / `restartVotes` shape, with `disc: Disc` ('p1'/'p2') as its marker and `engine.getState().winner: Disc | null`.

**Files:**
- Modify: `src/services/activity/connectFour/ConnectFourSession.ts`
- Create: `src/realtime/adapters/connectFourAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/connectFourSession.test.ts` (extend existing file)

**Interfaces:**
- Produces: `ConnectFourSession.getWinnerUserId(): string | null`, `.substitutePlayer(outgoingUserId, incomingUserId, connection): boolean` — same shapes as Task 4.

- [ ] **Step 1: Write the failing tests**

Read `tests/connectFourSession.test.ts` first to match its existing `describe`/`it` structure and constructor-call style, then add a `describe('getWinnerUserId', ...)` and `describe('substitutePlayer', ...)` block mirroring the two added in Task 4's `tests/ticTacToeSession.test.ts`, adapted to Connect Four's API: seat two players with `session.addPlayer(userId, {})`, drive a win with `session.dropDisc(userId, col)` (dropping into the same column four times for one player, alternating a blocking column for the other — e.g. p1 drops col 0,0,0,0 while p2 drops col 1,1,1 between each), then assert `session.getWinnerUserId()` equals the winning `userId`; for substitution, assert the same reseat-then-move-rejection/acceptance behavior as Task 4's test, using `session.dropDisc` instead of `handleMove`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/connectFourSession.test.ts`
Expected: FAIL with "getWinnerUserId is not a function"

- [ ] **Step 3: Implement both methods**

In `src/services/activity/connectFour/ConnectFourSession.ts`, add after `leave()` (ends at line 168 in the current file):

```ts
  getWinnerUserId(): string | null {
    const winner = this.engine.getState().winner;
    if (!winner) return null;
    return this.players.find((p) => p.disc === winner)?.userId ?? null;
  }

  substitutePlayer(
    outgoingUserId: string,
    incomingUserId: string,
    connection: unknown,
  ): boolean {
    const outgoing = this.players.find((p) => p.userId === outgoingUserId);
    if (!outgoing) return false;

    this.players = this.players.filter((p) => p.userId !== outgoingUserId);
    this.restartVotes.delete(outgoingUserId);
    this.players.push({
      userId: incomingUserId,
      disc: outgoing.disc,
      connected: true,
      connections: new Set([connection]),
    });
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/connectFourSession.test.ts`
Expected: PASS

- [ ] **Step 5: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { ConnectFourSession } from '../../services/activity/connectFour/ConnectFourSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const MOVE_RATE_LIMIT_WINDOW_MS = 1000;
const MOVE_RATE_LIMIT_MAX = 10;

export const connectFourAdapter: GameRoomAdapter<ConnectFourSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    const session = new ConnectFourSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        drop: {
          rateLimit: { windowMs: MOVE_RATE_LIMIT_WINDOW_MS, max: MOVE_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const col = (payload as { col?: number })?.col ?? -1;
            const accepted = session.dropDisc(auth.userId, col);
            if (!accepted) client.send('move_rejected', { col });
          },
        },
        restart: { handle: (auth) => session.requestRestart(auth.userId) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const disc = session.addPlayer(auth.userId, client);
    client.send('init', { disc, state: session.getPublicState() });
    if (disc && auth.mode === 'single') session.enableBot(disc);
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
  getWinnerUserId(session) {
    return session.getWinnerUserId();
  },
  substitutePlayer(session, outgoingUserId, incomingUserId, incomingClient) {
    return session.substitutePlayer(outgoingUserId, incomingUserId, incomingClient);
  },
};
```

- [ ] **Step 6: Register it**

In `src/realtime/adapters/registry.ts`, add `import { connectFourAdapter } from './connectFourAdapter';` and `'connect-four': connectFourAdapter,`.

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/services/activity/connectFour/ConnectFourSession.ts src/realtime/adapters/connectFourAdapter.ts src/realtime/adapters/registry.ts tests/connectFourSession.test.ts
git status
```

---

### Task 6: Checkers adapter + queue support

Identical shape to Task 5, marker field `color: Color` ('black'/'red'), move message is `move` with `{from, to}` validated by `isPosition` (copy that validator function verbatim from `CheckersRoom.ts` into the adapter), rejections go through `ACTION_REJECTED` (not a bespoke `move_rejected` type).

**Files:**
- Modify: `src/services/activity/checkers/CheckersSession.ts`
- Create: `src/realtime/adapters/checkersAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/checkersSession.test.ts` (new — no session-level test file exists today, only `checkersEngine.test.ts`/`checkersBotAI.test.ts`)

**Interfaces:**
- Produces: `CheckersSession.getWinnerUserId(): string | null`, `.substitutePlayer(outgoingUserId, incomingUserId, connection): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/checkersSession.test.ts` following the same two-`describe`-block structure as Task 4's `tests/ticTacToeSession.test.ts`, adapted to Checkers: seat two players, drive a win via `session.requestMove(userId, from, to)` (or more simply, call the private win path indirectly isn't testable — instead seat players then call `session.requestMove` for a scripted checkers capture sequence is complex; use the simpler, already-established pattern from `CheckersSession.forfeitTo`'s effect instead: after seating two players, call `(session as any)['forfeitTo']('black-user-id')`-style is fragile — prefer instead directly testing via the public surface: seat two players, then use the exposed `dispose()`-adjacent testability the other tests use. Simplest correct approach: read `tests/checkersEngine.test.ts` to find an existing short forced-win move sequence for `CheckersEngine`, reuse that same move sequence through `session.requestMove` for both seated players' userIds instead of engine calls directly, then assert `session.getWinnerUserId()`.

For `substitutePlayer`, mirror Task 5's test exactly: seat two players, substitute one out, assert a move from the old userId is rejected and the same move from the new userId is accepted.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/checkersSession.test.ts`
Expected: FAIL with "getWinnerUserId is not a function"

- [ ] **Step 3: Implement both methods**

In `src/services/activity/checkers/CheckersSession.ts`, add after `leave()` (ends at line 165 in the current file):

```ts
  getWinnerUserId(): string | null {
    const winner = this.engine.getState().winner;
    if (!winner) return null;
    return this.players.find((p) => p.color === winner)?.userId ?? null;
  }

  substitutePlayer(
    outgoingUserId: string,
    incomingUserId: string,
    connection: unknown,
  ): boolean {
    const outgoing = this.players.find((p) => p.userId === outgoingUserId);
    if (!outgoing) return false;

    this.players = this.players.filter((p) => p.userId !== outgoingUserId);
    this.restartVotes.delete(outgoingUserId);
    this.players.push({
      userId: incomingUserId,
      color: outgoing.color,
      connected: true,
      connections: new Set([connection]),
    });
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/checkersSession.test.ts`
Expected: PASS

- [ ] **Step 5: Write the adapter**

```ts
import type { Client } from 'colyseus';
import type { Position } from '../../services/activity/checkers/CheckersEngine';
import { CheckersSession } from '../../services/activity/checkers/CheckersSession';
import { ACTION_REJECTED } from '../../services/activity/shared/ActionResult';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const MOVE_RATE_LIMIT_WINDOW_MS = 1000;
const MOVE_RATE_LIMIT_MAX = 10;

function isPosition(value: unknown): value is Position {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Position).row === 'number' &&
    typeof (value as Position).col === 'number' &&
    Number.isInteger((value as Position).row) &&
    Number.isInteger((value as Position).col)
  );
}

export const checkersAdapter: GameRoomAdapter<CheckersSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    const session = new CheckersSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        move: {
          rateLimit: { windowMs: MOVE_RATE_LIMIT_WINDOW_MS, max: MOVE_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const { from, to } = (payload as { from?: unknown; to?: unknown }) ?? {};
            if (!isPosition(from) || !isPosition(to)) return;
            const result = session.requestMove(auth.userId, from, to);
            if (!result.ok) client.send(ACTION_REJECTED, { error: result.error });
          },
        },
        restart: { handle: (auth) => session.requestRestart(auth.userId) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const color = session.addPlayer(auth.userId, client);
    client.send('init', { color, state: session.getPublicState() });
    if (!color) return;
    if (auth.mode === 'single') session.enableBot(color);
    client.send('state', session.getPublicState());
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session?.dispose();
  },
  getWinnerUserId(session) {
    return session.getWinnerUserId();
  },
  substitutePlayer(session, outgoingUserId, incomingUserId, incomingClient) {
    return session.substitutePlayer(outgoingUserId, incomingUserId, incomingClient);
  },
};
```

- [ ] **Step 6: Register it**

In `src/realtime/adapters/registry.ts`, add `import { checkersAdapter } from './checkersAdapter';` and `checkers: checkersAdapter,`.

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/services/activity/checkers/CheckersSession.ts src/realtime/adapters/checkersAdapter.ts src/realtime/adapters/registry.ts tests/checkersSession.test.ts
git status
```

---

### Task 7: Rock-Paper-Scissors adapter + queue support

RPS differs from the previous three: it has **no `restart` message at all** (`RpsRoom.ts` registers only `pick` and `leave`), and its winner is already resolved to a `userId` inside the private `endMatch()` method rather than left as a marker on `getState()`. Because there's no restart flow, `substitutePlayer` must also reset the round itself (create a fresh `RpsEngine`, clear `resultRecorded`) — without that, a room would be stuck in "match ended" forever after one round, since nothing else can ever un-stick it.

**Files:**
- Modify: `src/services/activity/rps/RpsSession.ts`
- Create: `src/realtime/adapters/rpsAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/rpsSession.test.ts` (new — only `rpsEngine.test.ts` exists today)

**Interfaces:**
- Produces: `RpsSession.getWinnerUserId(): string | null`, `.substitutePlayer(outgoingUserId, incomingUserId, connection): boolean` (this one also resets the round, unlike the other 5).

- [ ] **Step 1: Write the failing tests**

Create `tests/rpsSession.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { RpsSession } from '../src/services/activity/rps/RpsSession';

function noopBroadcaster() {
  return { broadcast: () => {} };
}

describe('RpsSession.getWinnerUserId', () => {
  it('returns null before a match concludes', () => {
    const session = new RpsSession(
      { sessionKey: 'k', instanceId: 'i', guildId: 'g', mode: 'multi' },
      noopBroadcaster(),
    );
    session.addPlayer('user-a', {});
    session.addPlayer('user-b', {});
    expect(session.getWinnerUserId()).toBe(null);
  });

  it('resolves to the winning userId once the match ends (default bestOf 1)', () => {
    const session = new RpsSession(
      { sessionKey: 'k', instanceId: 'i', guildId: 'g', mode: 'multi' },
      noopBroadcaster(),
      undefined,
      { bestOf: 1 },
    );
    session.addPlayer('user-a', {});
    session.addPlayer('user-b', {});
    session.submitPick('user-a', 'rock');
    session.submitPick('user-b', 'scissors');
    expect(session.getWinnerUserId()).toBe('user-a');
  });
});

describe('RpsSession.substitutePlayer', () => {
  it('reseats the incoming player and resets the round for a fresh match', () => {
    const session = new RpsSession(
      { sessionKey: 'k', instanceId: 'i', guildId: 'g', mode: 'multi' },
      noopBroadcaster(),
      undefined,
      { bestOf: 1 },
    );
    session.addPlayer('user-a', {});
    session.addPlayer('user-b', {});
    session.submitPick('user-a', 'rock');
    session.submitPick('user-b', 'scissors'); // user-a wins, match ends

    const ok = session.substitutePlayer('user-b', 'user-c', {});
    expect(ok).toBe(true);
    expect(session.getWinnerUserId()).toBe(null); // round reset, no winner yet

    session.submitPick('user-a', 'rock');
    const accepted = session.submitPick('user-c', 'scissors');
    expect(accepted).toBe(true);
    expect(session.getWinnerUserId()).toBe('user-a');
  });
});
```

Check `RpsEngineConfig`'s actual field name for best-of count (read `src/services/activity/rps/RpsEngine.ts`'s exported config interface before finalizing — the test above assumes it's called `bestOf`, matching `getPublicConfig()`'s `{ bestOf: this.engine.getRoundState().bestOf }` already seen in `RpsSession.ts`) and adjust the constructor call if the config key differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/rpsSession.test.ts`
Expected: FAIL with "getWinnerUserId is not a function"

- [ ] **Step 3: Implement both methods**

In `src/services/activity/rps/RpsSession.ts`:

Add a new field next to `resultRecorded`:
```ts
  private lastWinnerUserId: string | null = null;
```

In `endMatch()`, right after `const winner = this.players.find((p) => p.playerId === winnerId);`, add:
```ts
    this.lastWinnerUserId = winner?.userId ?? null;
```

Add after `getRoundState()` (near the end of the class, before `dispose()`):
```ts
  getWinnerUserId(): string | null {
    return this.lastWinnerUserId;
  }

  // Unlike the other 5 queue-eligible games, RPS has no restart-vote flow at
  // all — without resetting the round here, a room would be permanently
  // stuck in "match ended" after the very first round, since nothing else
  // can ever start a new one.
  substitutePlayer(
    outgoingUserId: string,
    incomingUserId: string,
    connection: unknown,
  ): boolean {
    const outgoing = this.players.find((p) => p.userId === outgoingUserId);
    if (!outgoing) return false;

    this.players = this.players.filter((p) => p.userId !== outgoingUserId);
    this.players.push({
      userId: incomingUserId,
      playerId: outgoing.playerId,
      connected: true,
      connections: new Set([connection]),
    });

    this.engine = new RpsEngine({ bestOf: this.engine.getRoundState().bestOf });
    this.resultRecorded = false;
    this.lastWinnerUserId = null;
    this.broadcastState();
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/rpsSession.test.ts`
Expected: PASS

- [ ] **Step 5: Write the adapter**

The original `RpsRoom.onJoin` also broadcasts `game_start`/`round_state` once `playerCount === 2 || mode === 'single'` — a room-wide broadcast the `GameRoomAdapter.onJoin(session, auth, client, seat)` signature has no direct path to, since it isn't handed `ctx`. Every other adapter's `onJoin` only ever needs `session`/`client`, but this is the one place among the 19 games where the original `Room.onJoin` also called `this.broadcast(...)` directly, so `rpsAdapter` is the one adapter that captures `ctx` at module scope:

```ts
import type { Client } from 'colyseus';
import { RpsSession } from '../../services/activity/rps/RpsSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const PICK_RATE_LIMIT_WINDOW_MS = 1000;
const PICK_RATE_LIMIT_MAX = 10;

let capturedCtx: AdapterContext;

export const rpsAdapter: GameRoomAdapter<RpsSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    capturedCtx = ctx;
    const session = new RpsSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        pick: {
          rateLimit: { windowMs: PICK_RATE_LIMIT_WINDOW_MS, max: PICK_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const pick = (payload as { pick?: string })?.pick;
            const success = session.submitPick(auth.userId, pick);
            if (!success) client.send('error', { message: 'Invalid move' });
          },
        },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const playerId = session.addPlayer(auth.userId, client);
    if (!playerId) {
      client.send('error', { message: 'Game is full' });
      client.leave();
      return;
    }
    client.send('init', { playerId, config: session.getPublicConfig() });
    if (auth.mode === 'single') session.enableBot(playerId);
    if (session.playerCount === 2 || auth.mode === 'single') {
      capturedCtx.broadcast('game_start', {});
      capturedCtx.broadcast('round_state', session.getRoundState());
    }
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
  getWinnerUserId(session) {
    return session.getWinnerUserId();
  },
  substitutePlayer(session, outgoingUserId, incomingUserId, incomingClient) {
    return session.substitutePlayer(outgoingUserId, incomingUserId, incomingClient);
  },
};
```

- [ ] **Step 6: Register it**

In `src/realtime/adapters/registry.ts`, add `import { rpsAdapter } from './rpsAdapter';` and `'rock-paper-scissors': rpsAdapter,`.

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/services/activity/rps/RpsSession.ts src/realtime/adapters/rpsAdapter.ts src/realtime/adapters/registry.ts tests/rpsSession.test.ts
git status
```

---

### Task 8: Battleship adapter + queue support

Battleship is the one queue-eligible game using `PerClientBroadcaster` (`sendToPlayer`/`broadcastPublic`) instead of the generic `ActivityBroadcaster`, since every state push is a masked, per-player view (`masking.ts`'s `viewFor`). It also has no `restart` flow (like RPS), so `substitutePlayer` resets the engine (both players re-place ships for the next match) — and there's a **known, accepted v1 limitation**: because Battleship never calls a public broadcast for board state, a spectator/queued client watching this game receives no live board updates at all (only whatever one-time snapshot `onJoin` sends them) — this is the same "known v1 gap" the approved spec already flagged for spectate fidelity, just manifesting as "sees nothing" rather than "sees too much" for this specific game.

**Files:**
- Modify: `src/services/activity/battleship/BattleshipSession.ts`
- Create: `src/realtime/adapters/battleshipAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/battleshipSession.test.ts` (extend existing file)

**Interfaces:**
- Produces: `BattleshipSession.getWinnerUserId(): string | null`, `.substitutePlayer(outgoingUserId, incomingUserId, connection): boolean`.

- [ ] **Step 1: Write the failing tests**

Read `tests/battleshipSession.test.ts` first to reuse its existing helpers for seating two players and driving a full placement+fire sequence to a win (it already has this, since `BattleshipSession`'s existing behavior is tested end-to-end there). Add:

```ts
  describe('getWinnerUserId', () => {
    it('returns null before a winner exists', () => {
      // reuse this file's existing two-player setup helper, then:
      expect(session.getWinnerUserId()).toBe(null);
    });

    it('resolves the winning side back to the winning userId', () => {
      // reuse this file's existing helper that drives a full game to
      // completion (placement + fire sequence sinking all of one side's
      // ships), then:
      expect(session.getWinnerUserId()).toBe(/* whichever userId that helper's winning side maps to */);
    });
  });

  describe('substitutePlayer', () => {
    it('reseats the incoming player and resets the engine for a fresh match', () => {
      // drive the existing helper to a completed game, then:
      const ok = session.substitutePlayer('user-losing-side', 'user-new', {});
      expect(ok).toBe(true);
      expect(session.getWinnerUserId()).toBe(null); // engine reset, no winner yet
    });
  });
```

Fill in the exact helper names/assertions by reading the existing file's setup pattern rather than guessing — it already has a complete win-sequence helper since Battleship's win-path is already fully tested there.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/battleshipSession.test.ts`
Expected: FAIL with "getWinnerUserId is not a function"

- [ ] **Step 3: Implement both methods**

In `src/services/activity/battleship/BattleshipSession.ts`:

Add a new field next to `resultRecorded`:
```ts
  private lastWinnerSide: BattleshipSide | null = null;
```

In each of the three places `this.resultRecorded = true;` is followed by `this.recordResult(...)` (inside `playBotShot()`, `fire()`, and `forfeitTo()`), add `this.lastWinnerSide = <the winner side variable already in scope there>;` on the line before `this.recordResult(...)` — e.g. in `fire()`:
```ts
    if (result.winner && !this.resultRecorded) {
      this.resultRecorded = true;
      this.lastWinnerSide = result.winner;
      this.recordResult(result.winner);
      return;
    }
```
(and the equivalent one-line addition in `playBotShot()` using `result.winner`, and in `forfeitTo()` using `remaining.side`).

Add after `dispose()`:
```ts
  getWinnerUserId(): string | null {
    if (!this.lastWinnerSide) return null;
    return this.players.find((p) => p.side === this.lastWinnerSide)?.userId ?? null;
  }

  // No restart flow exists for Battleship (like RPS) — reset the engine so
  // the newly-paired players go straight back into ship placement instead
  // of leaving the room permanently stuck in the 'ended' phase.
  substitutePlayer(
    outgoingUserId: string,
    incomingUserId: string,
    connection: unknown,
  ): boolean {
    const outgoing = this.players.find((p) => p.userId === outgoingUserId);
    if (!outgoing) return false;

    this.players = this.players.filter((p) => p.userId !== outgoingUserId);
    this.players.push({
      userId: incomingUserId,
      side: outgoing.side,
      connected: true,
      connections: new Set([connection]),
    });

    this.engine = new BattleshipEngine();
    this.resultRecorded = false;
    this.lastWinnerSide = null;
    this.broadcastState();
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/battleshipSession.test.ts`
Expected: PASS

- [ ] **Step 5: Write the adapter**

```ts
import type { Client } from 'colyseus';
import type { ShipPlacement } from '../../services/activity/battleship/BattleshipEngine';
import { BattleshipSession } from '../../services/activity/battleship/BattleshipSession';
import type { PerClientBroadcaster } from '../../services/activity/cards/PerClientBroadcaster';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const FIRE_RATE_LIMIT_WINDOW_MS = 1000;
const FIRE_RATE_LIMIT_MAX = 5;
const PLACE_RATE_LIMIT_WINDOW_MS = 1000;
const PLACE_RATE_LIMIT_MAX = 3;

export const battleshipAdapter: GameRoomAdapter<BattleshipSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    const broadcaster: PerClientBroadcaster = {
      sendToPlayer: (userId, message) => ctx.sendToPlayer(userId, message.type, message.payload),
      broadcastPublic: (message) => ctx.broadcast(message.type, message.payload),
    };

    const session = new BattleshipSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      broadcaster,
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        place_ships: {
          rateLimit: { windowMs: PLACE_RATE_LIMIT_WINDOW_MS, max: PLACE_RATE_LIMIT_MAX },
          handle: (auth, _client, payload: unknown) => {
            const placements = (payload as { placements?: ShipPlacement[] })?.placements;
            if (!Array.isArray(placements)) return;
            session.placeShips(auth.userId, placements);
          },
        },
        fire: {
          rateLimit: { windowMs: FIRE_RATE_LIMIT_WINDOW_MS, max: FIRE_RATE_LIMIT_MAX },
          handle: (auth, _client, payload: unknown) => {
            const { x, y } = (payload as { x?: number; y?: number }) ?? {};
            if (typeof x !== 'number' || typeof y !== 'number') return;
            session.fire(auth.userId, x, y);
          },
        },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const side = session.addPlayer(auth.userId, client);
    client.send('init', { side });
    if (side && auth.mode === 'single') session.enableBot(side);
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
  getWinnerUserId(session) {
    return session.getWinnerUserId();
  },
  substitutePlayer(session, outgoingUserId, incomingUserId, incomingClient) {
    return session.substitutePlayer(outgoingUserId, incomingUserId, incomingClient);
  },
};
```

(No `leave` message handler: the original `BattleshipRoom.onMessage('leave', ...)` calls `session.leave(auth.userId, client)`, which this adapter should also register — add a third entry to `messageHandlers`: `leave: { handle: (auth, client) => session.leave(auth.userId, client) }`.)

- [ ] **Step 6: Register it**

In `src/realtime/adapters/registry.ts`, add `import { battleshipAdapter } from './battleshipAdapter';` and `battleship: battleshipAdapter,`.

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/services/activity/battleship/BattleshipSession.ts src/realtime/adapters/battleshipAdapter.ts src/realtime/adapters/registry.ts tests/battleshipSession.test.ts
git status
```

---

### Task 9: Pong adapter + queue support (last of the 6 queue-eligible games)

Pong uses the binary-broadcast variant (`broadcastBinary`) for its per-tick state snapshots, and uniquely supports a third mode (`'local'`, hot-seat) alongside `'single'`/`'multi'`. It has `restartVotes`/`requestRestart` like Tic-Tac-Toe/Connect Four/Checkers, so `substitutePlayer` stays a pure seat swap (no engine reset needed).

**Files:**
- Modify: `src/services/activity/pong/PongSession.ts`
- Create: `src/realtime/adapters/pongAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/pongSession.test.ts` (extend existing file)

**Interfaces:**
- Produces: `PongSession.getWinnerUserId(): string | null`, `.substitutePlayer(outgoingUserId, incomingUserId, connection): boolean`.

- [ ] **Step 1: Write the failing tests**

Read `tests/pongSession.test.ts` first to reuse its existing setup/tick-driving helpers (it already drives full points via `engine.forceWinner`/multiple `tick()` calls to reach a winning score). Add `describe('getWinnerUserId', ...)` and `describe('substitutePlayer', ...)` blocks mirroring Task 4's structure: seat two players, drive to a win via whatever helper this file already uses (likely repeated `session.tick()` calls after forcing ball state, or a direct `engine.forceWinner(side)` call followed by one `session.tick()` to let `recordResult`/broadcast fire), assert `getWinnerUserId()` resolves to the correct userId; for substitution, seat two players, substitute one, assert `handleInput` from the old userId no longer affects the same paddle side while the new userId's input does.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pongSession.test.ts`
Expected: FAIL with "getWinnerUserId is not a function"

- [ ] **Step 3: Implement both methods**

In `src/services/activity/pong/PongSession.ts`, add after `leave()` (ends at line 208 in the current file):

```ts
  getWinnerUserId(): string | null {
    const winner = this.engine.getState().winner;
    if (!winner) return null;
    return this.players.find((p) => p.side === winner)?.userId ?? null;
  }

  substitutePlayer(
    outgoingUserId: string,
    incomingUserId: string,
    connection: unknown,
  ): boolean {
    const outgoing = this.players.find((p) => p.userId === outgoingUserId);
    if (!outgoing) return false;

    this.players = this.players.filter((p) => p.userId !== outgoingUserId);
    this.restartVotes.delete(outgoingUserId);
    this.players.push({
      userId: incomingUserId,
      side: outgoing.side,
      connected: true,
      connections: new Set([connection]),
    });
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pongSession.test.ts`
Expected: PASS

- [ ] **Step 5: Write the adapter**

```ts
import type { Client } from 'colyseus';
import type { PaddleSide } from '../../services/activity/pong/PongEngine';
import { PongSession } from '../../services/activity/pong/PongSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const INPUT_RATE_LIMIT_WINDOW_MS = 1000;
const INPUT_RATE_LIMIT_MAX = 120;

export const pongAdapter: GameRoomAdapter<PongSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    const session = new PongSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      {
        broadcast: (_key, message) => ctx.broadcast(message.type, message.payload),
        broadcastBinary: (_key, data) => ctx.broadcastBinary('state', new Uint8Array(data)),
      },
      undefined,
      ctx.winningScore !== undefined ? { winningScore: ctx.winningScore } : undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        input: {
          rateLimit: { windowMs: INPUT_RATE_LIMIT_WINDOW_MS, max: INPUT_RATE_LIMIT_MAX },
          handle: (auth, _client, payload: unknown) => {
            const p = payload as { direction?: -1 | 0 | 1; seq?: number; side?: PaddleSide };
            session.handleInput(auth.userId, p?.direction ?? 0, p?.seq ?? 0, p?.side);
          },
        },
        restart: { handle: (auth) => session.requestRestart(auth.userId) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const side = session.addPlayer(auth.userId, client);
    client.send('init', { side, config: session.getPublicConfig() });
    if (!side) return;

    if (auth.mode === 'single') {
      session.enableBot(side, auth.difficulty);
      session.start();
    } else if (auth.mode === 'local') {
      session.enableLocalTwoPlayer();
      session.start();
    } else if (session.playerCount === 2) {
      session.start();
    }
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
  getWinnerUserId(session) {
    return session.getWinnerUserId();
  },
  substitutePlayer(session, outgoingUserId, incomingUserId, incomingClient) {
    return session.substitutePlayer(outgoingUserId, incomingUserId, incomingClient);
  },
};
```

(Add a `leave: { handle: (auth, client) => session.leave(auth.userId, client) }` entry to `messageHandlers`, matching the original `PongRoom.onMessage('leave', ...)`.)

**Note on `broadcastBinary` and `MatchRoom`'s `AdapterContext.broadcastBinary`:** Task 3/4's `MatchRoom.loadSession()` already implements `broadcastBinary: (type, data) => this.broadcastBytes(type, data, {})` — no further `MatchRoom` change needed here; this task only consumes that existing primitive.

- [ ] **Step 6: Register it**

In `src/realtime/adapters/registry.ts`, add `import { pongAdapter } from './pongAdapter';` and `pong: pongAdapter,`.

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS — all 6 queue-eligible games now have working `getWinnerUserId`/`substitutePlayer` and adapters.

- [ ] **Step 8: Commit**

```bash
git add src/services/activity/pong/PongSession.ts src/realtime/adapters/pongAdapter.ts src/realtime/adapters/registry.ts tests/pongSession.test.ts
git status
```

---

The remaining 12 games (Tasks 10-21) need **no session changes at all** — they don't support queueing, so they only need a `GameRoomAdapter` that reproduces their existing `*Room.ts`'s `onCreate`/`onJoin`/`onLeave`/`onDispose`/`onMessage` wiring exactly. Each task's adapter is verified with one `MatchRoom`-based integration test (join + one message round-trip), following the pattern established in Task 3's `tests/matchRoom.test.ts`.

### Task 10: BingoSpeed adapter

**Files:**
- Create: `src/realtime/adapters/bingoSpeedAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts`:

```ts
  it('seats a player into a bingo-speed room and returns their card on init', async () => {
    const key = roomKey({
      instanceId: 'inst-1', game: 'bingo-speed', mode: 'multi', userId: 'user-a', roomId: 'ROOM03',
    });
    const room = await colyseus.createRoom('match', { roomKey: key, game: 'bingo-speed' });
    const token = mintWsSessionToken({
      userId: 'user-a', instanceId: 'inst-1', guildId: 'guild-1', mode: 'multi', game: 'bingo-speed', roomId: 'ROOM03',
    });
    const messages: unknown[] = [];
    const client = await colyseus.connectTo(room, { token, roomKey: key });
    client.onMessage('init', (msg) => messages.push(msg));
    await room.waitForNextPatch();
    expect(messages.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'bingo-speed'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { BingoSpeedSession } from '../../services/activity/bingoSpeed/BingoSpeedSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const CLAIM_RATE_LIMIT_WINDOW_MS = 1000;
const CLAIM_RATE_LIMIT_MAX = 5;

export const bingoSpeedAdapter: GameRoomAdapter<BingoSpeedSession> = {
  maxPlayers: 8,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new BingoSpeedSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        claim_bingo: {
          rateLimit: { windowMs: CLAIM_RATE_LIMIT_WINDOW_MS, max: CLAIM_RATE_LIMIT_MAX },
          handle: (auth, client) => {
            const result = session.claimBingo(auth.userId);
            client.send('bingo_claim_result', result);
          },
        },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const card = session.addPlayer(auth.userId, client);
    const state = session.getPublicState();
    client.send('init', { card, state });
    if (session.playerCount >= 2 && auth.mode === 'multi') session.start();
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

`maxPlayers: 8` is a placeholder capacity for a non-queue-eligible party game with no fixed 2-player cap in its existing Room (the old `BingoSpeedRoom` never capped player count — Colyseus itself had no `maxClients` set). Before finalizing, check whether `BingoSpeedSession.addPlayer` internally caps player count; if it does, set `maxPlayers` to that same cap so `MatchRoom`'s generic seat assignment agrees with the session's own limit instead of guessing 8.

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { bingoSpeedAdapter } from './bingoSpeedAdapter';` and `'bingo-speed': bingoSpeedAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/bingoSpeedAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 11: Boggle adapter

**Files:**
- Create: `src/realtime/adapters/boggleAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts`, mirroring Task 10's shape with `game: 'boggle-word-race'` and `roomId: 'ROOM04'`, asserting an `init` message containing a `grid` arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'boggle-word-race'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import type { Cell } from '../../services/activity/boggle/BoggleEngine';
import { BoggleSession } from '../../services/activity/boggle/BoggleSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const SUBMIT_RATE_LIMIT_WINDOW_MS = 1000;
const SUBMIT_RATE_LIMIT_MAX = 10;
const MAX_PATH_LENGTH = 16;

function isValidPathPayload(value: unknown): value is Cell[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    value.every(
      (cell) =>
        typeof cell === 'object' &&
        cell !== null &&
        typeof (cell as Cell).row === 'number' &&
        typeof (cell as Cell).col === 'number' &&
        Number.isInteger((cell as Cell).row) &&
        Number.isInteger((cell as Cell).col),
    )
  );
}

export const boggleAdapter: GameRoomAdapter<BoggleSession> = {
  maxPlayers: 8,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new BoggleSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        submit_word: {
          rateLimit: { windowMs: SUBMIT_RATE_LIMIT_WINDOW_MS, max: SUBMIT_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const path = (payload as { path?: unknown })?.path;
            if (!isValidPathPayload(path)) {
              client.send('submit_error', { message: 'Invalid path' });
              return;
            }
            const result = session.submitWord(auth.userId, path);
            if (!result.accepted) client.send('submit_error', { reason: result.reason });
          },
        },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    session.addPlayer(auth.userId, client);
    client.send('init', { grid: session.getPublicGrid(), state: session.getState() });
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session?.dispose();
  },
};
```

Same `maxPlayers: 8` placeholder-capacity caveat as Task 10 — verify against `BoggleSession`'s own internal cap (if any) before finalizing.

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { boggleAdapter } from './boggleAdapter';` and `'boggle-word-race': boggleAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/boggleAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 12: CardTable adapter

CardTable is the most structurally different: its `Room.onCreate` throws if the session token lacks a `ruleset`, it looks up a `GameDefinition` from `cardGameRegistry`, uses `PerClientBroadcaster`, and its `onJoin` sends `init` **before** calling `addPlayer` (to avoid a race with a masked `state` broadcast `addPlayer` can trigger once the table fills).

**Files:**
- Create: `src/realtime/adapters/cardTableAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Read `tests/cardTableRoom.test.ts` first for how it mints a token with a valid `ruleset` (it already has to, to get past `onCreate`'s throw) and reuse the same ruleset id. Add to `tests/matchRoom.test.ts` a test creating a `'match'` room with `game: 'cards'`, connecting with a token that includes that `ruleset`, and asserting an `init` message with a `seatIndex` arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'cards'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { CardTableSession } from '../../services/activity/cards/CardTableSession';
import type { PerClientBroadcaster } from '../../services/activity/cards/PerClientBroadcaster';
import { cardGameRegistry } from '../../services/activity/cards/registry';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';
import { GamificationService } from '../../services/gamification/GamificationService';

const MOVE_RATE_LIMIT_WINDOW_MS = 1000;
const MOVE_RATE_LIMIT_MAX = 20;

export const cardTableAdapter: GameRoomAdapter<CardTableSession<unknown>> = {
  maxPlayers: 4,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    if (!ctx.ruleset) throw new Error('A cards room requires a ruleset');
    const definition = cardGameRegistry.get(ctx.ruleset);
    if (!definition) throw new Error(`Unknown card ruleset: ${ctx.ruleset}`);

    const broadcaster: PerClientBroadcaster = {
      sendToPlayer: (userId, message) => ctx.sendToPlayer(userId, message.type, message.payload),
      broadcastPublic: (message) => ctx.broadcast(message.type, message.payload),
    };

    const session = new CardTableSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId },
      broadcaster,
      definition,
      new GamificationService(),
      { onSessionEnded: ctx.onSessionEnded, setupOptions: ctx.options },
    );

    return {
      session,
      messageHandlers: {
        move: {
          rateLimit: { windowMs: MOVE_RATE_LIMIT_WINDOW_MS, max: MOVE_RATE_LIMIT_MAX },
          handle: (auth, _client, payload: unknown) => {
            const { move, args } = (payload as { move?: string; args?: unknown }) ?? {};
            if (!move) return;
            session.handleMove(auth.userId, move, args);
          },
        },
        restart: { handle: (auth) => session.requestRestart(auth.userId) },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const seatIndex = session.seatIndexFor(auth.userId);
    client.send('init', { seatIndex });
    session.addPlayer(auth.userId, client);
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

`maxPlayers: 4` matches a standard card-table seat count (e.g. Truco) — confirm against `cardGameRegistry`'s definitions if a ruleset supports a different fixed seat count; if seat count varies per ruleset, this plan's generic `maxPlayers: number` field is insufficient and this task should instead compute it from `definition.seatCount` (or equivalent field name — check `GameDefinition`'s actual shape in `src/services/activity/cards/core/GameDefinition.ts` before finalizing) inside `setup()`, returning it alongside `session`/`messageHandlers` as a third property (`maxPlayers`) that `MatchRoom` reads once `setup()` has run rather than from the static adapter object — if this divergence is real, flag it during this task's implementation rather than silently hardcoding 4.

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { cardTableAdapter } from './cardTableAdapter';` and `cards: cardTableAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/cardTableAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 13: Dominoes adapter

**Files:**
- Create: `src/realtime/adapters/dominoesAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'dominoes-block'` and `roomId: 'ROOM05'`, single-mode (`mode: 'single'`) so the bot seats immediately and the room is playable with one connection — assert the join succeeds without error.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'dominoes-block'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import type { ChainEnd, Tile } from '../../services/activity/dominoesBlock/DominoesEngine';
import { DominoesSession } from '../../services/activity/dominoesBlock/DominoesSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const MOVE_RATE_LIMIT_WINDOW_MS = 1000;
const MOVE_RATE_LIMIT_MAX = 10;

function isTile(value: unknown): value is Tile {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Tile).a === 'number' &&
    typeof (value as Tile).b === 'number' &&
    Number.isInteger((value as Tile).a) &&
    Number.isInteger((value as Tile).b) &&
    (value as Tile).a >= 0 &&
    (value as Tile).a <= 6 &&
    (value as Tile).b >= 0 &&
    (value as Tile).b <= 6
  );
}

function isChainEnd(value: unknown): value is ChainEnd {
  return value === 'left' || value === 'right';
}

export const dominoesAdapter: GameRoomAdapter<DominoesSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new DominoesSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId },
      {
        sendToPlayer: (userId, message) => ctx.sendToPlayer(userId, message.type, message.payload),
        broadcastPublic: (message) => ctx.broadcast(message.type, message.payload),
      },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        play: {
          rateLimit: { windowMs: MOVE_RATE_LIMIT_WINDOW_MS, max: MOVE_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const { tile, end } = (payload as { tile?: Tile; end?: ChainEnd }) ?? {};
            if (!isTile(tile)) {
              client.send('move_rejected', { reason: 'Malformed tile' });
              return;
            }
            if (end !== undefined && !isChainEnd(end)) {
              client.send('move_rejected', { reason: 'Malformed end' });
              return;
            }
            session.playTile(auth.userId, tile, end);
          },
        },
        pass: {
          rateLimit: { windowMs: MOVE_RATE_LIMIT_WINDOW_MS, max: MOVE_RATE_LIMIT_MAX },
          handle: (auth) => session.passTurn(auth.userId),
        },
        restart: { handle: (auth) => session.requestRestart(auth.userId) },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    session.addPlayer(auth.userId, client);
    if (auth.mode === 'single') session.enableBot();
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

`supportsQueue: false` even though Dominoes is 2-player and has bot support (making it structurally identical to the 6 queue-eligible games) — this task deliberately does not add queue support for it, matching the spec's approved queue-eligibility list (races/board games beyond the named 6 are out of scope for v1 queueing). If queueing is wanted for Dominoes later, it needs the same `getWinnerUserId`/`substitutePlayer` treatment as Task 5/6 — not part of this plan.

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { dominoesAdapter } from './dominoesAdapter';` and `'dominoes-block': dominoesAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/dominoesAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 14: Minesweeper adapter

Minesweeper is the simplest game in the whole set: no `mode` passed to its session identity, no bot, no restart, no `leave` message — `onLeave` calls `removeConnection`, not `pauseForDisconnect`.

**Files:**
- Create: `src/realtime/adapters/minesweeperAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'minesweeper-versus'` and `roomId: 'ROOM06'`, asserting an `init` message (the board snapshot) arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'minesweeper-versus'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { MinesweeperSession } from '../../services/activity/minesweeper/MinesweeperSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const REVEAL_RATE_LIMIT_WINDOW_MS = 1000;
const REVEAL_RATE_LIMIT_MAX = 20;

export const minesweeperAdapter: GameRoomAdapter<MinesweeperSession> = {
  maxPlayers: 2,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new MinesweeperSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        reveal: {
          rateLimit: { windowMs: REVEAL_RATE_LIMIT_WINDOW_MS, max: REVEAL_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const { x, y } = (payload as { x?: number; y?: number }) ?? {};
            if (
              typeof x !== 'number' ||
              typeof y !== 'number' ||
              !Number.isInteger(x) ||
              !Number.isInteger(y)
            ) {
              client.send('reveal_error', { message: 'Invalid tile coordinates' });
              return;
            }
            const result = session.reveal(auth.userId, x, y);
            if ('error' in result) client.send('reveal_error', { message: result.error });
          },
        },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    session.addPlayer(auth.userId, client);
    client.send('init', session.getBoardSnapshot());
  },
  onLeave(session, auth, client) {
    session.removeConnection(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { minesweeperAdapter } from './minesweeperAdapter';` and `'minesweeper-versus': minesweeperAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/minesweeperAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 15: Snake adapter

**Files:**
- Create: `src/realtime/adapters/snakeAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'snake-game'` and `roomId: 'ROOM07'`, asserting an `init` message with a `playerId` arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'snake-game'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { SnakeSession } from '../../services/activity/snake-game/SnakeSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const INPUT_RATE_LIMIT_WINDOW_MS = 1000;
const INPUT_RATE_LIMIT_MAX = 60;

export const snakeAdapter: GameRoomAdapter<SnakeSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new SnakeSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { width: 20, height: 20, initialSnakeLength: 3 },
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        input: {
          rateLimit: { windowMs: INPUT_RATE_LIMIT_WINDOW_MS, max: INPUT_RATE_LIMIT_MAX },
          handle: (auth, _client, payload: unknown) => {
            const direction = (payload as { direction?: string })?.direction ?? 'right';
            session.handleInput(auth.userId, direction);
          },
        },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const playerId = session.addPlayer(auth.userId, client);
    if (auth.mode === 'single') session.enableBot();
    client.send('init', { playerId, config: session.getPublicConfig() });
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

`supportsQueue: false` — same "structurally 2-player + bot but out of the approved v1 queue list" note as Task 13's Dominoes.

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { snakeAdapter } from './snakeAdapter';` and `'snake-game': snakeAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/snakeAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 16: Tower Unstable adapter

**Files:**
- Create: `src/realtime/adapters/towerUnstableAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'tower-unstable'` and `roomId: 'ROOM08'`, asserting an `init` message arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'tower-unstable'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { ACTION_REJECTED } from '../../services/activity/shared/ActionResult';
import { TowerSession } from '../../services/activity/towerUnstable/TowerSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const PULL_RATE_LIMIT_WINDOW_MS = 1000;
const PULL_RATE_LIMIT_MAX = 5;

// The original TowerUnstableRoom broadcasts room-wide from onJoin
// (`this.broadcast('game_ready', ...)`), not via `client.send` — the same
// situation as Task 7's RPS adapter, and the same fix: capture `ctx` at
// module scope so `onJoin` (which the GameRoomAdapter interface hands only
// `session`/`client`) can still reach `ctx.broadcast`.
let capturedCtx: AdapterContext;

export const towerUnstableAdapter: GameRoomAdapter<TowerSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    capturedCtx = ctx;
    const session = new TowerSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        pull: {
          rateLimit: { windowMs: PULL_RATE_LIMIT_WINDOW_MS, max: PULL_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const { level, position } = (payload as { level?: number; position?: number }) ?? {};
            const result = session.handlePull(auth.userId, level ?? -1, position ?? -1);
            if (!result.ok) client.send(ACTION_REJECTED, { error: result.error });
          },
        },
        restart: { handle: (auth) => session.requestRestart(auth.userId) },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const joined = session.addPlayer(auth.userId, client);
    if (joined && auth.mode === 'single') session.enableBot();
    client.send('init', { joined, state: session.getPublicState() });
    if (session.playerCount === 2) {
      capturedCtx.broadcast('game_ready', { state: session.getPublicState() });
    }
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { towerUnstableAdapter } from './towerUnstableAdapter';` and `'tower-unstable': towerUnstableAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/towerUnstableAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 17: Trivia Quiz adapter

**Files:**
- Create: `src/realtime/adapters/triviaQuizAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'trivia-quiz'` and `roomId: 'ROOM09'`, asserting an `init` message with `playerScores`/`leaderboard` arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'trivia-quiz'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { TriviaQuizSession } from '../../services/activity/trivia-quiz/TriviaQuizSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';
import { GamificationService } from '../../services/gamification/GamificationService';

const ANSWER_RATE_LIMIT_WINDOW_MS = 1000;
const ANSWER_RATE_LIMIT_MAX = 1;

export const triviaQuizAdapter: GameRoomAdapter<TriviaQuizSession> = {
  maxPlayers: 2,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new TriviaQuizSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      new GamificationService(),
    );

    return {
      session,
      messageHandlers: {
        answer: {
          rateLimit: { windowMs: ANSWER_RATE_LIMIT_WINDOW_MS, max: ANSWER_RATE_LIMIT_MAX },
          handle: (auth, _client, payload: unknown) => {
            const answerIndex = (payload as { answerIndex?: number })?.answerIndex ?? -1;
            if (typeof answerIndex !== 'number' || answerIndex < 0) return;
            session.handleAnswer(auth.userId, answerIndex, Date.now());
          },
        },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const joined = session.addPlayer(auth.userId, client);
    if (!joined) {
      client.send('error', { message: 'Game is full' });
      client.leave();
      return;
    }
    client.send('init', {
      playerScores: session.getPublicPlayerScores(),
      leaderboard: session.getLeaderboard(),
    });
    if (session.getState().players.size === 2) session.start();
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { triviaQuizAdapter } from './triviaQuizAdapter';` and `'trivia-quiz': triviaQuizAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/triviaQuizAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 18: Word Chain adapter

**Files:**
- Create: `src/realtime/adapters/wordChainAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'word-chain'` and `roomId: 'ROOM10'`, asserting an `init` message with a `currentWord` field arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'word-chain'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { ACTION_REJECTED } from '../../services/activity/shared/ActionResult';
import { WordChainSession } from '../../services/activity/word-chain/WordChainSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const WORD_RATE_LIMIT_WINDOW_MS = 1000;
const WORD_RATE_LIMIT_MAX = 3;

export const wordChainAdapter: GameRoomAdapter<WordChainSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new WordChainSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        word: {
          rateLimit: { windowMs: WORD_RATE_LIMIT_WINDOW_MS, max: WORD_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const word = (payload as { word?: string })?.word ?? '';
            const result = session.handleWordSubmission(auth.userId, word);
            if (!result.ok) client.send(ACTION_REJECTED, { error: result.error });
          },
        },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    session.addPlayer(auth.userId, client);
    if (auth.mode === 'single') session.enableBot();
    const state = session.state;
    client.send('init', {
      currentWord: state.currentWord,
      currentTurn: state.currentTurn,
      usedWords: Array.from(state.usedWords),
      players: state.players,
      gameOver: state.gameOver,
      winner: state.winner,
    });
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { wordChainAdapter } from './wordChainAdapter';` and `'word-chain': wordChainAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/wordChainAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 19: Wordle Race adapter

**Files:**
- Create: `src/realtime/adapters/wordleRaceAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'wordle-race'` and `roomId: 'ROOM11'`, asserting an `init` message arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'wordle-race'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { ACTION_REJECTED } from '../../services/activity/shared/ActionResult';
import { WordleRaceSession } from '../../services/activity/wordle-race/WordleRaceSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const GUESS_RATE_LIMIT_WINDOW_MS = 1000;
const GUESS_RATE_LIMIT_MAX = 3;

export const wordleRaceAdapter: GameRoomAdapter<WordleRaceSession> = {
  maxPlayers: 8,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new WordleRaceSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        guess: {
          rateLimit: { windowMs: GUESS_RATE_LIMIT_WINDOW_MS, max: GUESS_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const guess = (payload as { guess?: string })?.guess ?? '';
            const result = session.submitGuess(auth.userId, guess);
            if (!result.ok) client.send(ACTION_REJECTED, { error: result.error });
          },
        },
        leave: { handle: (auth, client) => session.leave(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    session.addPlayer(auth.userId, client);
    client.send('init', session.getGameState(auth.userId));
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

Same "verify the real cap" caveat as Tasks 10/11 applies to `maxPlayers: 8` here — check `WordleRaceSession`'s own internal player limit (if any) before finalizing.

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { wordleRaceAdapter } from './wordleRaceAdapter';` and `'wordle-race': wordleRaceAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/wordleRaceAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 20: Wordle adapter (special case — no `Session` class)

Wordle is structurally unlike every other game: `WordleRoom` doesn't construct a `*Session` at all — it holds a `WordleService` directly (a per-guild daily-word service with no player registration, no bot, no `mode` awareness, no `onDispose`). Every guess is answered privately to the guessing client; nothing is ever broadcast. This adapter's "session" is just the `WordleService` instance, and `onDispose` is a no-op — the original `WordleRoom` has none.

**Files:**
- Create: `src/realtime/adapters/wordleAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'wordle'` and `roomId: 'ROOM12'`, asserting an `init` message with `wordLength` arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'wordle'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import { WordleService } from '../../services/wordle';
import type { AdapterContext, GameRoomAdapter, SeatRole } from '../GameRoomAdapter';
import type { WsSessionPayload } from '../../services/activity/wsSessionToken';

const GUESS_RATE_LIMIT_WINDOW_MS = 1000;
const GUESS_RATE_LIMIT_MAX = 3;

export const wordleAdapter: GameRoomAdapter<WordleService> = {
  // Every player solves their own private daily puzzle — there is no shared
  // 2-player match to cap, so this is set high enough that MatchRoom's
  // generic seat assignment always seats everyone as 'player'.
  maxPlayers: 64,
  supportsBot: false,
  supportsQueue: false,

  setup(_ctx: AdapterContext) {
    const service = new WordleService();
    return {
      session: service,
      messageHandlers: {
        guess: {
          rateLimit: { windowMs: GUESS_RATE_LIMIT_WINDOW_MS, max: GUESS_RATE_LIMIT_MAX },
          handle: (auth: WsSessionPayload, client: Client, payload: unknown) => {
            const guess = (payload as { guess?: string })?.guess ?? '';
            const result = service.submitGuess(auth.userId, auth.guildId, guess);
            if ('error' in result) {
              client.send('guess_error', { message: result.error });
              return;
            }
            client.send('guess_result', result);
          },
        },
      },
    };
  },

  onJoin(service, auth, client, seat: SeatRole) {
    if (seat !== 'player') return;
    const daily = service.getDailyWord(auth.guildId);
    const userSession = service.getUserSession(auth.userId, auth.guildId);
    client.send('init', {
      wordLength: daily.word.length,
      guesses: userSession?.guesses ?? [],
      solved: userSession?.solved ?? false,
      attempts: userSession?.attempts ?? 0,
    });
  },
  onLeave() {
    // The original WordleRoom.onLeave only cleared its rate limiter — that's
    // handled generically by MatchRoom's per-message-type RateLimiter now,
    // so there is nothing game-specific left to do here.
  },
  onDispose() {
    // The original WordleRoom has no onDispose at all.
  },
};
```

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { wordleAdapter } from './wordleAdapter';` and `wordle: wordleAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/wordleAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 21: Word Search Race adapter (last of the 19)

**Files:**
- Create: `src/realtime/adapters/wordSearchRaceAdapter.ts`
- Modify: `src/realtime/adapters/registry.ts`
- Test: `tests/matchRoom.test.ts` (extend)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/matchRoom.test.ts` mirroring Task 10's shape with `game: 'word-search-race'` and `roomId: 'ROOM13'`, asserting an `init` message arrives.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/matchRoom.test.ts`
Expected: FAIL — no adapter registered for `'word-search-race'`.

- [ ] **Step 3: Write the adapter**

```ts
import type { Client } from 'colyseus';
import type { Cell } from '../../services/activity/word-search-race/WordSearchRaceEngine';
import { WordSearchRaceSession } from '../../services/activity/word-search-race/WordSearchRaceSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const SELECT_RATE_LIMIT_WINDOW_MS = 1000;
const SELECT_RATE_LIMIT_MAX = 10;

function isValidCell(value: unknown): value is Cell {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Cell).row === 'number' &&
    typeof (value as Cell).col === 'number' &&
    Number.isInteger((value as Cell).row) &&
    Number.isInteger((value as Cell).col)
  );
}

export const wordSearchRaceAdapter: GameRoomAdapter<WordSearchRaceSession> = {
  maxPlayers: 8,
  supportsBot: false,
  supportsQueue: false,

  setup(ctx: AdapterContext) {
    const session = new WordSearchRaceSession(
      { sessionKey: ctx.roomKey, instanceId: ctx.instanceId, guildId: ctx.guildId, mode: ctx.mode },
      { broadcast: (_key, message) => ctx.broadcast(message.type, message.payload) },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        select: {
          rateLimit: { windowMs: SELECT_RATE_LIMIT_WINDOW_MS, max: SELECT_RATE_LIMIT_MAX },
          handle: (auth, client, payload: unknown) => {
            const { start, end } = (payload as { start?: unknown; end?: unknown }) ?? {};
            if (!isValidCell(start) || !isValidCell(end)) {
              client.send('select_error', { message: 'Invalid selection' });
              return;
            }
            const result = session.submitSelection(auth.userId, start, end);
            if ('error' in result) client.send('select_error', { message: result.error });
          },
        },
        leave: { handle: (auth, client) => session.removePlayer(auth.userId, client) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    session.addPlayer(auth.userId, client);
    client.send('init', session.getPublicState());
  },
  onLeave(session, auth, client) {
    session.removePlayer(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
};
```

Same "verify the real cap" caveat as Tasks 10/11/19 applies to `maxPlayers: 8`.

- [ ] **Step 4: Register and run**

Add to `src/realtime/adapters/registry.ts`: `import { wordSearchRaceAdapter } from './wordSearchRaceAdapter';` and `'word-search-race': wordSearchRaceAdapter,`.

Run: `bun test tests/matchRoom.test.ts`
Expected: PASS — all 19 games now have a registered adapter.

- [ ] **Step 5: Commit**

```bash
git add src/realtime/adapters/wordSearchRaceAdapter.ts src/realtime/adapters/registry.ts tests/matchRoom.test.ts
git status
```

---

### Task 22: Final cutover — remove the 19 old `*Room.ts` files, register `'match'` in `src/index.ts`, sync both specs

**Files:**
- Modify: `src/index.ts`
- Delete: all 19 files in `src/realtime/*Room.ts` (`BattleshipRoom.ts`, `BingoSpeedRoom.ts`, `BoggleRoom.ts`, `CardTableRoom.ts`, `CheckersRoom.ts`, `ConnectFourRoom.ts`, `DominoesBlockRoom.ts`, `HangmanRoom.ts`, `MinesweeperRoom.ts`, `PongRoom.ts`, `RpsRoom.ts`, `SnakeRoom.ts`, `TicTacToeRoom.ts`, `TowerUnstableRoom.ts`, `TriviaQuizRoom.ts`, `WordChainRoom.ts`, `WordleRaceRoom.ts`, `WordleRoom.ts`, `WordSearchRaceRoom.ts`)
- Delete: `tests/battleshipRoom.test.ts`, `tests/cardTableRoom.test.ts`, `tests/pongRoom.test.ts`, `tests/snakeRoom.test.ts`, `tests/wordleRoom.test.ts` (each directly imports and instantiates its now-deleted `*Room` class; their coverage — invalid-token rejection, successful join — is superseded by `tests/matchRoom.test.ts`'s per-game integration tests added in Tasks 3/10-21 and this task's Step 3 below)
- Modify: `docs/superpowers/specs/2026-08-30-multiplayer-rooms-server-design.md` and `marquinhos-activity-client/docs/superpowers/specs/2026-08-30-multiplayer-rooms-client-design.md` (both repos — the client repo is a sibling directory, not this one; only the two spec files are touched there, nothing else)

**Interfaces:**
- Consumes: `ADAPTER_REGISTRY` (Task 3, fully populated by Task 21), `MatchRoom` (Tasks 3-4).

- [ ] **Step 1: Add the two missing invalid-token-rejection cases to `tests/matchRoom.test.ts`**

The 5 test files being deleted each had an "invalid token" and/or "mismatched roomKey" rejection test beyond the generic one already in `tests/matchRoom.test.ts` from Task 3. Read each of the 5 files being deleted one more time; for any assertion not already equivalent to something in `tests/matchRoom.test.ts` (the Task 3 "rejects a join with an invalid session token" test already covers the generic case for every game, since `onAuth` is fully shared — no per-game variant of that check exists), add nothing further. Confirm this by running the full suite in Step 4 below and checking coverage didn't regress — if any of the 5 deleted files tested something `MatchRoom`-level tests don't already exercise (e.g., a game-specific rejection path), add that one case to the relevant adapter's own test file (from Tasks 5-21) instead of to `matchRoom.test.ts`.

- [ ] **Step 2: Update `src/index.ts`**

Replace the 19 `import { XRoom } from './realtime/XRoom';` lines and the 19 `gameServer.define(game, XRoom).filterBy(['roomKey']);` lines with:

```ts
import { MatchRoom } from './realtime/MatchRoom';
```

and

```ts
gameServer.define('match', MatchRoom).filterBy(['roomKey']);
```

(a single `define` call replaces all 19 — `MatchRoom` dispatches to the right adapter internally via the `game` option passed at creation time, exactly as every adapter task's tests already do via `colyseus.createRoom('match', { roomKey, game: '<id>' })`).

- [ ] **Step 3: Delete the 19 old Room files and the 5 superseded test files**

```bash
rm src/realtime/BattleshipRoom.ts src/realtime/BingoSpeedRoom.ts src/realtime/BoggleRoom.ts src/realtime/CardTableRoom.ts src/realtime/CheckersRoom.ts src/realtime/ConnectFourRoom.ts src/realtime/DominoesBlockRoom.ts src/realtime/HangmanRoom.ts src/realtime/MinesweeperRoom.ts src/realtime/PongRoom.ts src/realtime/RpsRoom.ts src/realtime/SnakeRoom.ts src/realtime/TicTacToeRoom.ts src/realtime/TowerUnstableRoom.ts src/realtime/TriviaQuizRoom.ts src/realtime/WordChainRoom.ts src/realtime/WordleRaceRoom.ts src/realtime/WordleRoom.ts src/realtime/WordSearchRaceRoom.ts
rm tests/battleshipRoom.test.ts tests/cardTableRoom.test.ts tests/pongRoom.test.ts tests/snakeRoom.test.ts tests/wordleRoom.test.ts
```

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `bun test`
Expected: PASS — every remaining reference to the deleted `*Room` classes should be gone; if `bun test` reports an unresolved import, find and fix the remaining reference before proceeding (e.g. any lingering import in a file this plan didn't touch).

Run: `bun run typecheck`
Expected: PASS with no errors referencing the deleted files.

- [ ] **Step 5: Update both spec documents to match the implemented `getWinnerUserId`-polling design**

In `docs/superpowers/specs/2026-08-30-multiplayer-rooms-server-design.md`, replace the "Match-end interception" bullet (the one describing `MatchRoom` wrapping the broadcaster and calling `adapter.extractWinnerUserId?.(type, payload)`) with a description of the actual implemented mechanism: `MatchRoom` calls `adapter.getWinnerUserId?.(session)` after routing each message (see `loadSession()`'s `handle(...); this.maybeRotateAfterMatchEnd();` in this plan's Task 4), and each queue-eligible session exposes that method directly rather than the room inferring it from a broadcast payload. Update the `GameRoomAdapter` interface shown in that spec to match `src/realtime/GameRoomAdapter.ts` exactly (`getWinnerUserId?(session): string | null` and `substitutePlayer?(session, outgoingUserId, incomingUserId, incomingClient): boolean`, no `extractWinnerUserId`). Update the Shared Contract section's queue-eligible-games list if it has drifted (it shouldn't have — still tic-tac-toe, connect-four, checkers, rock-paper-scissors, battleship, pong).

Also replace every `hostName` reference in the Shared Contract's room-listing metadata shape with `hostUserId: string` — `WsSessionPayload` only ever carries a `userId`, never a display name, so the server has nothing to put in a `hostName` field (this plan's Task 4 `syncMetadata()` sets `hostUserId`, not `hostName`). Resolving a human-readable name from `hostUserId` is a client-side concern (matching it against Discord SDK participant data already available to the client), out of scope for the server.

Apply both corrections identically to the **Shared Contract** section of `marquinhos-activity-client/docs/superpowers/specs/2026-08-30-multiplayer-rooms-client-design.md` — that section is duplicated verbatim in both specs by design, so both must be edited to stay in sync. Also update that client spec's `RoomListScreen` description (which currently reads `metadata.hostName`) to read `metadata.hostUserId` and resolve a display name from the client's own Discord participant data instead. This is the one place this plan touches a file in the sibling `marquinhos-activity-client` repository, and it's limited to these edits within the two spec documents.

- [ ] **Step 6: Manual smoke test (documented, not automated)**

Run `bun run dev` locally and, using the Colyseus SDK from a scratch script or the browser console against a local client build, confirm: (a) creating a `'match'` room with `game: 'tic-tac-toe'` and joining twice seats two players and produces a working game; (b) a third join with `queueEnabled` seats as `'queued'`; (c) after one player wins, the loser's role flips to `'queued'` and the queued player's role flips to `'player'`. This step has no `bun test` command because it exercises the real WebSocket transport end-to-end rather than `@colyseus/testing`'s in-process harness — record the outcome in the PR description rather than as an automated assertion.

- [ ] **Step 7: Commit**

```bash
git add -A
git status
```

(Review `git status` carefully before this add — it should show 19 deletions in `src/realtime/`, 5 deletions in `tests/`, the `src/index.ts` change, and modifications to both spec files across the two repos. Per this repo's constraint, do not run `git commit`.)
