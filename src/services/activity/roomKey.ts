import type { ActivityMode, GameId } from './gameId';

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
