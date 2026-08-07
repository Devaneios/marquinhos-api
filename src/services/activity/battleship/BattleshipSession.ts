import { GamificationService } from '../../gamification';
import type { PerClientBroadcaster } from '../cards/PerClientBroadcaster';
import type { ActivityMode } from '../gameId';
import { DisconnectGraceTimer } from '../shared/DisconnectGraceTimer';
import {
  BattleshipEngine,
  type BattleshipSide,
  type ShipPlacement,
} from './BattleshipEngine';
import { viewFor } from './masking';

export interface BattleshipSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface BattleshipSessionOptions {
  onSessionEnded?: () => void;
  disconnectGraceMs?: number;
}

interface BattleshipPlayer {
  userId: string;
  side: BattleshipSide;
  connected: boolean;
  connections: Set<unknown>;
}

const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

// Orchestration layer, structurally parallel to PongSession/CardTableSession:
// seats, reconnect grace, gamification recording. Unlike Pong's single public
// broadcast, every state push here is per-player (PerClientBroadcaster),
// because the two masked views (masking.ts's viewFor) are never the same
// payload.
export class BattleshipSession {
  private engine = new BattleshipEngine();
  private players: BattleshipPlayer[] = [];
  private resultRecorded = false;
  private disconnectGrace = new DisconnectGraceTimer<string>();
  private onSessionEnded?: () => void;
  private disconnectGraceMs: number;

  constructor(
    private identity: BattleshipSessionIdentity,
    private broadcaster: PerClientBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    options: BattleshipSessionOptions = {},
  ) {
    this.onSessionEnded = options.onSessionEnded;
    this.disconnectGraceMs =
      options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
  }

  get playerCount(): number {
    return this.players.length;
  }

  addPlayer(userId: string, connection: unknown): BattleshipSide | null {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) this.resumeExisting(existing);
      else this.sendStateTo(existing.userId, existing.side);
      return existing.side;
    }
    if (this.players.length >= 2) return null;
    const side: BattleshipSide = this.players.length === 0 ? 'p1' : 'p2';
    this.players.push({
      userId,
      side,
      connected: true,
      connections: new Set([connection]),
    });
    if (this.players.length === 2) this.broadcastState();
    else this.sendStateTo(userId, side);
    return side;
  }

  private releaseConnection(
    player: BattleshipPlayer,
    connection: unknown,
  ): boolean {
    player.connections.delete(connection);
    return player.connections.size === 0;
  }

  private resumeExisting(player: BattleshipPlayer) {
    player.connected = true;
    this.disconnectGrace.disarm(player.userId);
    this.broadcaster.broadcastPublic({
      type: 'opponent_reconnected',
      payload: { side: player.side },
    });
    this.broadcastState();
  }

  pauseForDisconnect(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    if (!this.releaseConnection(player, connection)) return;

    if (this.identity.mode !== 'multi' || this.engine.getPhase() === 'ended') {
      this.detach(userId);
      return;
    }
    if (!player.connected) return;

    player.connected = false;
    this.broadcaster.broadcastPublic({
      type: 'opponent_disconnected',
      payload: { side: player.side, timeoutMs: this.disconnectGraceMs },
    });
    this.disconnectGrace.arm(userId, this.disconnectGraceMs, () =>
      this.forfeitDisconnected(userId),
    );
  }

  private forfeitDisconnected(userId: string) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player || player.connected) return;
    this.forfeitTo(userId);
    this.removePlayer(userId);
  }

  private detach(userId: string) {
    this.disconnectGrace.disarm(userId);
    this.forfeitTo(userId);
    this.removePlayer(userId);
  }

  private forfeitTo(userId: string) {
    const remaining = this.players.find(
      (p) => p.userId !== userId && p.connected,
    );
    if (!remaining || this.engine.getPhase() === 'ended') return;

    this.engine.forceWinner(remaining.side);
    this.broadcastState();
    if (!this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(remaining.side);
    }
  }

  private removePlayer(userId: string) {
    this.players = this.players.filter((p) => p.userId !== userId);
    if (this.players.length === 0) this.onSessionEnded?.();
  }

  leave(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    if (!this.releaseConnection(player, connection)) return;
    this.detach(userId);
  }

  placeShips(userId: string, placements: ShipPlacement[]) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    const result = this.engine.placeShips(player.side, placements);
    if (!result.ok) {
      this.broadcaster.sendToPlayer(userId, {
        type: 'placement_error',
        payload: { message: result.error },
      });
      return;
    }
    this.broadcastState();
  }

  fire(userId: string, x: number, y: number) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    const result = this.engine.fire(player.side, x, y);
    if (!result.ok) {
      this.broadcaster.sendToPlayer(userId, {
        type: 'fire_error',
        payload: { message: result.error },
      });
      return;
    }

    this.broadcastState();
    if (result.winner && !this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(result.winner);
    }
  }

  private sendStateTo(userId: string, side: BattleshipSide) {
    this.broadcaster.sendToPlayer(userId, {
      type: 'state',
      payload: viewFor(this.engine, side),
    });
  }

  private broadcastState() {
    for (const player of this.players) {
      this.sendStateTo(player.userId, player.side);
    }
  }

  private recordResult(winner: BattleshipSide) {
    if (this.players.length < 2) return;
    this.gamification.recordGameResult({
      sessionId: this.identity.instanceId,
      guildId: this.identity.guildId,
      gameType: 'battleship',
      results: this.players.map((player) => ({
        userId: player.userId,
        position: player.side === winner ? 1 : 2,
      })),
    });
  }
}
