import type { ActivityRealtimeServer } from '../../../realtime/ActivityRealtimeServer';
import { PongSession } from './PongSession';

export function wirePongActivity(realtime: ActivityRealtimeServer) {
  const sessions = new Map<string, PongSession>();

  realtime.onJoin(({ instanceId, guildId, userId, mode, ws }) => {
    let session = sessions.get(instanceId);
    if (!session) {
      session = new PongSession(instanceId, guildId, realtime);
      sessions.set(instanceId, session);
    }
    const side = session.addPlayer(userId);
    if (side) {
      realtime.send(ws, {
        type: 'init',
        payload: { side, config: session.getPublicConfig() },
      });
    }
    if (mode === 'single') {
      session.enableBot();
      if (side) session.start();
    } else if (side && session.playerCount === 2) {
      session.start();
    }
  });

  realtime.onMessage(({ instanceId, userId, message }) => {
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
    }
  });

  realtime.onLeave(({ instanceId, userId }) => {
    const session = sessions.get(instanceId);
    if (!session) return;
    session.removePlayer(userId);
    if (session.playerCount === 0) {
      session.stop();
      sessions.delete(instanceId);
    }
  });
}
