import { GamificationService } from '../../gamification';
import type { ActivityMode } from '../gameId';
import { DisconnectGraceTimer } from '../shared/DisconnectGraceTimer';
import { TicTacToeEngine, type Player } from './TicTacToeEngine';

export interface ActivityBroadcaster {
  broadcast(key: string, message: { type: string; payload?: unknown }): void;
}

interface TicTacToePlayer {
  userId: string;
  player: Player;
  connected: boolean;
  connections: Set<unknown>;
}

export interface TicTacToeSessionIdentity {
  sessionKey: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
}

export interface TicTacToeSessionOptions {
  onSessionEnded?: () => void;
  disconnectGraceMs?: number;
}

const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

export class TicTacToeSession {
  private engine: TicTacToeEngine;
  private players: TicTacToePlayer[] = [];
  private resultRecorded = false;
  private restartVotes = new Set<string>();
  private disconnectGrace = new DisconnectGraceTimer<string>();
  private onSessionEnded?: () => void;
  private disconnectGraceMs: number;

  constructor(
    private identity: TicTacToeSessionIdentity,
    private broadcaster: ActivityBroadcaster,
    private gamification: GamificationService = new GamificationService(),
    options: TicTacToeSessionOptions = {},
  ) {
    this.engine = new TicTacToeEngine();
    this.onSessionEnded = options.onSessionEnded;
    this.disconnectGraceMs =
      options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
  }

  get playerCount(): number {
    return this.players.length;
  }

  private get roomKey(): string {
    return this.identity.sessionKey;
  }

  addPlayer(userId: string, connection: unknown): Player | null {
    const existing = this.players.find((p) => p.userId === userId);
    if (existing) {
      existing.connections.add(connection);
      if (!existing.connected) this.resumeExisting(existing);
      return existing.player;
    }
    if (this.players.length >= 2) return null;
    const player: Player = this.players.length === 0 ? 'X' : 'O';
    this.players.push({
      userId,
      player,
      connected: true,
      connections: new Set([connection]),
    });
    return player;
  }

  private releaseConnection(player: TicTacToePlayer, connection: unknown): boolean {
    player.connections.delete(connection);
    return player.connections.size === 0;
  }

  private resumeExisting(player: TicTacToePlayer) {
    player.connected = true;
    this.disconnectGrace.disarm(player.userId);
    this.broadcaster.broadcast(this.roomKey, {
      type: 'opponent_reconnected',
      payload: { player: player.player },
    });
  }

  pauseForDisconnect(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    if (!this.releaseConnection(player, connection)) return;

    const state = this.engine.getState();
    if (this.identity.mode !== 'multi' || state.winner || state.isDraw) {
      this.detach(userId);
      return;
    }
    if (!player.connected) return;

    player.connected = false;
    this.broadcaster.broadcast(this.roomKey, {
      type: 'opponent_disconnected',
      payload: { player: player.player, timeoutMs: this.disconnectGraceMs },
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
    if (!remaining) return;

    const state = this.engine.getState();
    if (state.winner || state.isDraw) return;

    const winner = remaining.player;
    this.engine.makeMove(-1, -1, winner);
    const updatedState = this.broadcastState();
    if (!this.resultRecorded) {
      this.resultRecorded = true;
      this.recordResult(updatedState.winner!);
    }
  }

  private removePlayer(userId: string) {
    this.players = this.players.filter((p) => p.userId !== userId);
    this.restartVotes.delete(userId);
    if (this.players.length === 0) this.onSessionEnded?.();
  }

  leave(userId: string, connection: unknown) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;
    if (!this.releaseConnection(player, connection)) return;

    this.detach(userId);
  }

  handleMove(userId: string, row: number, col: number) {
    const player = this.players.find((p) => p.userId === userId);
    if (!player) return;

    const state = this.engine.getState();
    const result = this.engine.makeMove(row, col, state.currentPlayer);

    if (!result.success) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'move_error',
        payload: { error: result.error },
      });
      return;
    }

    const updatedState = this.broadcastState();

    if (updatedState.winner || updatedState.isDraw) {
      if (!this.resultRecorded) {
        this.resultRecorded = true;
        if (updatedState.winner) {
          this.recordResult(updatedState.winner);
        }
      }
    }
  }

  private broadcastState() {
    const state = this.engine.getState();
    this.broadcaster.broadcast(this.roomKey, {
      type: 'state_update',
      payload: {
        board: state.board,
        currentPlayer: state.currentPlayer,
        winner: state.winner,
        isDraw: state.isDraw,
        moveCount: state.moveCount,
      },
    });
    return state;
  }

  requestRestart(userId: string) {
    const state = this.engine.getState();
    if (!state.winner && !state.isDraw) return;
    if (!this.players.some((p) => p.userId === userId)) return;

    this.restartVotes.add(userId);
    const required = this.players.length;

    if (this.restartVotes.size < required) {
      this.broadcaster.broadcast(this.roomKey, {
        type: 'restart_status',
        payload: { votes: this.restartVotes.size, required },
      });
      return;
    }

    this.restartVotes.clear();
    this.resultRecorded = false;
    this.engine.reset();
    this.broadcastState();
  }

  getPublicState() {
    const state = this.engine.getState();
    return {
      board: state.board,
      currentPlayer: state.currentPlayer,
      winner: state.winner,
      isDraw: state.isDraw,
      moveCount: state.moveCount,
    };
  }

  private recordResult(winner: Player) {
    if (this.players.length < 2) return;
    const winnerPlayer = this.players.find((p) => p.player === winner);
    this.gamification.recordGameResult({
      sessionId: this.identity.instanceId,
      guildId: this.identity.guildId,
      gameType: 'tic-tac-toe',
      results: this.players.map((player) => ({
        userId: player.userId,
        position: player.player === winner ? 1 : 2,
      })),
    });
  }
}
