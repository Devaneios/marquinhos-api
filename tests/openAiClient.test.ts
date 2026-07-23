import { describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';
import { OpenAiClient } from '../src/services/aiChat/OpenAiClient';

function fakeSdkClient(overrides: {
  create?: (...args: unknown[]) => unknown;
  parse?: (...args: unknown[]) => unknown;
}) {
  return {
    chat: {
      completions: {
        create: mock(overrides.create ?? (async () => ({}))),
        parse: mock(overrides.parse ?? (async () => ({}))),
      },
    },
  } as any;
}

describe('OpenAiClient.chat', () => {
  it('returns the assistant message content from the API response', async () => {
    const sdk = fakeSdkClient({
      create: async () => ({
        choices: [{ message: { content: 'oi tudo bem' } }],
      }),
    });

    const client = new OpenAiClient(sdk);
    const result = await client.chat({
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.5,
      maxTokens: 50,
    });

    expect(result).toBe('oi tudo bem');
  });

  it('calls the SDK with model gpt-4o-mini and the given messages/params', async () => {
    const sdk = fakeSdkClient({
      create: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

    const client = new OpenAiClient(sdk);
    await client.chat({
      messages: [{ role: 'user', content: 'oi' }],
      temperature: 0.5,
      maxTokens: 50,
    });

    expect(sdk.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'oi' }],
        temperature: 0.5,
        max_tokens: 50,
      }),
    );
  });

  it('throws when the SDK returns no completion content', async () => {
    const sdk = fakeSdkClient({
      create: async () => ({ choices: [{ message: { content: null } }] }),
    });

    const client = new OpenAiClient(sdk);
    await expect(
      client.chat({
        messages: [{ role: 'user', content: 'oi' }],
        temperature: 0.5,
        maxTokens: 50,
      }),
    ).rejects.toThrow();
  });
});

describe('OpenAiClient.classify', () => {
  const schema = z.object({ category: z.enum(['a', 'b']) });

  it('returns the parsed, schema-validated object from the SDK', async () => {
    const sdk = fakeSdkClient({
      parse: async () => ({
        choices: [{ message: { parsed: { category: 'a' } } }],
      }),
    });

    const client = new OpenAiClient(sdk);
    const result = await client.classify(
      [{ role: 'system', content: 'classify' }],
      schema,
      'classification',
      { temperature: 0.1, maxTokens: 20 },
    );

    expect(result).toEqual({ category: 'a' });
  });

  it('calls chat.completions.parse with a json_schema response_format built from the zod schema', async () => {
    const sdk = fakeSdkClient({
      parse: async () => ({
        choices: [{ message: { parsed: { category: 'a' } } }],
      }),
    });

    const client = new OpenAiClient(sdk);
    await client.classify(
      [{ role: 'system', content: 'classify' }],
      schema,
      'classification',
      { temperature: 0.1, maxTokens: 20 },
    );

    expect(sdk.chat.completions.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        response_format: expect.objectContaining({
          type: 'json_schema',
          json_schema: expect.objectContaining({
            name: 'classification',
            strict: true,
          }),
        }),
      }),
    );
  });

  it('throws when the SDK returns no parsed classification', async () => {
    const sdk = fakeSdkClient({
      parse: async () => ({ choices: [{ message: { parsed: null } }] }),
    });

    const client = new OpenAiClient(sdk);
    await expect(
      client.classify(
        [{ role: 'system', content: 'classify' }],
        schema,
        'classification',
        { temperature: 0.1, maxTokens: 20 },
      ),
    ).rejects.toThrow();
  });
});
