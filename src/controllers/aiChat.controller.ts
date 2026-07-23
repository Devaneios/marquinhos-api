import type { Request, Response } from 'express';
import { AiChatService } from '../services/aiChat/AiChatService';

class AiChatController {
  private service: AiChatService;

  constructor(service: AiChatService = new AiChatService()) {
    this.service = service;
  }

  async respond(req: Request, res: Response) {
    try {
      const { userId, guildId, channelId, content, recentMessages } =
        req.body as {
          userId: string;
          guildId: string;
          channelId: string;
          content: string;
          recentMessages: { author: string; content: string }[];
        };

      const result = await this.service.respond({
        userId,
        guildId,
        channelId,
        content,
        recentMessages,
      });

      return res.status(200).json({ data: result });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default AiChatController;
