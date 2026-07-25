import type OpenAI from 'openai';
import { AgentRateLimitService } from './AgentRateLimitService';
import { GuardrailService } from './GuardrailService';
import { OpenAiClient, type OpenAiToolMessage } from './OpenAiClient';
import { AGENT_TASK_SYSTEM_PROMPT } from './prompts';
import { DockerodeSandboxClient } from './sandbox/DockerodeSandboxClient';
import { SandboxCapacityError, SandboxManager } from './sandbox/SandboxManager';
import { findTool, toOpenAiTools } from './tools/registry';
import type { AiChatRequest, AiChatResult } from './types';

const MAX_ITERATIONS = 6;
const MAX_TOOL_CALLS_TOTAL = 10;
const TOOL_RESULT_MAX_CHARS = 4000;
const EMBED_THRESHOLD_CHARS = 1800;
const EMBED_TITLE = '🛠️ Resultado';

export class AgentToolLoopService {
  constructor(
    private agentRateLimitService: AgentRateLimitService = new AgentRateLimitService(),
    private guardrailService: GuardrailService = new GuardrailService(),
    private sandboxManager: SandboxManager = new SandboxManager(
      new DockerodeSandboxClient(),
    ),
    private openAiClient: OpenAiClient = new OpenAiClient(),
  ) {}

  async run(request: AiChatRequest): Promise<AiChatResult> {
    const allowed = this.agentRateLimitService.checkAndIncrement(
      request.userId,
      request.guildId,
    );
    if (!allowed) return { status: 'rate_limited' };

    let containerId: string;
    try {
      containerId = await this.sandboxManager.getOrCreateSession(
        request.userId,
        request.guildId,
        request.channelId,
      );
    } catch (error) {
      if (error instanceof SandboxCapacityError) {
        return this.finalReply(
          'Muita gente usando o sandbox agora. Tenta de novo em alguns minutos.',
        );
      }
      throw error;
    }

    const safeRecentMessages = this.guardrailService.filterSafeMessages(
      request.recentMessages,
    );
    const safeRepliedMessage =
      request.repliedMessage &&
      !this.guardrailService.isInjectionAttempt(request.repliedMessage.content)
        ? request.repliedMessage
        : undefined;

    const messages: OpenAiToolMessage[] = [
      { role: 'system', content: AGENT_TASK_SYSTEM_PROMPT },
      ...this.buildContextMessages(safeRecentMessages, safeRepliedMessage),
      { role: 'user', content: request.content },
    ];

    const tools = toOpenAiTools();
    let toolCallsUsed = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const message = await this.openAiClient.chatWithTools(messages, tools, {
        temperature: 0.3,
        maxTokens: 1000,
      });

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return this.finalReply(message.content ?? '');
      }

      messages.push({
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        if (toolCallsUsed >= MAX_TOOL_CALLS_TOTAL) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              status: 'error',
              message: 'Orçamento de chamadas de ferramentas esgotado.',
            }),
          });
          continue;
        }
        toolCallsUsed++;

        const resultContent = await this.executeToolCall(toolCall, containerId);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: resultContent,
        });
      }
    }

    return this.finalReply(
      'Não consegui terminar essa tarefa a tempo. Tenta pedir algo mais simples ou dividir em partes menores.',
    );
  }

  private async executeToolCall(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    containerId: string,
  ): Promise<string> {
    if (toolCall.type !== 'function') {
      return JSON.stringify({
        status: 'error',
        message: `Tipo de ferramenta "${toolCall.type}" não suportado.`,
      });
    }

    const tool = findTool(toolCall.function.name);
    if (!tool) {
      return JSON.stringify({
        status: 'error',
        message: `Ferramenta "${toolCall.function.name}" não encontrada.`,
      });
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return JSON.stringify({
        status: 'error',
        message:
          'Argumentos inválidos (JSON malformado). Corrija e tente novamente.',
      });
    }

    try {
      const result = await tool.execute(args, {
        containerId,
        exec: (id, argv) => this.sandboxManager.exec(id, argv),
      });
      const truncated = result.slice(0, TOOL_RESULT_MAX_CHARS);
      return JSON.stringify({ status: 'success', result: truncated });
    } catch (error) {
      const message = `Erro ao executar ${tool.name}: ${(error as Error).message}`;
      return JSON.stringify({
        status: 'error',
        message: message.slice(0, TOOL_RESULT_MAX_CHARS),
      });
    }
  }

  private buildContextMessages(
    recentMessages: { author: string; content: string }[],
    repliedMessage?: { author: string; content: string },
  ): OpenAiToolMessage[] {
    const sections: OpenAiToolMessage[] = [];
    if (repliedMessage) {
      sections.push({
        role: 'user',
        content: `<replied_message trust_level="untrusted">\n${repliedMessage.author}: ${repliedMessage.content}\n</replied_message>`,
      });
    }
    if (recentMessages.length > 0) {
      const formatted = recentMessages
        .map((m) => `${m.author}: ${m.content}`)
        .join('\n');
      sections.push({
        role: 'user',
        content: `<chat_history trust_level="untrusted">\n${formatted}\n</chat_history>`,
      });
    }
    return sections;
  }

  private finalReply(reply: string): AiChatResult {
    const isLong = reply.length > EMBED_THRESHOLD_CHARS;
    return {
      status: 'ok',
      category: 'agent_task',
      reply,
      format: isLong ? 'embed' : 'text',
      embedTitle: isLong ? EMBED_TITLE : undefined,
    };
  }
}
