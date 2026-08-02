import type { ActivityRealtimeServer } from '../../../realtime/ActivityRealtimeServer';
import { PongSession } from './PongSession';

export function wirePongActivity(realtime: ActivityRealtimeServer) {
  const sessions = new Map<string, PongSession>();

  function getOrCreateSession(
    instanceId: string,
    guildId: string,
  ): PongSession {
    let session = sessions.get(instanceId);
    if (!session) {
      session = new PongSession(
        instanceId,
        guildId,
        realtime,
        undefined,
        undefined,
        {
          onSessionEnded: () => sessions.delete(instanceId),
        },
      );
      sessions.set(instanceId, session);
    }
    return session;
  }

  realtime.onJoin(({ instanceId, guildId, userId, mode, game, ws }) => {
    if (game !== 'pong') return;
    const session = getOrCreateSession(instanceId, guildId);
    const side = session.addPlayer(userId);
    if (side) {
      realtime.send(ws, {
        type: 'init',
        payload: { side, config: session.getPublicConfig() },
      });
    }
    if (mode === 'single') {
      session.enableBot(side ?? undefined);
      if (side) session.start();
    } else if (side && session.playerCount === 2) {
      session.start();
    }
  });

  realtime.onMessage(({ instanceId, userId, message, game }) => {
    if (game !== 'pong') return;
    const session = sessions.get(instanceId);
    if (!session) return;

    if (message.type === 'input') {
      const payload = message.payload as {
        direction?: -1 | 0 | 1;
        seq?: number;
      };
      session.handleInput(userId, payload?.direction ?? 0, payload?.seq ?? 0);
    } else if (message.type === 'restart') {
      session.requestRestart(userId);
    } else if (message.type === 'leave') {
      session.leave(userId);
    }
  });

  // A raw WebSocket close without a preceding `leave` message means the
  // player didn't intend to quit — pause the match and give them a grace
  // period to reconnect instead of tearing the session down immediately.
  realtime.onLeave(({ instanceId, userId, game }) => {
    if (game !== 'pong') return;
    const session = sessions.get(instanceId);
    if (!session) return;
    session.pauseForDisconnect(userId);
  });
}
