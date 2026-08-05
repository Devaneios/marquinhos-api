import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ActivityMode, GameId } from '../services/activity/gameId';
import type { BotDifficulty } from '../services/activity/pong/PongBotAI';
import { verifyWsSessionToken } from '../services/activity/wsSessionToken';

const HEARTBEAT_INTERVAL_MS = 25_000;
const BACKPRESSURE_HIGH_WATER_BYTES = 64 * 1024;

interface HeartbeatWebSocket extends WebSocket {
  isAlive?: boolean;
}

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

export interface GameHandlers {
  onJoin?: JoinHandler;
  onMessage?: MessageHandler;
  onLeave?: PresenceHandler;
}

export class ActivityRealtimeServer {
  private wss: WebSocketServer;
  private rooms = new Map<string, Set<WebSocket>>();
  // Keyed by GameId: a connection's messages/join/leave are only ever
  // dispatched to the entry matching its own (server-verified) identity.game,
  // never to every registered game. This makes cross-game delivery
  // structurally impossible instead of relying on every handler
  // self-guarding with `if (game !== 'x') return;`.
  private gameHandlers = new Map<GameId, GameHandlers>();
  private heartbeatTimer: ReturnType<typeof setInterval>;

  constructor(
    options: { server?: HttpServer; port?: number; path?: string } = {},
  ) {
    this.wss = new WebSocketServer({
      server: options.server,
      port: options.server ? undefined : options.port,
      path: options.path ?? '/ws/activity',
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    this.heartbeatTimer = setInterval(() => {
      for (const client of this.wss.clients as Set<HeartbeatWebSocket>) {
        if (client.isAlive === false) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
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

  private handleConnection(
    ws: HeartbeatWebSocket,
    req: import('http').IncomingMessage,
  ) {
    // With an 8ms server tick, Nagle's algorithm can add tens of ms of
    // avoidable latency to the small, frequent input/ack messages.
    req.socket.setNoDelay(true);

    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    const session = verifyWsSessionToken(token);
    if (!session) {
      ws.close(4001, 'Invalid or expired session token');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

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
    this.gameHandlers.get(game)?.onJoin?.({ ...identity, ws });

    ws.on('message', (raw) => {
      let message: ActivityMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.gameHandlers.get(game)?.onMessage?.({ ...identity, ws, message });
    });

    ws.on('close', () => {
      this.leaveRoom(sessionKey, ws);
      this.gameHandlers.get(game)?.onLeave?.({ ...identity, ws });
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
      if (
        client !== exclude &&
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < BACKPRESSURE_HIGH_WATER_BYTES
      ) {
        client.send(data);
      }
    }
  }

  broadcastBinary(key: string, data: ArrayBuffer, exclude?: WebSocket) {
    const room = this.rooms.get(key);
    if (!room) return;
    for (const client of room) {
      if (
        client !== exclude &&
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < BACKPRESSURE_HIGH_WATER_BYTES
      ) {
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

  // Each GameId may register exactly once, at boot. Registering twice would
  // silently mean only the last registration's handlers ever run, so it's
  // rejected outright rather than left as a foot-gun.
  registerGame(game: GameId, handlers: GameHandlers) {
    if (this.gameHandlers.has(game)) {
      throw new Error(`Game "${game}" is already registered`);
    }
    this.gameHandlers.set(game, handlers);
  }

  close(): Promise<void> {
    clearInterval(this.heartbeatTimer);
    return new Promise((resolve, reject) => {
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
