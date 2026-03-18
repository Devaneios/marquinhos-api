import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { db } from '../database/sqlite';

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

// Load wordlist once at startup — all words, no length filter
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

function getWordlistSet(): Set<string> {
  return new Set(getWordlist());
}

function getRecifeDate(): string {
  // UTC-3 (Recife does not observe DST)
  const now = new Date();
  const recife = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return recife.toISOString().slice(0, 10);
}

function computeFeedback(guess: string, word: string): LetterFeedback[] {
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
    const available = wordlist.filter((w) => !usedSet.has(w));

    if (available.length === 0) {
      throw new Error('No available words left in the wordlist');
    }

    const word = available[Math.floor(Math.random() * available.length)];
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
      .query<WordleDaily, { $guild_id: string }>(
        'SELECT * FROM wordle_daily WHERE guild_id = $guild_id',
      )
      .get({ $guild_id: guildId });

    if (!row || row.word_date !== today) {
      // Lazy init: pick a new word for today
      this.pickNewWord(guildId, today);
      return db
        .query<WordleDaily, { $guild_id: string }>(
          'SELECT * FROM wordle_daily WHERE guild_id = $guild_id',
        )
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

    // Validate word exists in wordlist
    const wordlistSet = getWordlistSet();
    if (!wordlistSet.has(normalizedGuess)) {
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
      >(
        'SELECT id, guesses, solved, attempts FROM wordle_sessions WHERE user_id = $user_id AND guild_id = $guild_id AND word_date = $word_date',
      )
      .get({ $user_id: userId, $guild_id: guildId, $word_date: today });

    if (!sessionRow) {
      const id = randomUUID();
      db.query(
        `INSERT INTO wordle_sessions (id, user_id, guild_id, word_date, guesses, solved, attempts, created_at)
         VALUES ($id, $user_id, $guild_id, $word_date, '[]', 0, 0, $now)`,
      ).run({
        $id: id,
        $user_id: userId,
        $guild_id: guildId,
        $word_date: today,
        $now: now,
      });
      sessionRow = { id, guesses: '[]', solved: 0, attempts: 0 };
    }

    if (sessionRow.solved) {
      return { error: 'Você já acertou a palavra de hoje!' };
    }

    const previousGuesses: { guess: string; feedback: LetterFeedback[] }[] =
      JSON.parse(sessionRow.guesses);
    const feedback = computeFeedback(normalizedGuess, daily.word);
    const solved = normalizedGuess === daily.word;
    const newGuesses = [...previousGuesses, { guess: normalizedGuess, feedback }];
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

    // Update daily stats
    if (solved) {
      db.query(
        `UPDATE wordle_daily SET
          players_count = players_count + CASE WHEN $is_new_player THEN 1 ELSE 0 END,
          winners_count = winners_count + 1,
          total_attempts = total_attempts + $attempts
         WHERE guild_id = $guild_id`,
      ).run({
        $is_new_player: previousGuesses.length === 0 ? 1 : 0,
        $attempts: newAttempts,
        $guild_id: guildId,
      });
    } else if (previousGuesses.length === 0) {
      // First guess of the day for this user — increment player count
      db.query(
        'UPDATE wordle_daily SET players_count = players_count + 1 WHERE guild_id = $guild_id',
      ).run({ $guild_id: guildId });
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
        { id: string; guesses: string; solved: number; attempts: number; created_at: number },
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

  forceNewWord(guildId: string): ForceNewWordResult {
    const today = getRecifeDate();
    return this.pickNewWord(guildId, today);
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
      .query<{ channel_id: string }, { $guild_id: string }>(
        'SELECT channel_id FROM wordle_config WHERE guild_id = $guild_id',
      )
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
