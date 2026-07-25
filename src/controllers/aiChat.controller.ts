import type { Request, Response } from 'express';
import { AiChatService } from '../services/aiChat/AiChatService';
import { AiTraceQuery } from '../services/aiChat/AiTraceQuery';
import { logger } from '../utils/logger';

class AiChatController {
  private service: AiChatService;
  private traceQuery: AiTraceQuery;

  constructor(
    service: AiChatService = new AiChatService(),
    traceQuery: AiTraceQuery = new AiTraceQuery(),
  ) {
    this.service = service;
    this.traceQuery = traceQuery;
  }

  async respond(req: Request, res: Response) {
    try {
      const {
        userId,
        guildId,
        channelId,
        content,
        recentMessages,
        repliedMessage,
      } = req.body as {
        userId: string;
        guildId: string;
        channelId: string;
        content: string;
        recentMessages: { author: string; content: string }[];
        repliedMessage?: { author: string; content: string };
      };

      const result = await this.service.respond({
        userId,
        guildId,
        channelId,
        content,
        recentMessages,
        repliedMessage,
      });

      return res.status(200).json({ data: result });
    } catch (error) {
      logger.error('ai.controller.respond_failed', { error });
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async listTraces(req: Request, res: Response) {
    try {
      const { limit, userId, status, category } = req.query as {
        limit?: string;
        userId?: string;
        status?: string;
        category?: string;
      };

      const traces = this.traceQuery.list({
        limit: limit ? Number(limit) : undefined,
        userId,
        status,
        category,
      });

      return res.status(200).json({ data: traces });
    } catch (error) {
      logger.error('ai.controller.list_traces_failed', { error });
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getTrace(req: Request, res: Response) {
    try {
      const trace = this.traceQuery.get(req.params.traceId as string);
      if (!trace) return res.status(404).json({ message: 'Trace not found' });
      return res.status(200).json({ data: trace });
    } catch (error) {
      logger.error('ai.controller.get_trace_failed', { error });
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default AiChatController;
