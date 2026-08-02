import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { GameId } from '../services/activity/gameId';
import { verifyWsSessionToken } from '../services/activity/wsSessionToken';

export interface ActivityMessage {
  type: string;
  payload?: unknown;
}

interface ClientIdentity {
  instanceId: string;
  userId: string;
  guildId: string;
  mode: 'single' | 'multi';
  game: GameId;
}

// Rooms are keyed by instanceId alone at the transport layer's option, but a
// Discord Activity instance can in principle host more than one game at
// once (e.g. two different users in the same voice channel each picking a
// different game from the hub) — so every join/broadcast has to be scoped
// to (instanceId, game), not instanceId alone, or two games would leak
// messages into each other's clients.
export function roomKey(instanceId: string, game: GameId): string {
  return `${instanceId}:${game}`;
}

type MessageHandler = (
  params: ClientIdentity & { message: ActivityMessage },
) => void;
type PresenceHandler = (params: ClientIdentity) => void;
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

    const { userId, instanceId, guildId, mode, game } = session;
    this.joinRoom(roomKey(instanceId, game), ws);
    this.joinHandlers.forEach((handler) =>
      handler({ instanceId, userId, guildId, mode, game, ws }),
    );

    ws.on('message', (raw) => {
      let message: ActivityMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.messageHandlers.forEach((handler) =>
        handler({ instanceId, userId, guildId, mode, game, message }),
      );
    });

    ws.on('close', () => {
      this.leaveRoom(roomKey(instanceId, game), ws);
      this.leaveHandlers.forEach((handler) =>
        handler({ instanceId, userId, guildId, mode, game }),
      );
    });
  }

  private joinRoom(instanceId: string, ws: WebSocket) {
    if (!this.rooms.has(instanceId)) this.rooms.set(instanceId, new Set());
    this.rooms.get(instanceId)!.add(ws);
  }

  private leaveRoom(instanceId: string, ws: WebSocket) {
    const room = this.rooms.get(instanceId);
    if (!room) return;
    room.delete(ws);
    if (room.size === 0) this.rooms.delete(instanceId);
  }

  broadcast(instanceId: string, message: ActivityMessage, exclude?: WebSocket) {
    const room = this.rooms.get(instanceId);
    if (!room) return;
    const data = JSON.stringify(message);
    for (const client of room) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  broadcastBinary(instanceId: string, data: ArrayBuffer, exclude?: WebSocket) {
    const room = this.rooms.get(instanceId);
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

  getRoomSize(instanceId: string): number {
    return this.rooms.get(instanceId)?.size ?? 0;
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
