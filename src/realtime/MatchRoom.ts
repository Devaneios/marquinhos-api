import { Room, type Client } from 'colyseus';
import type { ActivityMode, GameId } from '../services/activity/gameId';
import { roomKey } from '../services/activity/roomKey';
import { ACTION_REJECTED } from '../services/activity/shared/ActionResult';
import { RateLimiter } from '../services/activity/shared/RateLimiter';
import {
  verifyWsSessionToken,
  type WsSessionPayload,
} from '../services/activity/wsSessionToken';
import { ADAPTER_REGISTRY } from './adapters/registry';
import type {
  AdapterContext,
  GameRoomAdapter,
  SeatRole,
} from './GameRoomAdapter';

interface Member {
  userId: string;
  role: SeatRole;
  // Counts concurrent connections (e.g. two tabs) under one userId so a
  // reconnect/second-tab join doesn't inflate `assignSeat()`'s player count
  // or trigger a spurious host handoff when only one of several connections
  // for the same user drops.
  connections: number;
}

// 'cards' can't be switched into from a bare `{ game }` message — its room
// requires a ruleset chosen at creation, which switch_game has no way to
// supply (see this task's "known, accepted limitation").
const SWITCHABLE_GAMES: ReadonlySet<GameId> = new Set(
  Object.keys(ADAPTER_REGISTRY).filter((g) => g !== 'cards') as GameId[],
);

export class MatchRoom extends Room {
  private adapter!: GameRoomAdapter<unknown>;
  private session!: unknown;
  // The per-room AdapterContext, re-captured here (not on the adapter
  // object) because ADAPTER_REGISTRY holds one shared adapter instance
  // across every concurrent room of that game — a module-level capture
  // inside the adapter itself would get clobbered by the next room's
  // setup() call. Passed to onJoin so adapters that need ctx.broadcast
  // outside setup() (e.g. Tic-Tac-Toe's game_ready) always see their own
  // room's context, not whichever room's setup() ran most recently.
  private ctx!: AdapterContext;
  private members: Member[] = [];
  private hostUserId: string | null = null;
  private mode: ActivityMode = 'multi';
  private queueEnabled = false;
  private rateLimiters = new Map<string, RateLimiter>();
  // Unbind functions returned by `onMessage`, so `loadSession()` can tear
  // down the previous adapter's handlers before registering new ones —
  // `onMessage` appends a listener rather than replacing one for the same
  // type, so without this a second `loadSession()` call (`switch_game`)
  // would leave stale handlers firing against a disposed session.
  private messageUnsubscribers: Array<() => void> = [];
  // Stored on the instance (not read back from `this.metadata`) so it's
  // available synchronously the moment onCreate runs, and again later from
  // `loadSession()`/`syncMetadata()` when `switch_game` calls them a second
  // time without a fresh `options` object.
  private roomKeyValue = '';
  private roomIdValue = '';
  private game!: GameId;
  // Everything loadSession() needs to rebuild an AdapterContext, captured
  // once at onCreate (from the signed token, when present) so switch_game
  // can call loadSession() a second time without a fresh options object —
  // the room's original creation options aren't re-derivable once the room
  // exists (Pong's difficulty/winningScore reset to defaults on switch).
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
    // create a room without first minting a token. When a token IS present,
    // it must agree with any raw `options.game` also supplied, or a client
    // could load one game's adapter against another game's roomKey/token.
    if (
      initialSession &&
      options.game &&
      initialSession.game !== options.game
    ) {
      throw new Error('game mismatch between token and join options');
    }
    // Signed token wins when present (the token is trusted, the raw option
    // is not); raw `options.game` is only a fallback for tests that create a
    // room without minting a token.
    const game = initialSession?.game ?? options.game;
    if (!game) throw new Error('Cannot determine which game this room is for');

    this.mode = initialSession?.mode ?? 'multi';
    this.queueEnabled =
      this.mode === 'multi' ? Boolean(options.queueEnabled) : false;
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

  // Populates the fields `client.getAvailableRooms('match')` reads
  // client-side for the room list. `hostName` is deliberately not included —
  // WsSessionPayload only carries a userId, never a display name, so
  // resolving "host's display name" is a client-side concern (matching
  // hostUserId against Discord SDK participant data), not something this
  // server can populate.
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
    const ctx: AdapterContext = {
      roomKey: this.roomKeyValue,
      instanceId: this.identity.instanceId,
      guildId: this.identity.guildId,
      mode: this.mode,
      difficulty: this.identity.difficulty,
      winningScore: this.identity.winningScore,
      ruleset: this.identity.ruleset,
      options: this.identity.options,
      broadcast: (type: string, payload?: unknown) =>
        this.broadcast(type, payload),
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

    for (const unsubscribe of this.messageUnsubscribers) unsubscribe();
    this.messageUnsubscribers = [];

    this.ctx = ctx;
    const { session, messageHandlers } = this.adapter.setup(ctx);
    this.session = session;
    this.rateLimiters.clear();

    for (const [type, { rateLimit, handle }] of Object.entries(
      messageHandlers,
    )) {
      if (rateLimit) this.rateLimiters.set(type, new RateLimiter(rateLimit));
      const unsubscribe = this.onMessage(type, (client, payload) => {
        const limiter = this.rateLimiters.get(type);
        if (limiter?.isOverLimit(client)) return;
        handle(client.auth as WsSessionPayload, client, payload);
        this.maybeRotateAfterMatchEnd();
      });
      this.messageUnsubscribers.push(unsubscribe);
    }
  }

  // Host-only room controls. Registered once in onCreate (unlike the
  // per-adapter handlers in loadSession(), these never need to be torn down
  // and re-registered by switch_game — they route to the adapter indirectly
  // through `this.adapter`/`this.session`, which switch_game reassigns).
  private registerRoomLevelMessages() {
    this.onMessage('switch_game', (client, payload: { game?: GameId }) => {
      const auth = client.auth as WsSessionPayload;
      if (auth.userId !== this.hostUserId) {
        client.send(ACTION_REJECTED, {
          error: 'Only the host can switch games',
        });
        return;
      }
      if (this.isMatchInProgress()) {
        client.send(ACTION_REJECTED, {
          error: 'Cannot switch games mid-match',
        });
        return;
      }
      const game = payload?.game;
      if (!game || !SWITCHABLE_GAMES.has(game)) {
        client.send(ACTION_REJECTED, {
          error: 'Unknown or unswitchable game',
        });
        return;
      }
      this.switchGame(game);
    });

    this.onMessage('toggle_queue', (client, payload: { enabled?: boolean }) => {
      const auth = client.auth as WsSessionPayload;
      if (auth.userId !== this.hostUserId) {
        client.send(ACTION_REJECTED, {
          error: 'Only the host can toggle the queue',
        });
        return;
      }
      this.queueEnabled = Boolean(payload?.enabled);
      this.syncMetadata();
    });

    this.onMessage('rotate_seat', (client) => {
      const auth = client.auth as WsSessionPayload;
      if (this.isMatchInProgress()) {
        client.send(ACTION_REJECTED, {
          error: 'Cannot rotate seats mid-match',
        });
        return;
      }
      const sender = this.members.find(
        (m) => m.userId === auth.userId && m.role === 'player',
      );
      if (!sender) {
        client.send(ACTION_REJECTED, {
          error: 'Only a seated player can rotate out',
        });
        return;
      }
      const queueHead = this.members.find((m) => m.role === 'queued');
      if (!queueHead) {
        client.send(ACTION_REJECTED, {
          error: 'No one is waiting in the queue',
        });
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
    if (
      !this.queueEnabled ||
      !this.adapter.getWinnerUserId ||
      !this.adapter.substitutePlayer
    ) {
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
    // Re-seat the outgoing member at the back of the queue.
    this.members = [
      ...this.members.filter((m) => m.userId !== outgoingUserId),
      ...(outgoing ? [outgoing] : []),
    ];
    this.syncMetadata();
  }

  private assignSeat(): SeatRole {
    if (this.mode !== 'multi') return 'player';
    const playerCount = this.members.filter((m) => m.role === 'player').length;
    if (playerCount < this.adapter.maxPlayers) return 'player';
    if (this.queueEnabled && this.adapter.supportsQueue) return 'queued';
    return 'spectator';
  }

  // Shared by onJoin and switchGame's client-reseating loop: dedupes a
  // second connection under an already-seated userId (incrementing its
  // connection count instead of double-counting it toward `assignSeat()`),
  // while still calling `adapter.onJoin` for every individual connection so
  // each socket gets its own `init` message.
  private seatClient(client: Client, auth: WsSessionPayload): SeatRole {
    const existing = this.members.find((m) => m.userId === auth.userId);
    let role: SeatRole;
    if (existing) {
      existing.connections += 1;
      role = existing.role;
    } else {
      role = this.assignSeat();
      this.members.push({ userId: auth.userId, role, connections: 1 });
    }
    this.adapter.onJoin(this.session, auth, client, role, this.ctx);
    return role;
  }

  override onJoin(client: Client, _options: unknown, auth: WsSessionPayload) {
    if (this.hostUserId === null) this.hostUserId = auth.userId;
    this.seatClient(client, auth);
    this.syncMetadata();
  }

  override onLeave(client: Client) {
    const auth = client.auth as WsSessionPayload;

    for (const limiter of this.rateLimiters.values()) limiter.clear(client);
    this.adapter.onLeave(this.session, auth, client);

    const member = this.members.find((m) => m.userId === auth.userId);
    if (member) {
      member.connections -= 1;
      if (member.connections <= 0) {
        const wasHost = auth.userId === this.hostUserId;
        this.members = this.members.filter((m) => m.userId !== auth.userId);
        if (wasHost && this.members.length > 0) {
          this.hostUserId = this.members[0]!.userId;
        }
      }
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
      this.seatClient(client, auth);
    }
    this.syncMetadata();
  }
}
