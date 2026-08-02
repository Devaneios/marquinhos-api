import type { Request, Response } from 'express';
import type { GameId } from '../services/activity/gameId';
import { mintWsSessionToken } from '../services/activity/wsSessionToken';
import { DiscordService } from '../services/discord';
import { logger } from '../utils/logger';

class ActivityController {
  private discordService: DiscordService;

  constructor(discordService: DiscordService = new DiscordService()) {
    this.discordService = discordService;
  }

  exchangeToken = async (req: Request, res: Response) => {
    try {
      const { code } = req.body as { code: string };
      const data = await this.discordService.exchangeActivityCode(code);
      return res
        .status(200)
        .json({ data: { access_token: data.access_token } });
    } catch (error) {
      logger.error('activity.controller.exchange_token_failed', { error });
      return res.status(500).json({ message: 'Unknown Error' });
    }
  };

  getWsSessionToken = async (req: Request, res: Response) => {
    try {
      const { accessToken, instanceId, guildId, mode, game } = req.body as {
        accessToken: string;
        instanceId: string;
        guildId: string;
        mode: 'single' | 'multi';
        game: GameId;
      };
      const user = await this.discordService.getDiscordUser(accessToken);
      if (!user?.id) {
        return res.status(401).json({ message: 'Invalid access token' });
      }
      const token = mintWsSessionToken({
        userId: user.id,
        instanceId,
        guildId,
        mode,
        game,
      });
      return res.status(200).json({ data: { token } });
    } catch (error) {
      logger.error('activity.controller.ws_session_failed', { error });
      return res.status(500).json({ message: 'Unknown Error' });
    }
  };
}

export default ActivityController;
