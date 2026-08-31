import { cardGameRegistry } from 'services/activity/cards/registry';
import {
  isGameId,
  type ActivityMode,
  type GameId,
} from 'services/activity/gameId';
import type { BotDifficulty } from 'services/activity/pong/PongBotAI';
import { decryptTokenFull, encryptToken } from 'utils/crypto';

const BOT_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;

export interface WsSessionPayload {
  userId: string;
  instanceId: string;
  guildId: string;
  mode: ActivityMode;
  game: GameId;
  difficulty?: BotDifficulty;
  winningScore?: number;
  // Only meaningful (and required) for game:'cards' — selects which
  // pluggable GameDefinition the room loads. The shape of `options` is
  // validated by that GameDefinition's own setup(), not here, so this
  // layer only needs to know "is this a known ruleset id."
  ruleset?: string;
  options?: Record<string, unknown>;
}

const WS_SESSION_TTL_MS = 5 * 60_000;

export function mintWsSessionToken(payload: WsSessionPayload): string {
  const token = encryptToken(
    JSON.stringify(payload),
    Date.now() + WS_SESSION_TTL_MS,
  );
  if (!token) throw new Error('Failed to mint WS session token');
  return token;
}

export function verifyWsSessionToken(token: string): WsSessionPayload | null {
  const decrypted = decryptTokenFull(token);
  if (!decrypted) return null;
  if (decrypted.expiresAt !== undefined && decrypted.expiresAt < Date.now()) {
    return null;
  }
  try {
    const parsed = JSON.parse(decrypted.token);
    const hasValidDifficulty =
      parsed?.difficulty === undefined ||
      BOT_DIFFICULTIES.includes(parsed?.difficulty);
    const hasValidWinningScore =
      parsed?.winningScore === undefined ||
      (typeof parsed?.winningScore === 'number' &&
        Number.isInteger(parsed.winningScore) &&
        parsed.winningScore >= 1 &&
        parsed.winningScore <= 99);
    const hasValidRuleset =
      parsed?.game !== 'cards'
        ? parsed?.ruleset === undefined
        : typeof parsed?.ruleset === 'string' &&
          cardGameRegistry.isKnownRuleset(parsed.ruleset);
    if (
      typeof parsed?.userId === 'string' &&
      typeof parsed?.instanceId === 'string' &&
      typeof parsed?.guildId === 'string' &&
      (parsed?.mode === 'single' ||
        parsed?.mode === 'multi' ||
        parsed?.mode === 'local') &&
      isGameId(parsed?.game) &&
      hasValidDifficulty &&
      hasValidWinningScore &&
      hasValidRuleset
    ) {
      return {
        userId: parsed.userId,
        instanceId: parsed.instanceId,
        guildId: parsed.guildId,
        mode: parsed.mode,
        game: parsed.game,
        ...(parsed.difficulty !== undefined
          ? { difficulty: parsed.difficulty }
          : {}),
        ...(parsed.winningScore !== undefined
          ? { winningScore: parsed.winningScore }
          : {}),
        ...(parsed.ruleset !== undefined ? { ruleset: parsed.ruleset } : {}),
        ...(parsed.options !== undefined ? { options: parsed.options } : {}),
      };
    }
  } catch {
    // malformed payload
  }
  return null;
}
