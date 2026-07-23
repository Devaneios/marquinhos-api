import { describe, expect, it } from 'bun:test';
import { aiChatRespondSchema } from '../src/schemas/aiChat.schema';

describe('aiChatRespondSchema', () => {
  it('accepts a valid payload', async () => {
    await expect(
      aiChatRespondSchema.parseAsync({
        body: {
          userId: 'u1',
          guildId: 'g1',
          channelId: 'c1',
          content: 'oi',
          recentMessages: [{ author: 'ana', content: 'oi' }],
        },
        query: {},
        params: {},
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a payload missing content', async () => {
    await expect(
      aiChatRespondSchema.parseAsync({
        body: {
          userId: 'u1',
          guildId: 'g1',
          channelId: 'c1',
          recentMessages: [],
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('rejects recentMessages longer than 20 entries', async () => {
    const recentMessages = Array.from({ length: 21 }, (_, i) => ({
      author: `user${i}`,
      content: 'msg',
    }));
    await expect(
      aiChatRespondSchema.parseAsync({
        body: {
          userId: 'u1',
          guildId: 'g1',
          channelId: 'c1',
          content: 'oi',
          recentMessages,
        },
        query: {},
        params: {},
      }),
    ).rejects.toThrow();
  });
});
