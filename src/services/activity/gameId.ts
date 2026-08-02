export type GameId = 'pong';

export function isGameId(value: unknown): value is GameId {
  return value === 'pong';
}
