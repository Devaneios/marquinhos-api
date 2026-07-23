import { GuardrailService } from './GuardrailService';
import { OpenAiClient } from './OpenAiClient';
import {
  buildResponsePrompt,
  CLASSIFY_SYSTEM_PROMPT,
  GUARDRAIL_ROAST_PROMPT,
} from './prompts';
import { RateLimitService } from './RateLimitService';
import type { AiChatRequest, AiChatResult, ResponseCategory } from './types';

const RESPONSE_CATEGORIES: ResponseCategory[] = [
  'general_question',
  'opinion_reference',
  'casual_chat',
  'off_topic_unclear',
];

export class AiChatService {
  constructor(
    private rateLimitService: RateLimitService = new RateLimitService(),
    private guardrailService: GuardrailService = new GuardrailService(),
    private openAiClient: OpenAiClient = new OpenAiClient(),
  ) {}

  async respond(request: AiChatRequest): Promise<AiChatResult> {
    const allowed = this.rateLimitService.checkAndIncrement(
      request.userId,
      request.guildId,
    );
    if (!allowed) return { status: 'rate_limited' };

    try {
      if (this.guardrailService.isInjectionAttempt(request.content)) {
        const reply = await this.openAiClient.chat({
          messages: [
            { role: 'system', content: GUARDRAIL_ROAST_PROMPT },
            { role: 'user', content: request.content },
          ],
          temperature: 0.9,
          maxTokens: 120,
        });
        return { status: 'ok', category: 'guardrail_roast', reply };
      }

      const category = await this.classify(request.content);
      const reply = await this.generateReply(category, request);
      return { status: 'ok', category, reply };
    } catch (error) {
      console.error('AiChatService error:', error);
      return { status: 'error' };
    }
  }

  private async classify(content: string): Promise<ResponseCategory> {
    const raw = await this.openAiClient.chat({
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      temperature: 0.1,
      maxTokens: 20,
      jsonMode: true,
    });

    const parsed = JSON.parse(raw) as { category: string };
    return RESPONSE_CATEGORIES.includes(parsed.category as ResponseCategory)
      ? (parsed.category as ResponseCategory)
      : 'off_topic_unclear';
  }

  private async generateReply(
    category: ResponseCategory,
    request: AiChatRequest,
  ): Promise<string> {
    return this.openAiClient.chat({
      messages: [
        {
          role: 'system',
          content: buildResponsePrompt(category, request.recentMessages),
        },
        { role: 'user', content: request.content },
      ],
      temperature: 0.8,
      maxTokens: 200,
    });
  }
}
