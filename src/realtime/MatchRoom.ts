import { Room, type Client } from 'colyseus';
import type { ActivityMode, GameId } from '../services/activity/gameId';
import { roomKey } from '../services/activity/roomKey';
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
  private rateLimiters = new Map<string, RateLimiter>();
  // Unbind functions returned by `onMessage`, so `loadSession()` can tear
  // down the previous adapter's handlers before registering new ones —
  // `onMessage` appends a listener rather than replacing one for the same
  // type, so without this a second `loadSession()` call (Task 4's
  // `switch_game`) would leave stale handlers firing against a disposed
  // session.
  private messageUnsubscribers: Array<() => void> = [];
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

  override onCreate(options: {
    roomKey: string;
    token?: string;
    game?: GameId;
  }) {
    this.roomKeyValue = options.roomKey;
    this.setMetadata({ roomKey: options.roomKey });

    const initialSession = options.token
      ? verifyWsSessionToken(options.token)
      : null;
    this.mode = initialSession?.mode ?? 'multi';

    // The signed token's `game` always wins when present — `options.game` is
    // unsigned and, since `onAuth` only cross-checks `roomKey`, a caller
    // could otherwise pass a `game` that disagrees with the token used to
    // derive that roomKey and load the wrong adapter under it. `options.game`
    // exists purely so tests can create a room without first minting a token
    // (see this task's own test above); the real client join
    // (`client.joinOrCreate('match', { token, roomKey })`) never needs it.
    const game = initialSession?.game ?? options.game;
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
      });
      this.messageUnsubscribers.push(unsubscribe);
    }
  }

  private assignSeat(): SeatRole {
    if (this.mode !== 'multi') return 'player';
    const playerCount = this.members.filter((m) => m.role === 'player').length;
    return playerCount < this.adapter.maxPlayers ? 'player' : 'spectator';
  }

  override onJoin(client: Client, _options: unknown, auth: WsSessionPayload) {
    if (this.hostUserId === null) this.hostUserId = auth.userId;

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
  }

  override onLeave(client: Client) {
    const auth = client.auth as WsSessionPayload;

    for (const limiter of this.rateLimiters.values()) limiter.clear(client);
    this.adapter.onLeave(this.session, auth, client);

    const member = this.members.find((m) => m.userId === auth.userId);
    if (!member) return;
    member.connections -= 1;
    if (member.connections > 0) return;

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
