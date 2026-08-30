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

    const { session, messageHandlers } = this.adapter.setup(ctx);
    this.session = session;
    this.rateLimiters.clear();

    for (const [type, { rateLimit, handle }] of Object.entries(
      messageHandlers,
    )) {
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
