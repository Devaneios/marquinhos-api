import type { ActivityRealtimeServer } from '../../../realtime/ActivityRealtimeServer';
import { WordleService } from '../../wordle';
import { RateLimiter } from '../shared/RateLimiter';

// Named "WordleActivityManager" (not "WordleSession"/"WordleManager") to
// stay unambiguous next to the pre-existing, unrelated bot-command Wordle
// feature in ../../wordle.ts (WordleService, private WordleSession
// interface, /api/wordle). This file is a thin real-time adapter over that
// same service — a player's guesses here and via the bot slash command are
// the same persisted session, not two different games.
//
// Unlike Pong, there is no per-connection game-state object at all: the
// daily word + per-user guesses already live in WordleService (SQLite), so
// there is nothing in memory that could leak between connections or games.
const GUESS_RATE_LIMIT_WINDOW_MS = 1000;
const GUESS_RATE_LIMIT_MAX = 3;

export function wireWordleActivity(realtime: ActivityRealtimeServer) {
  const service = new WordleService();
  const guessRateLimiter = new RateLimiter({
    windowMs: GUESS_RATE_LIMIT_WINDOW_MS,
    max: GUESS_RATE_LIMIT_MAX,
  });

  realtime.registerGame('wordle', {
    onJoin({ userId, guildId, ws }) {
      const daily = service.getDailyWord(guildId);
      const session = service.getUserSession(userId, guildId);
      realtime.send(ws, {
        type: 'init',
        payload: {
          wordLength: daily.word.length,
          guesses: session?.guesses ?? [],
          solved: session?.solved ?? false,
          attempts: session?.attempts ?? 0,
        },
      });
    },

    onMessage({ userId, guildId, message, ws }) {
      if (message.type !== 'guess') return;
      if (guessRateLimiter.isOverLimit(ws)) return;

      const payload = message.payload as { guess?: string };
      const result = service.submitGuess(userId, guildId, payload?.guess ?? '');

      if ('error' in result) {
        realtime.send(ws, {
          type: 'guess_error',
          payload: { message: result.error },
        });
        return;
      }

      realtime.send(ws, { type: 'guess_result', payload: result });
    },

    onLeave({ ws }) {
      guessRateLimiter.clear(ws);
    },
  });
}
