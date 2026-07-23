import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ZodType } from 'zod';

const OPENAI_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 15000;

export interface OpenAiMessage {
  role: 'system' | 'user';
  content: string;
}

export interface OpenAiChatOptions {
  messages: OpenAiMessage[];
  temperature: number;
  maxTokens: number;
}

export interface OpenAiClassifyOptions {
  temperature: number;
  maxTokens: number;
}

export class OpenAiClient {
  constructor(
    private client: OpenAI = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
    }),
  ) {}

  async chat(options: OpenAiChatOptions): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    const content = completion.choices[0]?.message?.content;
    if (content === null || content === undefined) {
      throw new Error('OpenAI returned no completion content');
    }
    return content;
  }

  async classify<T>(
    messages: OpenAiMessage[],
    schema: ZodType<T>,
    schemaName: string,
    options: OpenAiClassifyOptions,
  ): Promise<T> {
    const completion = await this.client.chat.completions.parse({
      model: OPENAI_MODEL,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: zodResponseFormat(schema, schemaName),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (parsed === null || parsed === undefined) {
      throw new Error('OpenAI returned no parsed classification');
    }
    return parsed;
  }
}
