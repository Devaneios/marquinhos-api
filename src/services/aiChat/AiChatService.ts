import { logger } from '../../utils/logger';
import { AgentToolLoopService } from './AgentToolLoopService';
import { AiTraceRecorder, type TraceContext } from './AiTraceRecorder';
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
    private agentToolLoopService: AgentToolLoopService = new AgentToolLoopService(),
    private traceRecorder: AiTraceRecorder = new AiTraceRecorder(),
  ) {}

  async respond(request: AiChatRequest): Promise<AiChatResult> {
    const allowed = this.rateLimitService.checkAndIncrement(
      request.userId,
      request.guildId,
    );
    if (!allowed) {
      logger.info('ai.request.rate_limited', {
        userId: request.userId,
        guildId: request.guildId,
      });
      return { status: 'rate_limited' };
    }

    const trace = this.traceRecorder.start(request);

    try {
      if (this.guardrailService.isInjectionAttempt(request.content)) {
        const reply = await this.openAiClient.chat({
          messages: [
            { role: 'system', content: GUARDRAIL_ROAST_PROMPT },
            { role: 'user', content: request.content },
          ],
          temperature: 0.9,
          maxTokens: 120,
          trace,
          phase: 'guardrail_roast',
        });
        trace.finish({
          status: 'ok',
          category: 'guardrail_roast',
          reply,
          format: 'text',
        });
        return {
          status: 'ok',
          category: 'guardrail_roast',
          reply,
          format: 'text',
          traceId: trace.traceId || undefined,
        };
      }

      const mainCategory = await this.classifyMain(request.content, trace);
      if (mainCategory === 'agent_task') {
        return await this.agentToolLoopService.run(request, trace);
      }
      const category =
        mainCategory === 'unclear'
          ? 'off_topic_unclear'
          : await this.classifySub(mainCategory, request.content, trace);
      const draft = await this.generateReply(category, request, trace);
      const revised = await this.revise(
        category,
        request.content,
        draft,
        trace,
      );
      trace.finish({ status: 'ok', mainCategory, category, ...revised });
      return {
        status: 'ok',
        category,
        ...revised,
        traceId: trace.traceId || undefined,
      };
    } catch (error) {
      logger.error('ai.request.failed', { traceId: trace.traceId, error });
      trace.finish({ status: 'error', error });
      return { status: 'error', traceId: trace.traceId || undefined };
    }
  }

  private async classifyMain(
    content: string,
    trace: TraceContext,
  ): Promise<MainCategory> {
    const result = await this.openAiClient.structured(
      [
        { role: 'system', content: MAIN_CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      mainClassificationSchema,
      'main_classification',
      { temperature: 0.1, maxTokens: 20, trace, phase: 'classify_main' },
    );

    const parsed = mainClassificationSchema.safeParse(result);
    return parsed.success ? parsed.data.category : 'unclear';
  }

  private async classifySub(
    mainCategory: Exclude<MainCategory, 'unclear' | 'agent_task'>,
    content: string,
    trace: TraceContext,
  ): Promise<ResponseCategory> {
    const { schema, prompt, fallback } = SUB_CLASSIFIERS[mainCategory];
    const result = await this.openAiClient.structured(
      [
        { role: 'system', content: prompt },
        { role: 'user', content },
      ],
      schema,
      'sub_classification',
      { temperature: 0.1, maxTokens: 20, trace, phase: 'classify_sub' },
    );

    const parsed = schema.safeParse(result);
    return parsed.success ? parsed.data.category : fallback;
  }

  private async generateReply(
    category: ResponseCategory,
    request: AiChatRequest,
    trace: TraceContext,
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
      trace,
      phase: 'generate',
    });
  }

  private async revise(
    category: ResponseCategory,
    userContent: string,
    draft: string,
    trace: TraceContext,
  ): Promise<Pick<AiChatResult, 'reply' | 'format' | 'embedTitle'>> {
    try {
      const result = await this.openAiClient.structured(
        [
          { role: 'system', content: buildRevisionPrompt(category) },
          { role: 'user', content: buildRevisionInput(userContent, draft) },
        ],
        revisionSchema,
        'revision',
        { temperature: 0.3, maxTokens: 1400, trace, phase: 'revise' },
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
      logger.error('ai.revision.failed', { traceId: trace.traceId, error });
      return { reply: draft, ...FALLBACK_FORMAT[category] };
    }
  }
}
