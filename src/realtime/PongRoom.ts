import { Room, type Client } from 'colyseus';
import type { PaddleSide } from 'services/activity/pong/PongEngine';
import type { ActivityBroadcaster } from 'services/activity/pong/PongSession';
import { PongSession } from 'services/activity/pong/PongSession';
import { roomKey } from 'services/activity/roomKey';
import { RateLimiter } from 'services/activity/shared/RateLimiter';
import {
  verifyWsSessionToken,
  type WsSessionPayload,
} from 'services/activity/wsSessionToken';

const INPUT_RATE_LIMIT_WINDOW_MS = 1000;
const INPUT_RATE_LIMIT_MAX = 120;

export class PongRoom extends Room {
  private session!: PongSession;
  private inputRateLimiter = new RateLimiter({
    windowMs: INPUT_RATE_LIMIT_WINDOW_MS,
    max: INPUT_RATE_LIMIT_MAX,
  });

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

  override onCreate(options: { roomKey: string; token?: string }) {
    void this.setMetadata({ roomKey: options.roomKey });

    // `onCreate` receives the same join options the first client passed to
    // `joinOrCreate` — before that client's own `onAuth` has run. Decoding
    // the token here too (rather than waiting for `onJoin`) lets the session
    // carry its real instanceId/guildId from the start, instead of mutating
    // it later.
    const initialSession = options.token
      ? verifyWsSessionToken(options.token)
      : null;

    // PongSession only depends on this abstract interface, never on
    // ActivityRealtimeServer directly, so it's reused untouched here — this
    // adapter just forwards its broadcast calls onto the Room itself.
    const broadcaster: ActivityBroadcaster = {
      broadcast: (_key, message) => {
        this.broadcast(message.type, message.payload);
      },
      broadcastBinary: (_key, data) => {
        this.broadcastBytes('state', new Uint8Array(data), {});
      },
    };

    this.session = new PongSession(
      {
        sessionKey: options.roomKey,
        instanceId: initialSession?.instanceId ?? '',
        guildId: initialSession?.guildId ?? '',
        mode: initialSession?.mode ?? 'multi',
      },
      broadcaster,
      undefined,
      initialSession?.winningScore !== undefined
        ? { winningScore: initialSession.winningScore }
        : undefined,
      { onSessionEnded: () => this.disconnect() },
    );

    this.onMessage(
      'input',
      (
        client,
        payload: { direction?: -1 | 0 | 1; seq?: number; side?: PaddleSide },
      ) => {
        if (this.inputRateLimiter.isOverLimit(client)) return;
        const auth = client.auth as WsSessionPayload;
        this.session.handleInput(
          auth.userId,
          payload?.direction ?? 0,
          payload?.seq ?? 0,
          payload?.side,
        );
      },
    );

    this.onMessage('restart', (client) => {
      const auth = client.auth as WsSessionPayload;
      this.session.requestRestart(auth.userId);
    });

    this.onMessage('leave', (client) => {
      const auth = client.auth as WsSessionPayload;
      this.session.leave(auth.userId, client);
    });
  }

  override onJoin(client: Client, _options: unknown, auth: WsSessionPayload) {
    const side = this.session.addPlayer(auth.userId, client);
    client.send('init', { side, config: this.session.getPublicConfig() });
    if (!side) return;

    if (auth.mode === 'single') {
      this.session.enableBot(side, auth.difficulty);
      this.session.start();
    } else if (auth.mode === 'local') {
      this.session.enableLocalTwoPlayer();
      this.session.start();
    } else if (this.session.playerCount === 2) {
      this.session.start();
    }
  }

  override onLeave(client: Client) {
    this.inputRateLimiter.clear(client);
    const auth = client.auth as WsSessionPayload;
    this.session.pauseForDisconnect(auth.userId, client);
  }

  override onDispose() {
    this.session.dispose();
  }
}
