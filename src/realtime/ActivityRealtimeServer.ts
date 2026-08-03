import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ActivityMode, GameId } from '../services/activity/gameId';
import type { BotDifficulty } from '../services/activity/pong/PongBotAI';
import { verifyWsSessionToken } from '../services/activity/wsSessionToken';

export interface ActivityMessage {
  type: string;
  payload?: unknown;
}

interface ClientIdentity {
  instanceId: string;
  userId: string;
  guildId: string;
  mode: ActivityMode;
  game: GameId;
  difficulty?: BotDifficulty;
  winningScore?: number;
  sessionKey: string;
}

export interface ActivityScope {
  instanceId: string;
  game: GameId;
  mode: ActivityMode;
  userId: string;
}

// A Discord Activity instanceId is constant for the whole lifetime of the
// activity, so it can't identify a session on its own. The room key is what
// decides who shares state with whom, and it has to encode every axis of
// isolation:
//   - game, because one instance can host more than one game from the hub;
//   - mode, because a CPU or hot-seat game must never touch the shared match;
//   - userId for the private modes, because two people in the same voice
//     channel each playing the CPU are playing two different games.
// Only 'multi' deliberately omits userId — sharing one match per instance is
// the whole point of it.
export function roomKey({
  instanceId,
  game,
  mode,
  userId,
}: ActivityScope): string {
  return mode === 'multi'
    ? `${instanceId}:${game}:multi`
    : `${instanceId}:${game}:${mode}:${userId}`;
}

// Every handler receives the originating socket: a user can legitimately hold
// more than one connection to the same session at once (a reconnect racing a
// stale socket, React remounting a component), and a goodbye from one of them
// must not be mistaken for the user themselves leaving.
type MessageHandler = (
  params: ClientIdentity & { ws: WebSocket; message: ActivityMessage },
) => void;
type PresenceHandler = (params: ClientIdentity & { ws: WebSocket }) => void;
type JoinHandler = (params: ClientIdentity & { ws: WebSocket }) => void;

export class ActivityRealtimeServer {
  private wss: WebSocketServer;
  private rooms = new Map<string, Set<WebSocket>>();
  private messageHandlers: MessageHandler[] = [];
  private joinHandlers: JoinHandler[] = [];
  private leaveHandlers: PresenceHandler[] = [];

  constructor(
    options: { server?: HttpServer; port?: number; path?: string } = {},
  ) {
    this.wss = new WebSocketServer({
      server: options.server,
      port: options.server ? undefined : options.port,
      path: options.path ?? '/ws/activity',
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  whenReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss.address()) {
        resolve();
        return;
      }
      this.wss.once('listening', () => resolve());
    });
  }

  get port(): number | null {
    const addr = this.wss.address();
    return addr && typeof addr === 'object' ? addr.port : null;
  }

  private handleConnection(ws: WebSocket, req: import('http').IncomingMessage) {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    const session = verifyWsSessionToken(token);
    if (!session) {
      ws.close(4001, 'Invalid or expired session token');
      return;
    }

    const {
      userId,
      instanceId,
      guildId,
      mode,
      game,
      difficulty,
      winningScore,
    } = session;
    const sessionKey = roomKey({ instanceId, game, mode, userId });
    const identity: ClientIdentity = {
      instanceId,
      userId,
      guildId,
      mode,
      game,
      difficulty,
      winningScore,
      sessionKey,
    };
    this.joinRoom(sessionKey, ws);
    this.joinHandlers.forEach((handler) => handler({ ...identity, ws }));

    ws.on('message', (raw) => {
      let message: ActivityMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.messageHandlers.forEach((handler) =>
        handler({ ...identity, ws, message }),
      );
    });

    ws.on('close', () => {
      this.leaveRoom(sessionKey, ws);
      this.leaveHandlers.forEach((handler) => handler({ ...identity, ws }));
    });
  }

  private joinRoom(key: string, ws: WebSocket) {
    if (!this.rooms.has(key)) this.rooms.set(key, new Set());
    this.rooms.get(key)!.add(ws);
  }

  private leaveRoom(key: string, ws: WebSocket) {
    const room = this.rooms.get(key);
    if (!room) return;
    room.delete(ws);
    if (room.size === 0) this.rooms.delete(key);
  }

  broadcast(key: string, message: ActivityMessage, exclude?: WebSocket) {
    const room = this.rooms.get(key);
    if (!room) return;
    const data = JSON.stringify(message);
    for (const client of room) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  broadcastBinary(key: string, data: ArrayBuffer, exclude?: WebSocket) {
    const room = this.rooms.get(key);
    if (!room) return;
    for (const client of room) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  send(ws: WebSocket, message: ActivityMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  getRoomSize(key: string): number {
    return this.rooms.get(key)?.size ?? 0;
  }

  onJoin(handler: JoinHandler) {
    this.joinHandlers.push(handler);
  }

  onLeave(handler: PresenceHandler) {
    this.leaveHandlers.push(handler);
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
