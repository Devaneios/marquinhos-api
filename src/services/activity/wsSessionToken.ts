import { decryptTokenFull, encryptToken } from '../../utils/crypto';
import { isGameId, type GameId } from './gameId';
import type { BotDifficulty } from './pong/PongBotAI';

const BOT_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;

export interface WsSessionPayload {
  userId: string;
  instanceId: string;
  guildId: string;
  mode: 'single' | 'multi';
  game: GameId;
  difficulty?: BotDifficulty;
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
    if (
      typeof parsed?.userId === 'string' &&
      typeof parsed?.instanceId === 'string' &&
      typeof parsed?.guildId === 'string' &&
      (parsed?.mode === 'single' || parsed?.mode === 'multi') &&
      isGameId(parsed?.game) &&
      hasValidDifficulty
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
      };
    }
  } catch {
    // malformed payload
  }
  return null;
}
