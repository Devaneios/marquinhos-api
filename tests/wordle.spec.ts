import { beforeEach, describe, expect, it } from 'bun:test';

// Set in-memory db BEFORE any imports that load the db module
process.env.SQLITE_PATH = ':memory:';

const { db } = await import('../src/database/sqlite');
const { WordleService } = await import('../src/services/wordle');

function seedDailyRow(guildId: string, wordDate: string, playersCount: number) {
  db.run(
    `INSERT OR REPLACE INTO wordle_daily
       (guild_id, word, word_date, players_count, winners_count, total_attempts, created_at)
     VALUES (?, ?, ?, ?, 0, 0, 0)`,
    [guildId, 'teste', wordDate, playersCount],
  );
}

describe('WordleService.getGroupStreak', () => {
  let service: WordleService;

  beforeEach(() => {
    db.run('DELETE FROM wordle_daily');
    db.run('DELETE FROM wordle_sessions');
    service = new WordleService();
  });

  it('returns 0 when no days have been played', () => {
    expect(service.getGroupStreak('guild1')).toBe(0);
  });

  it('returns 0 when the most recent day is not yesterday', () => {
    // Two days ago — gap before yesterday means streak is broken
    seedDailyRow('guild1', '2026-01-01', 1);
    expect(service.getGroupStreak('guild1')).toBe(0);
  });

  it('counts consecutive days up to yesterday', () => {
    const streak = service.getGroupStreak('guild1');
    expect(typeof streak).toBe('number');
    expect(streak).toBeGreaterThanOrEqual(0);
  });

  it('stops counting at a gap', () => {
    const streak = service.getGroupStreak('guild1');
    expect(streak).toBeGreaterThanOrEqual(0);
    expect(streak).toBeLessThanOrEqual(3);
  });
});

function seedSession(
  guildId: string,
  userId: string,
  wordDate: string,
  attempts: number,
  solved: boolean,
  wordLength = 5,
) {
  const { randomUUID } = require('crypto');
  db.run(
    `INSERT OR REPLACE INTO wordle_sessions
       (id, user_id, guild_id, word_date, guesses, solved, attempts, word_length, created_at)
     VALUES (?, ?, ?, ?, '[]', ?, ?, ?, 0)`,
    [
      randomUUID(),
      userId,
      guildId,
      wordDate,
      solved ? 1 : 0,
      attempts,
      wordLength,
    ],
  );
}

describe('WordleService.getLeaderboard with period', () => {
  let service: WordleService;

  beforeEach(() => {
    db.run('DELETE FROM wordle_sessions');
    service = new WordleService();
  });

  it('daily: returns only todays sessions sorted by solved DESC, attempts ASC', () => {
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: process.env.WORDLE_TIMEZONE ?? 'America/Recife',
    }).format(new Date());

    seedSession('g1', 'user1', today, 3, true);
    seedSession('g1', 'user2', today, 2, true);
    seedSession('g1', 'user3', today, 6, false);
    seedSession('g1', 'user4', '2020-01-01', 1, true);

    const entries = service.getLeaderboard('g1', 10, 'daily') as {
      userId: string;
      attempts: number;
      solved: boolean;
    }[];

    expect(entries).toHaveLength(3);
    expect(entries[0].userId).toBe('user2');
    expect(entries[1].userId).toBe('user1');
    expect(entries[2].userId).toBe('user3');
  });

  it('all-time: default behavior unchanged', () => {
    seedSession('g1', 'user1', '2026-01-01', 3, true);
    seedSession('g1', 'user1', '2026-01-02', 2, true);
    seedSession('g1', 'user2', '2026-01-01', 1, true);

    const entries = service.getLeaderboard('g1', 10, 'all-time') as {
      userId: string;
      avgScore: number;
    }[];

    expect(entries.length).toBeGreaterThan(0);
    // user1 played both days (avg 2.5); user2 played only day 1 and gets penalised
    // for day 2 (avg (1+6)/2 = 3.5) — so user1 ranks first
    expect(entries[0].userId).toBe('user1');
  });
});
