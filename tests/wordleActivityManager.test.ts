import { describe, expect, it } from 'bun:test';

// Set in-memory db BEFORE any imports that load the db module — mirrors
// tests/wordle.spec.ts so this suite doesn't touch the real marquinhos.db.
process.env.SQLITE_PATH = ':memory:';

const { getValidationSet } = await import('../src/services/wordle');
const { wireWordleActivity } =
  await import('../src/services/activity/wordle/WordleActivityManager');
const { roomKey } = await import('../src/realtime/ActivityRealtimeServer');
type ActivityRealtimeServer =
  import('../src/realtime/ActivityRealtimeServer').ActivityRealtimeServer;

type Handler = (params: any) => void;

function scoped(params: {
  guildId: string;
  userId: string;
  ws: unknown;
  [key: string]: unknown;
}) {
  const instanceId = 'inst-1';
  const game = 'wordle' as const;
  return {
    mode: 'single' as const,
    ...params,
    instanceId,
    game,
    sessionKey: roomKey({
      instanceId,
      game,
      mode: 'single',
      userId: params.userId,
    }),
  };
}

function fakeRealtime() {
  let handlers: { onJoin?: Handler; onMessage?: Handler; onLeave?: Handler } =
    {};
  const sent: { ws: unknown; message: any }[] = [];

  const realtime = {
    registerGame: (_game: string, h: typeof handlers) => {
      handlers = h;
    },
    send: (ws: unknown, message: unknown) => sent.push({ ws, message }),
    broadcast: () => {},
    broadcastBinary: () => {},
  };

  return {
    realtime: realtime as unknown as ActivityRealtimeServer,
    join: (params: any) => handlers.onJoin?.(scoped(params)),
    message: (params: any) => handlers.onMessage?.(scoped(params)),
    leave: (params: any) => handlers.onLeave?.(scoped(params)),
    sent,
  };
}

function pickWordOfLength(length: number): string {
  for (const w of getValidationSet()) {
    if (w.length === length) return w;
  }
  throw new Error(`no validation word of length ${length} found`);
}

describe('wireWordleActivity', () => {
  it('sends an init payload with the word length and an empty guess history on join', () => {
    const { realtime, join, sent } = fakeRealtime();
    wireWordleActivity(realtime);

    join({ userId: 'user-a', guildId: 'guild-init', ws: 'ws-a' });

    expect(sent.length).toBe(1);
    const message = sent[0]!.message as { type: string; payload: any };
    expect(message.type).toBe('init');
    expect(message.payload.wordLength).toBeGreaterThanOrEqual(5);
    expect(message.payload.guesses).toEqual([]);
    expect(message.payload.solved).toBe(false);
    expect(message.payload.attempts).toBe(0);
  });

  it('replies guess_error for a guess whose length does not match the daily word', () => {
    const { realtime, join, message, sent } = fakeRealtime();
    wireWordleActivity(realtime);

    join({ userId: 'user-a', guildId: 'guild-wronglen', ws: 'ws-a' });
    const wordLength = (sent[0]!.message as { payload: { wordLength: number } })
      .payload.wordLength;

    message({
      userId: 'user-a',
      guildId: 'guild-wronglen',
      ws: 'ws-a',
      message: {
        type: 'guess',
        payload: { guess: 'a'.repeat(wordLength + 2) },
      },
    });

    const reply = sent[1]!.message as { type: string; payload: any };
    expect(reply.type).toBe('guess_error');
    expect(typeof reply.payload.message).toBe('string');
  });

  it('replies guess_result for a valid guess of the right length', () => {
    const { realtime, join, message, sent } = fakeRealtime();
    wireWordleActivity(realtime);

    join({ userId: 'user-a', guildId: 'guild-validguess', ws: 'ws-a' });
    const wordLength = (sent[0]!.message as { payload: { wordLength: number } })
      .payload.wordLength;
    const guess = pickWordOfLength(wordLength);

    message({
      userId: 'user-a',
      guildId: 'guild-validguess',
      ws: 'ws-a',
      message: { type: 'guess', payload: { guess } },
    });

    const reply = sent[1]!.message as { type: string; payload: any };
    expect(reply.type).toBe('guess_result');
    expect(reply.payload.feedback.length).toBe(wordLength);
    expect(reply.payload.attempts).toBe(1);
  });

  it('keeps two different users in the same guild from seeing each other’s guesses', () => {
    const { realtime, join, message, sent } = fakeRealtime();
    wireWordleActivity(realtime);

    join({ userId: 'user-a', guildId: 'guild-shared', ws: 'ws-a' });
    join({ userId: 'user-b', guildId: 'guild-shared', ws: 'ws-b' });
    const wordLength = (sent[0]!.message as { payload: { wordLength: number } })
      .payload.wordLength;
    const guess = pickWordOfLength(wordLength);

    message({
      userId: 'user-a',
      guildId: 'guild-shared',
      ws: 'ws-a',
      message: { type: 'guess', payload: { guess } },
    });

    // user-b re-joins (e.g. reconnect) and must still see zero guesses of
    // their own, even though user-a just submitted one in the same guild.
    join({ userId: 'user-b', guildId: 'guild-shared', ws: 'ws-b2' });
    const bReinit = sent[sent.length - 1]!.message as {
      type: string;
      payload: any;
    };
    expect(bReinit.payload.guesses).toEqual([]);
    expect(bReinit.payload.attempts).toBe(0);
  });

  it('rate-limits rapid guesses from the same connection', () => {
    const { realtime, join, message, sent } = fakeRealtime();
    wireWordleActivity(realtime);

    join({ userId: 'user-a', guildId: 'guild-ratelimit', ws: 'ws-a' });
    const wordLength = (sent[0]!.message as { payload: { wordLength: number } })
      .payload.wordLength;
    // Deliberately wrong length so every attempt is a fast, deterministic
    // guess_error rather than depending on word-guessing correctness.
    const badGuess = 'a'.repeat(wordLength + 2);

    const before = sent.length;
    for (let i = 0; i < 50; i++) {
      message({
        userId: 'user-a',
        guildId: 'guild-ratelimit',
        ws: 'ws-a',
        message: { type: 'guess', payload: { guess: badGuess } },
      });
    }

    const repliesSent = sent.length - before;
    expect(repliesSent).toBeGreaterThan(0);
    expect(repliesSent).toBeLessThan(50);
  });

  it('does not throw when a connection leaves', () => {
    const { realtime, join, leave } = fakeRealtime();
    wireWordleActivity(realtime);

    join({ userId: 'user-a', guildId: 'guild-leave', ws: 'ws-a' });
    expect(() =>
      leave({ userId: 'user-a', guildId: 'guild-leave', ws: 'ws-a' }),
    ).not.toThrow();
  });
});
