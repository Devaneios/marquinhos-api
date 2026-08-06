export type GameId = 'pong' | 'wordle' | 'cards';

// 'multi' is the only mode where two connections share one match; 'single'
// (vs. the bot) and 'local' (hot-seat on one keyboard) are private to the
// user who opened them, which is what scopes their session key.
export type ActivityMode = 'single' | 'multi' | 'local';

export function isGameId(value: unknown): value is GameId {
  return value === 'pong' || value === 'wordle' || value === 'cards';
}
