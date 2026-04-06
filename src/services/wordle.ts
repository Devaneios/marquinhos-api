import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../database/sqlite';

const logger = {
  warn: (...args: unknown[]) => console.warn('[wordle]', ...args),
};

interface WordleDaily {
  guild_id: string;
  word: string;
  word_date: string;
  players_count: number;
  winners_count: number;
  total_attempts: number;
  created_at: number;
}

interface WordleSession {
  id: string;
  user_id: string;
  guild_id: string;
  word_date: string;
  guesses: { guess: string; feedback: LetterFeedback[] }[];
  solved: boolean;
  attempts: number;
  created_at: number;
}

export type LetterFeedback = 'correct' | 'present' | 'absent';

export interface GuessResult {
  guess: string;
  feedback: LetterFeedback[];
  guesses: { guess: string; feedback: LetterFeedback[] }[];
  solved: boolean;
  attempts: number;
  wordLength: number;
}

export interface DailyStats {
  wordDate: string;
  wordLength: number;
  playersCount: number;
  winnersCount: number;
  avgAttempts: number;
}

export interface ForceNewWordResult {
  word: string;
  wordDate: string;
  wordLength: number;
}

// Answer bank: wordlist.txt (used for picking daily words)
const WORDLIST_PATH = join(__dirname, '../../wordlist.txt');
let wordlistCache: string[] | null = null;

function getWordlist(): string[] {
  if (wordlistCache) return wordlistCache;
  const raw = readFileSync(WORDLIST_PATH, 'utf-8');
  wordlistCache = raw
    .split('\n')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
  return wordlistCache;
}

// Validation bank: valid-guesses.txt (pre-built union of wordlist + ICF, 5–12 chars)
const VALID_GUESSES_PATH = join(__dirname, '../../valid-guesses.txt');
let validationSetCache: Set<string> | null = null;

export function getValidationSet(): Set<string> {
  if (validationSetCache) return validationSetCache;
  const raw = readFileSync(VALID_GUESSES_PATH, 'utf-8');
  const words = raw
    .split('\n')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  validationSetCache = new Set(words);
  return validationSetCache;
}

function getRecifeDate(): string {
  // Use Intl to get the correct date in Recife timezone
  const tz = process.env.WORDLE_TIMEZONE ?? 'America/Recife';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date());
  // 'sv-SE' locale gives YYYY-MM-DD format
}

export function computeFeedback(guess: string, word: string): LetterFeedback[] {
  const result: LetterFeedback[] = new Array(guess.length).fill('absent');
  const wordChars = word.split('');
  const guessChars = guess.split('');

  // First pass: exact matches
  for (let i = 0; i < guessChars.length; i++) {
    if (guessChars[i] === wordChars[i]) {
      result[i] = 'correct';
      wordChars[i] = '\0'; // consume
      guessChars[i] = '\0';
    }
  }

  // Second pass: present (wrong position)
  for (let i = 0; i < guessChars.length; i++) {
    if (guessChars[i] === '\0') continue;
    const idx = wordChars.indexOf(guessChars[i]);
    if (idx !== -1) {
      result[i] = 'present';
      wordChars[idx] = '\0'; // consume to handle duplicates
    }
  }

  return result;
}

export class WordleService {
  pickNewWord(guildId: string, wordDate: string): ForceNewWordResult {
    // Load used words into a Set for O(1) lookup
    const usedRows = db
      .query<{ word: string }, []>('SELECT word FROM wordle_used_words')
      .all();
    const usedSet = new Set(usedRows.map((r) => r.word));

    const wordlist = getWordlist();
    // Only pick words of reasonable length for playability
    const MIN_LENGTH = 5;
    const MAX_LENGTH = 6;
    const available = wordlist.filter(
      (w) =>
        !usedSet.has(w) && w.length >= MIN_LENGTH && w.length <= MAX_LENGTH,
    );

    if (available.length === 0) {
      throw new Error('No available words left in the wordlist');
    }

    if (available.length < 50) {
      logger.warn(`Low word pool: only ${available.length} words remaining`);
    }

    // Group by length and pick a length uniformly, then a word within that group.
    // This ensures balanced distribution across word lengths over time.
    const byLength = new Map<number, string[]>();
    for (const w of available) {
      const len = w.length;
      if (!byLength.has(len)) byLength.set(len, []);
      byLength.get(len)!.push(w);
    }
    const lengths = Array.from(byLength.keys());
    const chosenLength = lengths[Math.floor(Math.random() * lengths.length)];
    const pool = byLength.get(chosenLength)!;
    const word = pool[Math.floor(Math.random() * pool.length)];
    const now = Math.floor(Date.now() / 1000);

    // Save to used words
    db.query(
      'INSERT OR REPLACE INTO wordle_used_words (word, used_at) VALUES ($word, $used_at)',
    ).run({ $word: word, $used_at: now });

    // Upsert daily game (overwrite if forcing new word)
    db.query(
      `INSERT OR REPLACE INTO wordle_daily
        (guild_id, word, word_date, players_count, winners_count, total_attempts, created_at)
       VALUES ($guild_id, $word, $word_date, 0, 0, 0, $now)`,
    ).run({ $guild_id: guildId, $word: word, $word_date: wordDate, $now: now });

    return { word, wordDate, wordLength: word.length };
  }

  getDailyWord(guildId: string): WordleDaily {
    const today = getRecifeDate();
    const row = db
      .query<
        WordleDaily,
        { $guild_id: string }
      >('SELECT * FROM wordle_daily WHERE guild_id = $guild_id')
      .get({ $guild_id: guildId });

    if (!row || row.word_date !== today) {
      // Lazy init: pick a new word for today
      this.pickNewWord(guildId, today);
      return db
        .query<
          WordleDaily,
          { $guild_id: string }
        >('SELECT * FROM wordle_daily WHERE guild_id = $guild_id')
        .get({ $guild_id: guildId })!;
    }

    return row;
  }

  submitGuess(
    userId: string,
    guildId: string,
    guess: string,
  ): GuessResult | { error: string } {
    const normalizedGuess = guess.trim().toLowerCase();

    // Validate word exists in the validation bank
    if (!getValidationSet().has(normalizedGuess)) {
      return { error: 'Palavra não encontrada na lista de palavras válidas.' };
    }

    const daily = this.getDailyWord(guildId);

    // Validate length matches today's word
    if (normalizedGuess.length !== daily.word.length) {
      return {
        error: `A palavra de hoje tem ${daily.word.length} letras. Sua tentativa tem ${normalizedGuess.length}.`,
      };
    }

    const today = getRecifeDate();
    const now = Math.floor(Date.now() / 1000);

    // Get or create session
    let sessionRow = db
      .query<
        { id: string; guesses: string; solved: number; attempts: number },
        { $user_id: string; $guild_id: string; $word_date: string }
      >('SELECT id, guesses, solved, attempts FROM wordle_sessions WHERE user_id = $user_id AND guild_id = $guild_id AND word_date = $word_date')
      .get({ $user_id: userId, $guild_id: guildId, $word_date: today });

    if (!sessionRow) {
      const id = randomUUID();
      db.query(
        `INSERT INTO wordle_sessions (id, user_id, guild_id, word_date, guesses, solved, attempts, word_length, created_at)
         VALUES ($id, $user_id, $guild_id, $word_date, '[]', 0, 0, $word_length, $now)`,
      ).run({
        $id: id,
        $user_id: userId,
        $guild_id: guildId,
        $word_date: today,
        $word_length: daily.word.length,
        $now: now,
      });
      sessionRow = { id, guesses: '[]', solved: 0, attempts: 0 };
    }

    if (sessionRow.solved) {
      return { error: 'Você já acertou a palavra de hoje!' };
    }

    const previousGuesses: { guess: string; feedback: LetterFeedback[] }[] =
      JSON.parse(sessionRow.guesses);

    if (previousGuesses.some((g) => g.guess === normalizedGuess)) {
      return { error: 'Você já tentou essa palavra.' };
    }

    const feedback = computeFeedback(normalizedGuess, daily.word);
    const solved = normalizedGuess === daily.word;
    const newGuesses = [
      ...previousGuesses,
      { guess: normalizedGuess, feedback },
    ];
    const newAttempts = sessionRow.attempts + 1;

    // Update session
    db.query(
      `UPDATE wordle_sessions SET guesses = $guesses, solved = $solved, attempts = $attempts
       WHERE id = $id`,
    ).run({
      $guesses: JSON.stringify(newGuesses),
      $solved: solved ? 1 : 0,
      $attempts: newAttempts,
      $id: sessionRow.id,
    });

    // Update daily stats.
    // players_count is incremented exactly once per user per day: on their first guess,
    // regardless of whether that guess solves the puzzle. The previous CASE WHEN expression
    // caused a bug where a user who solved on a later guess never incremented players_count
    // (previousGuesses.length > 0 → $is_new_player = 0).
    if (previousGuesses.length === 0) {
      // First guess of the day for this user
      if (solved) {
        db.query(
          `UPDATE wordle_daily SET
            players_count = players_count + 1,
            winners_count = winners_count + 1,
            total_attempts = total_attempts + $attempts
           WHERE guild_id = $guild_id`,
        ).run({
          $attempts: newAttempts,
          $guild_id: guildId,
        });
      } else {
        db.query(
          'UPDATE wordle_daily SET players_count = players_count + 1 WHERE guild_id = $guild_id',
        ).run({ $guild_id: guildId });
      }
    } else if (solved) {
      // Returning player (already counted) who now solved
      db.query(
        `UPDATE wordle_daily SET
          winners_count = winners_count + 1,
          total_attempts = total_attempts + $attempts
         WHERE guild_id = $guild_id`,
      ).run({
        $attempts: newAttempts,
        $guild_id: guildId,
      });
    }

    return {
      guess: normalizedGuess,
      feedback,
      guesses: newGuesses,
      solved,
      attempts: newAttempts,
      wordLength: daily.word.length,
    };
  }

  getUserSession(userId: string, guildId: string): WordleSession | null {
    const today = getRecifeDate();
    const row = db
      .query<
        {
          id: string;
          guesses: string;
          solved: number;
          attempts: number;
          created_at: number;
        },
        { $user_id: string; $guild_id: string; $word_date: string }
      >(
        'SELECT id, guesses, solved, attempts, created_at FROM wordle_sessions WHERE user_id = $user_id AND guild_id = $guild_id AND word_date = $word_date',
      )
      .get({ $user_id: userId, $guild_id: guildId, $word_date: today });

    if (!row) return null;

    return {
      id: row.id,
      user_id: userId,
      guild_id: guildId,
      word_date: today,
      guesses: JSON.parse(row.guesses),
      solved: row.solved === 1,
      attempts: row.attempts,
      created_at: row.created_at,
    };
  }

  validateGuess(
    guildId: string,
    guess: string,
  ): { valid: boolean; wordLength: number; message: string } {
    const normalized = guess.trim().toLowerCase();
    const daily = this.getDailyWord(guildId);

    if (normalized.length !== daily.word.length) {
      return {
        valid: false,
        wordLength: daily.word.length,
        message: `A palavra de hoje tem ${daily.word.length} letras (você digitou ${normalized.length})`,
      };
    }

    const inWordBank = getValidationSet().has(normalized);
    return {
      valid: inWordBank,
      wordLength: daily.word.length,
      message: inWordBank
        ? `"${normalized}" é uma palavra válida`
        : `"${normalized}" não está na lista de palavras válidas`,
    };
  }

  getDailyStats(guildId: string): DailyStats {
    const daily = this.getDailyWord(guildId);
    const avgAttempts =
      daily.winners_count > 0
        ? Math.round((daily.total_attempts / daily.winners_count) * 10) / 10
        : 0;

    return {
      wordDate: daily.word_date,
      wordLength: daily.word.length,
      playersCount: daily.players_count,
      winnersCount: daily.winners_count,
      avgAttempts,
    };
  }

  getLeaderboard(
    guildId: string,
    limit = 10,
  ): { userId: string; totalDays: number; avgScore: number }[] {
    return db
      .query<
        { user_id: string; total_days: number; avg_score: number },
        { $guild_id: string; $limit: number }
      >(
        `SELECT
           p.user_id,
           COUNT(d.word_date) AS total_days,
           ROUND(
             CAST(SUM(COALESCE(s.attempts, d.word_length + 1)) AS REAL) / COUNT(d.word_date),
             2
           ) AS avg_score
         FROM (
           SELECT DISTINCT user_id FROM wordle_sessions WHERE guild_id = $guild_id
         ) p
         CROSS JOIN (
           SELECT DISTINCT word_date, word_length
           FROM wordle_sessions
           WHERE guild_id = $guild_id AND word_length > 0
         ) d
         LEFT JOIN wordle_sessions s
           ON s.user_id = p.user_id
           AND s.guild_id = $guild_id
           AND s.word_date = d.word_date
         GROUP BY p.user_id
         ORDER BY avg_score ASC
         LIMIT $limit`,
      )
      .all({ $guild_id: guildId, $limit: limit })
      .map((row) => ({
        userId: row.user_id,
        totalDays: row.total_days,
        avgScore: row.avg_score,
      }));
  }

  forceNewWord(guildId: string): ForceNewWordResult {
    const today = getRecifeDate();
    const result = this.pickNewWord(guildId, today);
    // Clear all player sessions for today so everyone can play the new word
    db.query(
      'DELETE FROM wordle_sessions WHERE guild_id = $guild_id AND word_date = $word_date',
    ).run({ $guild_id: guildId, $word_date: today });
    return result;
  }

  setConfig(guildId: string, channelId: string): void {
    const now = Math.floor(Date.now() / 1000);
    db.query(
      `INSERT OR REPLACE INTO wordle_config (guild_id, channel_id, updated_at)
       VALUES ($guild_id, $channel_id, $now)`,
    ).run({ $guild_id: guildId, $channel_id: channelId, $now: now });
  }

  getConfig(guildId: string): { channelId: string } | null {
    const row = db
      .query<
        { channel_id: string },
        { $guild_id: string }
      >('SELECT channel_id FROM wordle_config WHERE guild_id = $guild_id')
      .get({ $guild_id: guildId });

    return row ? { channelId: row.channel_id } : null;
  }

  getAllConfiguredGuilds(): { guildId: string; channelId: string }[] {
    return db
      .query<{ guild_id: string; channel_id: string }, []>(
        'SELECT guild_id, channel_id FROM wordle_config',
      )
      .all()
      .map((r) => ({ guildId: r.guild_id, channelId: r.channel_id }));
  }
}
