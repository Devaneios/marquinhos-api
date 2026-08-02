import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
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

    const { userId, instanceId, guildId, mode } = session;
    this.joinRoom(instanceId, ws);
    this.joinHandlers.forEach((handler) =>
      handler({ instanceId, userId, guildId, mode, ws }),
    );

    ws.on('message', (raw) => {
      let message: ActivityMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.messageHandlers.forEach((handler) =>
        handler({ instanceId, userId, guildId, mode, message }),
      );
    });

    ws.on('close', () => {
      this.leaveRoom(instanceId, ws);
      this.leaveHandlers.forEach((handler) =>
        handler({ instanceId, userId, guildId, mode }),
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
