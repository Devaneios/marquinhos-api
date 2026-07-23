import { GuardrailService } from './GuardrailService';
import { OpenAiClient } from './OpenAiClient';
import {
  buildResponsePrompt,
  classificationSchema,
  CLASSIFY_SYSTEM_PROMPT,
  GUARDRAIL_ROAST_PROMPT,
} from './prompts';
import { RateLimitService } from './RateLimitService';
import type { AiChatRequest, AiChatResult, ResponseCategory } from './types';

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
    const result = await this.openAiClient.classify(
      [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      classificationSchema,
      'classification',
      { temperature: 0.1, maxTokens: 20 },
    );

    const parsed = classificationSchema.safeParse(result);
    return parsed.success ? parsed.data.category : 'off_topic_unclear';
  }

  private async generateReply(
    category: ResponseCategory,
    request: AiChatRequest,
  ): Promise<string> {
    const safeRecentMessages = this.guardrailService.filterSafeMessages(
      request.recentMessages,
    );
    return this.openAiClient.chat({
      messages: [
        {
          role: 'system',
          content: buildResponsePrompt(category, safeRecentMessages),
        },
        { role: 'user', content: request.content },
      ],
      temperature: 0.8,
      maxTokens: 200,
    });
  }
}
