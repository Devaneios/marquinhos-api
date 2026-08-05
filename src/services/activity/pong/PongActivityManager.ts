import type { ActivityRealtimeServer } from '../../../realtime/ActivityRealtimeServer';
import { RateLimiter } from '../shared/RateLimiter';
import { SessionRegistry } from '../shared/SessionRegistry';
import { PongSession, type PongSessionIdentity } from './PongSession';

const INPUT_RATE_LIMIT_WINDOW_MS = 1000;
const INPUT_RATE_LIMIT_MAX = 120;

export function wirePongActivity(realtime: ActivityRealtimeServer) {
  const inputRateLimiter = new RateLimiter({
    windowMs: INPUT_RATE_LIMIT_WINDOW_MS,
    max: INPUT_RATE_LIMIT_MAX,
  });

  // Keyed by the transport's sessionKey, never by instanceId — that key is
  // what scopes a match to (instance, game, mode, and user for the private
  // modes), so a CPU game can't land on the multiplayer match the user just
  // walked out of.
  const sessions = new SessionRegistry<PongSession>();

  function getOrCreateSession(
    identity: PongSessionIdentity,
    winningScore?: number,
  ): PongSession {
    return sessions.getOrCreate(
      identity.sessionKey,
      () =>
        new PongSession(
          identity,
          realtime,
          undefined,
          winningScore !== undefined ? { winningScore } : undefined,
          {
            onSessionEnded: () => sessions.delete(identity.sessionKey),
          },
        ),
    );
  }

  realtime.registerGame('pong', {
    onJoin({
      instanceId,
      guildId,
      userId,
      mode,
      difficulty,
      winningScore,
      sessionKey,
      ws,
    }) {
      const session = getOrCreateSession(
        { sessionKey, instanceId, guildId, mode },
        winningScore,
      );
      // A null side means the match already has its two players: this
      // connection joins as a read-only spectator. It still shares the room
      // so it receives snapshots, but it must not start or reconfigure the
      // match it is watching.
      const side = session.addPlayer(userId, ws);
      realtime.send(ws, {
        type: 'init',
        payload: { side, config: session.getPublicConfig() },
      });
      if (!side) return;

      if (mode === 'single') {
        session.enableBot(side, difficulty);
        session.start();
      } else if (mode === 'local') {
        session.enableLocalTwoPlayer();
        session.start();
      } else if (session.playerCount === 2) {
        session.start();
      }
    },

    onMessage({ sessionKey, userId, message, ws }) {
      const session = sessions.get(sessionKey);
      if (!session) return;

      if (message.type === 'input') {
        if (inputRateLimiter.isOverLimit(ws)) return;
        const payload = message.payload as {
          direction?: -1 | 0 | 1;
          seq?: number;
          side?: 'left' | 'right';
        };
        session.handleInput(
          userId,
          payload?.direction ?? 0,
          payload?.seq ?? 0,
          payload?.side,
        );
      } else if (message.type === 'restart') {
        session.requestRestart(userId);
      } else if (message.type === 'leave') {
        session.leave(userId, ws);
      }
    },

    // A raw WebSocket close without a preceding `leave` message means the
    // player didn't intend to quit — pause the match and give them a grace
    // period to reconnect instead of tearing the session down immediately.
    onLeave({ sessionKey, userId, ws }) {
      inputRateLimiter.clear(ws);
      const session = sessions.get(sessionKey);
      if (!session) return;
      session.pauseForDisconnect(userId, ws);
    },
  });
}
