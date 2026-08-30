import type { GameId } from '../../services/activity/gameId';
import type { GameRoomAdapter } from '../GameRoomAdapter';
import { hangmanAdapter } from './hangmanAdapter';
import { ticTacToeAdapter } from './ticTacToeAdapter';

export const ADAPTER_REGISTRY: Partial<
  Record<GameId, GameRoomAdapter<unknown>>
> = {
  hangman: hangmanAdapter,
  'tic-tac-toe': ticTacToeAdapter,
};
