import type { ActivityRealtimeServer } from '../../../realtime/ActivityRealtimeServer';
import { PongSession, type PongSessionIdentity } from './PongSession';

export function wirePongActivity(realtime: ActivityRealtimeServer) {
  // Keyed by the transport's sessionKey, never by instanceId — that key is
  // what scopes a match to (instance, game, mode, and user for the private
  // modes), so a CPU game can't land on the multiplayer match the user just
  // walked out of.
  const sessions = new Map<string, PongSession>();

  function getOrCreateSession(
    identity: PongSessionIdentity,
    winningScore?: number,
  ): PongSession {
    let session = sessions.get(identity.sessionKey);
    if (!session) {
      session = new PongSession(
        identity,
        realtime,
        undefined,
        winningScore !== undefined ? { winningScore } : undefined,
        {
          onSessionEnded: () => sessions.delete(identity.sessionKey),
        },
      );
      sessions.set(identity.sessionKey, session);
    }
    return session;
  }

  realtime.onJoin(
    ({
      instanceId,
      guildId,
      userId,
      mode,
      game,
      difficulty,
      winningScore,
      sessionKey,
      ws,
    }) => {
      if (game !== 'pong') return;
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
  );

  realtime.onMessage(({ sessionKey, userId, message, game, ws }) => {
    if (game !== 'pong') return;
    const session = sessions.get(sessionKey);
    if (!session) return;

    if (message.type === 'input') {
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
  });

  // A raw WebSocket close without a preceding `leave` message means the
  // player didn't intend to quit — pause the match and give them a grace
  // period to reconnect instead of tearing the session down immediately.
  realtime.onLeave(({ sessionKey, userId, game, ws }) => {
    if (game !== 'pong') return;
    const session = sessions.get(sessionKey);
    if (!session) return;
    session.pauseForDisconnect(userId, ws);
  });
}
