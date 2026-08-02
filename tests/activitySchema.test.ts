import { describe, expect, it } from 'bun:test';
import {
  activityTokenExchangeSchema,
  activityWsSessionSchema,
} from '../src/schemas/activity.schema';

describe('activityTokenExchangeSchema', () => {
  it('accepts a payload with a code', async () => {
    await expect(
      activityTokenExchangeSchema.parseAsync({
        body: { code: 'auth-code-abc' },
        query: {},
        params: {},
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a payload missing code', async () => {
    await expect(
      activityTokenExchangeSchema.parseAsync({
        body: {},
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects an empty code string', async () => {
    await expect(
      activityTokenExchangeSchema.parseAsync({
        body: { code: '' },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });
});

describe('activityWsSessionSchema', () => {
  it('accepts a payload with accessToken, instanceId, guildId, mode and game', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          instanceId: 'inst-1',
          guildId: 'guild-1',
          mode: 'multi',
          game: 'pong',
        },
        query: {},
        params: {},
      }),
    ).resolves.toBeDefined();
  });

  it('accepts mode "single"', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          instanceId: 'inst-1',
          guildId: 'guild-1',
          mode: 'single',
          game: 'pong',
        },
        query: {},
        params: {},
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a payload missing instanceId', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          guildId: 'guild-1',
          mode: 'multi',
          game: 'pong',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects a payload missing accessToken', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          instanceId: 'inst-1',
          guildId: 'guild-1',
          mode: 'multi',
          game: 'pong',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects a payload missing guildId', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          instanceId: 'inst-1',
          mode: 'multi',
          game: 'pong',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects a payload missing mode', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          instanceId: 'inst-1',
          guildId: 'guild-1',
          game: 'pong',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid mode value', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          instanceId: 'inst-1',
          guildId: 'guild-1',
          mode: 'coop',
          game: 'pong',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects a payload missing game', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          instanceId: 'inst-1',
          guildId: 'guild-1',
          mode: 'multi',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects an invalid game value', async () => {
    await expect(
      activityWsSessionSchema.parseAsync({
        body: {
          accessToken: 'tok_abc',
          instanceId: 'inst-1',
          guildId: 'guild-1',
          mode: 'multi',
          game: 'chess',
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });
});
