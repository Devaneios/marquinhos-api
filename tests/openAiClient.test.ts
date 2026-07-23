import axios from 'axios';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { OpenAiClient } from '../src/services/aiChat/OpenAiClient';

describe('OpenAiClient.chat', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('returns the assistant message content from the API response', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const postSpy = spyOn(axios, 'post').mockResolvedValue({
      data: { choices: [{ message: { content: 'oi tudo bem' } }] },
    } as any);

    const client = new OpenAiClient();
    const result = await client.chat({
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.5,
      maxTokens: 50,
    });

    expect(result).toBe('oi tudo bem');
    postSpy.mockRestore();
  });

  it('sends the Authorization header built from OPENAI_API_KEY and model gpt-4o-mini', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const postSpy = spyOn(axios, 'post').mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] },
    } as any);

    const client = new OpenAiClient();
    await client.chat({
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.5,
      maxTokens: 50,
    });

    expect(postSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ model: 'gpt-4o-mini' }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    postSpy.mockRestore();
  });

  it('includes response_format json_object when jsonMode is true', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const postSpy = spyOn(axios, 'post').mockResolvedValue({
      data: {
        choices: [{ message: { content: '{"category":"casual_chat"}' } }],
      },
    } as any);

    const client = new OpenAiClient();
    await client.chat({
      messages: [{ role: 'system', content: 'classify' }],
      temperature: 0.1,
      maxTokens: 20,
      jsonMode: true,
    });

    expect(postSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        response_format: { type: 'json_object' },
      }),
      expect.any(Object),
    );
    postSpy.mockRestore();
  });

  it('omits response_format when jsonMode is not set', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const postSpy = spyOn(axios, 'post').mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] },
    } as any);

    const client = new OpenAiClient();
    await client.chat({
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.5,
      maxTokens: 50,
    });

    const [, body] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.response_format).toBeUndefined();
    postSpy.mockRestore();
  });
});
