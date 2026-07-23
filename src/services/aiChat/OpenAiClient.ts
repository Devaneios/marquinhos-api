import axios from 'axios';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
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
  jsonMode?: boolean;
}

interface OpenAiChatCompletionResponse {
  choices: { message: { content: string } }[];
}

export class OpenAiClient {
  async chat(options: OpenAiChatOptions): Promise<string> {
    const response = await axios.post<OpenAiChatCompletionResponse>(
      OPENAI_API_URL,
      {
        model: OPENAI_MODEL,
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(options.jsonMode
          ? { response_format: { type: 'json_object' } }
          : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    const content = response.data.choices[0]?.message?.content;
    if (content === undefined) {
      throw new Error('OpenAI returned no completion content');
    }
    return content;
  }
}
