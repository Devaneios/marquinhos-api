import { ConnectFourSession } from '../../services/activity/connectFour/ConnectFourSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const MOVE_RATE_LIMIT_WINDOW_MS = 1000;
const MOVE_RATE_LIMIT_MAX = 10;

export const connectFourAdapter: GameRoomAdapter<ConnectFourSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    const session = new ConnectFourSession(
      {
        sessionKey: ctx.roomKey,
        instanceId: ctx.instanceId,
        guildId: ctx.guildId,
        mode: ctx.mode,
      },
      {
        broadcast: (_key, message) =>
          ctx.broadcast(message.type, message.payload),
      },
      undefined,
      { onSessionEnded: ctx.onSessionEnded },
    );

    return {
      session,
      messageHandlers: {
        drop: {
          rateLimit: {
            windowMs: MOVE_RATE_LIMIT_WINDOW_MS,
            max: MOVE_RATE_LIMIT_MAX,
          },
          handle: (auth, client, payload: unknown) => {
            const col = (payload as { col?: number })?.col ?? -1;
            const accepted = session.dropDisc(auth.userId, col);
            if (!accepted) client.send('move_rejected', { col });
          },
        },
        restart: { handle: (auth) => session.requestRestart(auth.userId) },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const disc = session.addPlayer(auth.userId, client);
    client.send('init', { disc, state: session.getPublicState() });
    if (disc && auth.mode === 'single') session.enableBot(disc);
  },
  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },
  onDispose(session) {
    session.dispose();
  },
  getWinnerUserId(session) {
    return session.getWinnerUserId();
  },
  substitutePlayer(session, outgoingUserId, incomingUserId, incomingClient) {
    return session.substitutePlayer(
      outgoingUserId,
      incomingUserId,
      incomingClient,
    );
  },
};
