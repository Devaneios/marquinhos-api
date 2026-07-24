import { GuardrailService } from './GuardrailService';
import { OpenAiClient } from './OpenAiClient';
import {
  buildResponsePrompt,
  buildRevisionInput,
  buildRevisionPrompt,
  FALLBACK_FORMAT,
  GUARDRAIL_ROAST_PROMPT,
  MAIN_CLASSIFY_SYSTEM_PROMPT,
  mainClassificationSchema,
  revisionSchema,
  SUB_CLASSIFIERS,
} from './prompts';
import { RateLimitService } from './RateLimitService';
import type {
  AiChatRequest,
  AiChatResult,
  MainCategory,
  ResponseCategory,
} from './types';

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
        return {
          status: 'ok',
          category: 'guardrail_roast',
          reply,
          format: 'text',
        };
      }

      const mainCategory = await this.classifyMain(request.content);
      const category =
        mainCategory === 'unclear'
          ? 'off_topic_unclear'
          : await this.classifySub(mainCategory, request.content);
      const draft = await this.generateReply(category, request);
      const revised = await this.revise(category, request.content, draft);
      return { status: 'ok', category, ...revised };
    } catch (error) {
      console.error('AiChatService error:', error);
      return { status: 'error' };
    }
  }

  private async classifyMain(content: string): Promise<MainCategory> {
    const result = await this.openAiClient.structured(
      [
        { role: 'system', content: MAIN_CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      mainClassificationSchema,
      'main_classification',
      { temperature: 0.1, maxTokens: 20 },
    );

    const parsed = mainClassificationSchema.safeParse(result);
    return parsed.success ? parsed.data.category : 'unclear';
  }

  private async classifySub(
    mainCategory: Exclude<MainCategory, 'unclear'>,
    content: string,
  ): Promise<ResponseCategory> {
    const { schema, prompt, fallback } = SUB_CLASSIFIERS[mainCategory];
    const result = await this.openAiClient.structured(
      [
        { role: 'system', content: prompt },
        { role: 'user', content },
      ],
      schema,
      'sub_classification',
      { temperature: 0.1, maxTokens: 20 },
    );

    const parsed = schema.safeParse(result);
    return parsed.success ? parsed.data.category : fallback;
  }

  private async generateReply(
    category: ResponseCategory,
    request: AiChatRequest,
  ): Promise<string> {
    const safeRecentMessages = this.guardrailService.filterSafeMessages(
      request.recentMessages,
    );
    const safeRepliedMessage =
      request.repliedMessage &&
      !this.guardrailService.isInjectionAttempt(request.repliedMessage.content)
        ? request.repliedMessage
        : undefined;
    return this.openAiClient.chat({
      messages: [
        {
          role: 'system',
          content: buildResponsePrompt(
            category,
            safeRecentMessages,
            safeRepliedMessage,
          ),
        },
        { role: 'user', content: request.content },
      ],
      temperature: 0.6,
      maxTokens: 1200,
    });
  }

  private async revise(
    category: ResponseCategory,
    userContent: string,
    draft: string,
  ): Promise<Pick<AiChatResult, 'reply' | 'format' | 'embedTitle'>> {
    try {
      const result = await this.openAiClient.structured(
        [
          { role: 'system', content: buildRevisionPrompt(category) },
          { role: 'user', content: buildRevisionInput(userContent, draft) },
        ],
        revisionSchema,
        'revision',
        { temperature: 0.3, maxTokens: 1400 },
      );

      const parsed = revisionSchema.safeParse(result);
      if (!parsed.success)
        return { reply: draft, ...FALLBACK_FORMAT[category] };
      return {
        reply: parsed.data.reply,
        format: parsed.data.format,
        embedTitle: parsed.data.embedTitle ?? undefined,
      };
    } catch (error) {
      console.error('AiChatService revision error:', error);
      return { reply: draft, ...FALLBACK_FORMAT[category] };
    }
  }
}
