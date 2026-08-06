import type { ActivityMode, GameId } from './gameId';

export interface ActivityScope {
  instanceId: string;
  game: GameId;
  mode: ActivityMode;
  userId: string;
  // Only meaningful for games that host more than one pluggable ruleset
  // (cards). Appended when present so two people in the same Activity
  // instance choosing different rulesets never collide on room key; absent
  // for every other caller, so this is purely additive.
  ruleset?: string;
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
  ruleset,
}: ActivityScope): string {
  const base =
    mode === 'multi'
      ? `${instanceId}:${game}:multi`
      : `${instanceId}:${game}:${mode}:${userId}`;
  return ruleset ? `${base}:${ruleset}` : base;
}
