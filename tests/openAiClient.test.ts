import { describe, expect, it, mock } from 'bun:test';
import type OpenAI from 'openai';
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
  } as unknown as OpenAI;
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

describe('OpenAiClient.structured', () => {
  const schema = z.object({ category: z.enum(['a', 'b']) });

  it('returns the parsed, schema-validated object from the SDK', async () => {
    const sdk = fakeSdkClient({
      parse: async () => ({
        choices: [{ message: { parsed: { category: 'a' } } }],
      }),
    });

    const client = new OpenAiClient(sdk);
    const result = await client.structured(
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
    await client.structured(
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
      client.structured(
        [{ role: 'system', content: 'classify' }],
        schema,
        'classification',
        { temperature: 0.1, maxTokens: 20 },
      ),
    ).rejects.toThrow();
  });
});

describe('OpenAiClient.chatWithTools', () => {
  it('calls the SDK with tools and tool_choice auto', async () => {
    const sdk = fakeSdkClient({
      create: async () => ({
        choices: [{ message: { role: 'assistant', content: 'oi' } }],
      }),
    });
    const client = new OpenAiClient(sdk);
    const tools = [
      {
        type: 'function' as const,
        function: { name: 'foo', description: 'desc', parameters: {} },
      },
    ];

    await client.chatWithTools([{ role: 'user', content: 'oi' }], tools, {
      temperature: 0.5,
      maxTokens: 50,
    });

    expect(sdk.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        tools,
        tool_choice: 'auto',
        temperature: 0.5,
        max_tokens: 50,
      }),
    );
  });

  it('returns the full assistant message when there are no tool calls', async () => {
    const sdk = fakeSdkClient({
      create: async () => ({
        choices: [
          { message: { role: 'assistant', content: 'resposta final' } },
        ],
      }),
    });
    const client = new OpenAiClient(sdk);

    const result = await client.chatWithTools(
      [{ role: 'user', content: 'oi' }],
      [],
      { temperature: 0.5, maxTokens: 50 },
    );

    expect(result.content).toBe('resposta final');
    expect(result.tool_calls).toBeUndefined();
  });

  it('returns the full assistant message including tool_calls when present', async () => {
    const toolCalls = [
      {
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'list_directory', arguments: '{"path":"/repo"}' },
      },
    ];
    const sdk = fakeSdkClient({
      create: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: toolCalls,
            },
          },
        ],
      }),
    });
    const client = new OpenAiClient(sdk);

    const result = await client.chatWithTools(
      [{ role: 'user', content: 'lista os arquivos' }],
      [],
      { temperature: 0.5, maxTokens: 50 },
    );

    expect(result.tool_calls).toEqual(toolCalls);
  });

  it('throws when the SDK returns no completion message', async () => {
    const sdk = fakeSdkClient({ create: async () => ({ choices: [] }) });
    const client = new OpenAiClient(sdk);

    await expect(
      client.chatWithTools([{ role: 'user', content: 'oi' }], [], {
        temperature: 0.5,
        maxTokens: 50,
      }),
    ).rejects.toThrow();
  });
});
