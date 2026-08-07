import { Room, type Client } from 'colyseus';
import { WordleRaceSession } from '../services/activity/wordle-race/WordleRaceSession';
import { roomKey } from '../services/activity/roomKey';
import { RateLimiter } from '../services/activity/shared/RateLimiter';
import {
  verifyWsSessionToken,
  type WsSessionPayload,
} from '../services/activity/wsSessionToken';

const GUESS_RATE_LIMIT_WINDOW_MS = 1000;
const GUESS_RATE_LIMIT_MAX = 3;

export class WordleRaceRoom extends Room {
  private session!: WordleRaceSession;
  private guessRateLimiter = new RateLimiter({
    windowMs: GUESS_RATE_LIMIT_WINDOW_MS,
    max: GUESS_RATE_LIMIT_MAX,
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
    this.setMetadata({ roomKey: options.roomKey });

    const initialSession = options.token
      ? verifyWsSessionToken(options.token)
      : null;

    const broadcaster = {
      broadcast: (_key: string, message: { type: string; payload?: unknown }) => {
        this.broadcast(message.type, message.payload);
      },
    };

    this.session = new WordleRaceSession(
      {
        sessionKey: options.roomKey,
        instanceId: initialSession?.instanceId ?? '',
        guildId: initialSession?.guildId ?? '',
        mode: initialSession?.mode ?? 'multi',
      },
      broadcaster,
      undefined,
      { onSessionEnded: () => this.disconnect() },
    );

    this.onMessage('guess', (client, payload: { guess?: string }) => {
      if (this.guessRateLimiter.isOverLimit(client)) return;
      const auth = client.auth as WsSessionPayload;
      this.session.submitGuess(auth.userId, payload?.guess ?? '');
    });

    this.onMessage('leave', (client) => {
      const auth = client.auth as WsSessionPayload;
      this.session.leave(auth.userId, client);
    });
  }

  override onJoin(client: Client, _options: unknown, auth: WsSessionPayload) {
    this.session.addPlayer(auth.userId, client);
    const gameState = this.session.getGameState();
    client.send('init', gameState);
  }

  override onLeave(client: Client) {
    this.guessRateLimiter.clear(client);
    const auth = client.auth as WsSessionPayload;
    this.session.leave(auth.userId, client);
  }
}
