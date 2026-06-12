import { beforeEach, describe, expect, it } from 'bun:test';

// Set in-memory db BEFORE any imports that load the db module
process.env.SQLITE_PATH = ':memory:';

const { db } = await import('../src/database/sqlite');
const { WordleService } = await import('../src/services/wordle');

function getRecifeDate(): string {
  const tz = process.env.WORDLE_TIMEZONE ?? 'America/Recife';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date());
}

function daysAgo(n: number): string {
  const d = new Date(`${getRecifeDate()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

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

describe('WordleService.getGroupStreak', () => {
  let service: WordleService;

  beforeEach(() => {
    db.run('DELETE FROM wordle_sessions');
    service = new WordleService();
  });

  it('returns 0 when no days have been played', () => {
    expect(service.getGroupStreak('guild1')).toBe(0);
  });

  it('returns 0 when the most recent day is not yesterday', () => {
    // Two days ago — gap before yesterday means streak is broken
    seedSession('guild1', 'user1', daysAgo(2), 3, true);
    expect(service.getGroupStreak('guild1')).toBe(0);
  });

  it('counts consecutive days up to yesterday', () => {
    seedSession('guild1', 'user1', daysAgo(1), 3, true);
    seedSession('guild1', 'user2', daysAgo(2), 2, true);
    seedSession('guild1', 'user1', daysAgo(3), 4, true);

    expect(service.getGroupStreak('guild1')).toBe(3);
  });

  it('stops counting at a gap', () => {
    seedSession('guild1', 'user1', daysAgo(1), 3, true);
    seedSession('guild1', 'user1', daysAgo(3), 4, true);

    expect(service.getGroupStreak('guild1')).toBe(1);
  });

  it('ignores todays session when computing the streak', () => {
    seedSession('guild1', 'user1', daysAgo(0), 1, true);
    seedSession('guild1', 'user1', daysAgo(1), 3, true);
    seedSession('guild1', 'user1', daysAgo(2), 2, true);

    expect(service.getGroupStreak('guild1')).toBe(2);
  });
});

describe('WordleService.getLeaderboard with period', () => {
  let service: WordleService;

  beforeEach(() => {
    db.run('DELETE FROM wordle_sessions');
    service = new WordleService();
  });

  it('daily: returns only todays sessions sorted by solved DESC, attempts ASC', () => {
    const today = getRecifeDate();

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
