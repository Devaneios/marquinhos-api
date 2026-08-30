import { TicTacToeSession } from '../../services/activity/ticTacToe/TicTacToeSession';
import type { AdapterContext, GameRoomAdapter } from '../GameRoomAdapter';

const MOVE_RATE_LIMIT_WINDOW_MS = 1000;
const MOVE_RATE_LIMIT_MAX = 10;

export const ticTacToeAdapter: GameRoomAdapter<TicTacToeSession> = {
  maxPlayers: 2,
  supportsBot: true,
  supportsQueue: true,

  setup(ctx: AdapterContext) {
    const session = new TicTacToeSession(
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
        move: {
          rateLimit: {
            windowMs: MOVE_RATE_LIMIT_WINDOW_MS,
            max: MOVE_RATE_LIMIT_MAX,
          },
          handle: (auth, client, payload: unknown) => {
            const { row, col } =
              (payload as { row?: number; col?: number }) ?? {};
            const result = session.handleMove(
              auth.userId,
              row ?? -1,
              col ?? -1,
            );
            if (!result.ok)
              client.send('action_rejected', { error: result.error });
          },
        },
        restart: {
          handle: (auth) => session.requestRestart(auth.userId),
        },
      },
    };
  },

  onJoin(session, auth, client, seat) {
    if (seat !== 'player') return;
    const player = session.addPlayer(auth.userId, client);
    client.send('init', { player, state: session.getPublicState() });
    if (!player) return;
    if (auth.mode === 'single') session.enableBot(player);
  },

  onLeave(session, auth, client) {
    session.pauseForDisconnect(auth.userId, client);
  },

  onDispose(session) {
    session.dispose();
  },
};
