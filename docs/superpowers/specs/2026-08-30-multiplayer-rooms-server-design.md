# Multiplayer Rooms — Server Design

**Companion spec:** `marquinhos-activity-client/docs/superpowers/specs/2026-08-30-multiplayer-rooms-client-design.md` (client-side landing/room-UI architecture). The **Shared Contract** section below is duplicated verbatim in both specs — it is the interface between them.

## Problem

Today, `src/realtime/` has one Colyseus `Room` subclass per game (19 files, e.g. `TicTacToeRoom.ts`). Multiplayer matchmaking is entirely implicit in `roomKey()`: `mode: 'multi'` produces `${instanceId}:${game}:multi`, meaning every player in one Discord Activity instance who picks the same game lands in the same, single, shared match. There is no host, no room boundary narrower than "the whole call," no spectating, and no queueing.

## Goal

Replace the 19 per-game `Room` subclasses with one generic `MatchRoom`, and each game's Colyseus-specific plumbing with a `GameRoomAdapter`. `MatchRoom` owns everything cross-cutting — host authority, seat assignment (player/spectator/queued), queue rotation, and game-switching — as Colyseus-synced state, generically, once. Adapters own only what's actually game-specific: which messages a game accepts, how to construct its `Session`, and (for queue-eligible games only) how to read a winner out of its own state shape and how to hot-swap a seat.

## Architecture

### `GameRoomAdapter<TSession>` interface

```ts
interface GameRoomAdapter<TSession> {
  game: GameId;
  maxPlayers: number;
  supportsBot: boolean;
  supportsQueue: boolean;

  createSession(ctx: AdapterContext): TSession;

  messageHandlers: Record<string, {
    rateLimit?: { windowMs: number; max: number };
    handle: (session: TSession, auth: WsSessionPayload, client: Client, payload: unknown) => void;
  }>;

  onJoin(session: TSession, auth: WsSessionPayload, client: Client, seat: 'player' | 'spectator'): void;
  onLeave(session: TSession, auth: WsSessionPayload, client: Client): void;
  onDispose(session: TSession): void;

  // Required only when supportsQueue is true.
  extractWinnerUserId?: (broadcastType: string, payload: unknown) => string | null | undefined;
  substitutePlayer?: (session: TSession, outgoingUserId: string, incomingUserId: string, incomingClient: Client) => void;
}

interface AdapterContext {
  roomKey: string;
  instanceId: string;
  guildId: string;
  mode: 'single' | 'multi';
  broadcaster: { broadcast: (key: string, message: { type: string; payload?: unknown }) => void };
  onSessionEnded: () => void;
}
```

Each of the 19 existing `*Room.ts` files is replaced by one adapter module (e.g. `realtime/adapters/ticTacToeAdapter.ts`) that wraps the existing, unchanged `*Session` classes (`TicTacToeSession`, `CheckersSession`, etc.) — the engines and session logic are not being rewritten, only the Colyseus integration layer around them.

### `MatchRoom` (single Colyseus room, registered as `'match'`)

Synced Colyseus Schema state:
```
{
  roomId: string
  game: GameId
  hostUserId: string
  queueEnabled: boolean
  matchInProgress: boolean
  members: [{ userId: string, displayName: string, role: 'player' | 'spectator' | 'queued' }]
}
```

- **`onAuth`** — unchanged from today: verify the signed token via `verifyWsSessionToken`, check `roomKey(session) === options.roomKey`. Fully generic, no adapter involvement.
- **`onCreate(options)`** — `options.roomId`, `options.game`, `options.queueEnabled` select the adapter (loaded from a static `Record<GameId, GameRoomAdapter>` registry) and seed `state.queueEnabled`. `options.mode` (`'single' | 'multi'`) is also captured here for use in `onJoin` below. `onCreate` cannot set `state.hostUserId` yet — Colyseus runs `onCreate` before any client has authenticated. Instead, a private `hostAssigned = false` flag is initialized.
- **`onJoin(client, options, auth)`** — seat assignment (generic, not adapter logic):
  1. If `!hostAssigned`: this is the first client to join a freshly created room instance — by construction, that's always the room's creator, since no one else can have a valid token for a `roomId` that was just minted and hasn't appeared in any room listing yet. Set `state.hostUserId = auth.userId`, `hostAssigned = true`.
  2. If `mode === 'single'`: seat as `player`, call `adapter.onJoin(session, auth, client, 'player')`, then `adapter.supportsBot` triggers bot enable exactly as today. (`queueEnabled` stays `false` and the room is excluded from listing metadata for single-player, regardless of what was passed in `options` — the server ignores `queueEnabled`/room-listing for `mode: 'single'`.) Steps 3-4 below don't apply to single-player.
  3. Else if current `player`-role member count `< adapter.maxPlayers`: seat as `player`.
  4. Else if `queueEnabled && adapter.supportsQueue`: seat as `queued`, appended to the end of `members` in join order.
  5. Else: seat as `spectator`.
  Player/spectator/queued clients all receive the same room broadcasts (Colyseus broadcasts to every connected client by default) — queued/spectating clients simply never get `adapter.onJoin(..., 'player')` called, so they're never registered inside the game `Session`.
- **`switch_game` message** (host-only) — rejected via `ACTION_REJECTED` if sender isn't `hostUserId` or `matchInProgress` is true. Otherwise: `adapter.onDispose(session)` on the current adapter, load the new adapter for the requested game, `createSession(ctx)`, re-seat existing `members` against the new `maxPlayers` (excess players demoted to `queued`/`spectator` per the same seat-assignment rule above), broadcast fresh `init` state to all connected clients.
- **`toggle_queue` message** (host-only) — rejected via `ACTION_REJECTED` if sender isn't `hostUserId`. If `matchInProgress`, the flag change is staged and applied once the match concludes (so an in-progress match's participant count doesn't shift mid-match).
- **`rotate_seat` message** (any seated `player`, only when `!matchInProgress`) — rejected via `ACTION_REJECTED` if `matchInProgress`, the sender isn't a seated player, or `members` has no `queued` entries (nothing to promote — see below). Otherwise: `adapter.substitutePlayer(session, senderUserId, queueHeadUserId, queueHeadClient)`, sender moves to the back of `members` with role `queued`, former queue head becomes `player`. This one operation implements both "give up my seat" (voluntary) and loser-rotation (automatic, below) — they differ only in what triggers them, not in what happens.
- **Match-end interception** — `MatchRoom` supplies each adapter's `createSession(ctx)` with a `broadcaster` whose `broadcast()` both (a) performs the real `this.broadcast(type, payload)` to all clients, exactly as today, and (b) calls `adapter.extractWinnerUserId?.(type, payload)`. A non-null/non-undefined result sets `matchInProgress = false` and, if `queueEnabled` **and** `members` has at least one `queued` entry, triggers the same rotation as `rotate_seat` with `outgoingUserId` = the *non-winning* seated player (looked up from `members` filtered to role `player`, excluding the winner). If `!queueEnabled`, or `queueEnabled` but the queue is empty (only the two players have ever joined), no rotation happens — the two players simply stay seated for a rematch (existing `restart` message flow, unchanged).
- **`onLeave(client)`** — existing per-adapter cleanup (`moveRateLimiter.clear(client)` equivalent, `session.pauseForDisconnect`) still runs via `adapter.onLeave`. Additionally, generically: remove the leaving user from `members`; if they were `hostUserId` and other members remain, transfer host to the next-longest-seated member (earliest `members` entry by join order); if `members` becomes empty, call `adapter.onDispose(session)` and `this.disconnect()`.
- **Room listing** — `setMetadata({ instanceId, roomId, game, hostName, playerCount, spectatorCount, queueDepth, queueEnabled, mode })`, updated whenever `members` or `queueEnabled` changes. Consumed client-side via `client.getAvailableRooms('match')` (no new REST endpoint needed for listing).

### `roomKey()` change (`services/activity/roomKey.ts`)

```ts
export interface ActivityScope {
  instanceId: string;
  game: GameId;
  mode: ActivityMode;
  userId: string;
  roomId?: string;   // new — required for mode 'multi', absent for 'single'/'local'
  ruleset?: string;
}

export function roomKey({ instanceId, game, mode, userId, roomId, ruleset }: ActivityScope): string {
  const base =
    mode === 'multi'
      ? `${instanceId}:${roomId}:${game}:multi`
      : `${instanceId}:${game}:${mode}:${userId}`;
  return ruleset ? `${base}:${ruleset}` : base;
}
```

`roomId` is a server-generated 6-character uppercase alphanumeric code (via `nanoid`'s `customAlphabet`), minted once when a room is created and carried through every subsequent `roomKey()` call for that room's lifetime.

### New REST endpoint: `POST /activities/rooms`

Mints a `roomId` and the creating host's signed `ws-session` token together (room creation is now a distinct action from starting to play). Request: `{ accessToken, instanceId, guildId, game: GameId, queueEnabled: boolean }`. Response: `{ roomId, token, roomKey }`. Internally: generate `roomId`, verify the Discord `accessToken` (same verification path `/activities/ws-session` already uses), sign a token via the existing `wsSessionToken` module with `mode: 'multi'`, compute `roomKey({ instanceId, game, mode: 'multi', userId, roomId })`.

### `POST /activities/ws-session` (existing endpoint, extended)

Body gains an optional `roomId`, required when `mode: 'multi'`. Used both by the room creator's initial connection (after `POST /activities/rooms`, though that endpoint already returns a token directly — `ws-session` is used by subsequent *joiners* of an existing room) and by anyone joining a room from the room list. Response shape unchanged.

## Data flow: a match ending with queue enabled

1. A queue-eligible game's `Session` broadcasts its regular state-update message (e.g. `state_update` with `winner` in the payload) exactly as it does today — no engine changes.
2. `MatchRoom`'s wrapped broadcaster calls `adapter.extractWinnerUserId('state_update', payload)`, which maps the game's own winner representation (e.g. TicTacToe's `Player` marker) back to a `userId` via the session's player list.
3. `MatchRoom` sets `matchInProgress = false`, looks up the non-winning seated player, and — since `queueEnabled` — calls the same rotation path as `rotate_seat`: loser demoted to `queued` at the back of `members`, queue head promoted to `player`.
4. `adapter.substitutePlayer(session, loserId, newPlayerId, newPlayerClient)` hot-swaps the seat inside the `Session` without a socket reconnect — the incoming player was already connected (as `queued`), just not registered as a player in the engine.
5. Updated `members`/`queueEnabled`/`matchInProgress` sync to all clients automatically via Colyseus state sync; the new player's client sees its `role` flip from `queued` to `player` and the game UI (see companion spec) enables move input.

## Error handling

- `switch_game`/`toggle_queue` from a non-host, or `rotate_seat` from a non-player: rejected via the existing `ACTION_REJECTED` message type (already used for invalid moves, e.g. `TicTacToeRoom.ts:72`).
- Any of the three room-level messages arriving while `matchInProgress`: rejected the same way, rather than silently ignored, so the client can surface a clear error instead of an inexplicable no-op.
- `rotate_seat` with an empty queue: rejected the same way — there's no one to promote into the vacated seat, so the two current players simply stay seated.
- Host disconnect with other members present: host transfers automatically (no message required, purely server-driven via `onLeave`).
- Empty room (last member leaves): room disposes via `adapter.onDispose` + `this.disconnect()`, and stops appearing in `getAvailableRooms` results automatically (Colyseus's own behavior once a room disposes).

## Testing

- `GameRoomAdapter` implementations are plain objects wrapping existing `*Session` classes — testable in isolation without a live Colyseus room, following this repo's existing pattern of unit-testing session logic directly (`tests/*`).
- `extractWinnerUserId`/`substitutePlayer` for each of the 6 queue-eligible adapters get dedicated unit tests: feed a known `state_update` payload in, assert the correct `userId` comes out; call `substitutePlayer` against a live `Session` instance and assert the new player is registered and the old one is not.
- `MatchRoom`'s generic seat-assignment, host-transfer, and rotation logic should be extracted into pure functions (e.g. `assignSeat(members, maxPlayers, queueEnabled, adapter): SeatDecision`, `transferHost(members, leavingUserId): string | null`, `rotateSeat(members, outgoingUserId): Members`) operating on plain data, not on the live Colyseus `Room` instance — unit-tested directly without spinning up a server, matching this repo's existing preference for pure, directly-testable logic underneath thin Colyseus wrappers (see `TicTacToeSession`'s separation from `TicTacToeRoom`).

## Global Constraints

- Existing per-game `Session`/engine classes (`TicTacToeSession`, `CheckersEngine`, etc.) are **not** rewritten — only their Colyseus integration (`*Room.ts`) is replaced by an adapter wrapping the same session.
- Existing message protocols per game (message names/payload shapes like `move`, `state_update`, `restart`) are unchanged — adapters route the same messages, they don't redefine them.
- `verifyWsSessionToken`/`wsSessionToken` signing logic is reused as-is; `roomId` becomes part of what's encoded in `roomKey`, not a new signed claim.
- Rate limiting per message type (`RateLimiter`, e.g. `MOVE_RATE_LIMIT_WINDOW_MS`/`MAX` in `TicTacToeRoom.ts`) moves into each adapter's `messageHandlers[type].rateLimit` config, applied generically by `MatchRoom`.

---

## Shared Contract (duplicated in both specs)

### REST

- `POST /activities/rooms` — body: `{ accessToken, instanceId, guildId, game: GameId, queueEnabled: boolean }` → response: `{ roomId: string, token: string, roomKey: string }`.
- `POST /activities/ws-session` (existing endpoint, extended) — body gains an optional `roomId: string`, required when `mode: 'multi'` after this change (omitted/ignored for `'single'`). Response shape (`{ token, roomKey }`) is unchanged.

### Colyseus room

Single physical room type registered as `'match'`. Clients always call `client.joinOrCreate('match', { token, roomKey })` — never join by game name.

`roomKey` format:
- single-player (unchanged): `${instanceId}:${game}:single:${userId}`
- multiplayer (new `roomId` segment): `${instanceId}:${roomId}:${game}:multi`

### Synced room state (Colyseus Schema, visible to every connected client including spectators)

```
{
  roomId: string
  game: GameId
  hostUserId: string
  queueEnabled: boolean
  matchInProgress: boolean
  members: [{ userId: string, displayName: string, role: 'player' | 'spectator' | 'queued' }]
}
```

### Client → server messages (room-level, handled generically, not per-game)

- `switch_game { game: GameId }` — host-only; rejected (`ACTION_REJECTED`) if not host or `matchInProgress`.
- `toggle_queue { enabled: boolean }` — host-only; if `matchInProgress`, the change is deferred until the match concludes.
- `rotate_seat {}` — any seated player, only when `!matchInProgress`; vacates the sender's seat, promotes the queue head into it. Used both for a manual "give up my seat" action and reused server-side as the mechanism for automatic loser-rotation.
- Per-game messages (`move`, `restart`, etc.) — unchanged, routed to the active adapter.

### Room listing metadata (`setMetadata`, read via `client.getAvailableRooms('match')`)

```
{ instanceId, roomId, game, hostName, playerCount, spectatorCount, queueDepth, queueEnabled, mode: 'single' | 'multi' }
```

Single-player rooms set `mode: 'single'`; the client's room list only shows rows where `mode === 'multi'` and `instanceId` matches the current Discord instance.

### Queue-eligible games

Support `extractWinnerUserId` + `substitutePlayer` server-side, `maxPlayers: 2`: `tic-tac-toe`, `connect-four`, `checkers`, `rock-paper-scissors`, `battleship`, `pong`.

### `supportsSinglePlayer` (per game, static client-side registry flag)

- `true`: battleship, checkers, connect-four, dominoes-block, pong, rock-paper-scissors, snake-game, tic-tac-toe, tower-unstable, word-chain.
- `false`: bingo-speed, boggle-word-race, cards, hangman, minesweeper-versus, trivia-quiz, wordle, wordle-race, word-search-race.
