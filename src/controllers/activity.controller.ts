import type { Request, Response } from 'express';
import type { ActivityMode, GameId } from '../services/activity/gameId';
import type { BotDifficulty } from '../services/activity/pong/PongBotAI';
import { roomKey } from '../services/activity/roomKey';
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
      const {
        accessToken,
        instanceId,
        guildId,
        mode,
        game,
        difficulty,
        winningScore,
      } = req.body as {
        accessToken: string;
        instanceId: string;
        guildId: string;
        mode: ActivityMode;
        game: GameId;
        difficulty?: BotDifficulty;
        winningScore?: number;
      };
      const user = await this.discordService.getDiscordUser(accessToken);
      if (!user?.id) {
        return res.status(401).json({ message: 'Invalid access token' });
      }
      // guildId only ever reaches gamification writes for a real 'multi'
      // match (PongSession.recordResult, gated on two connected players);
      // solo-vs-bot and local hot-seat never read it. Scoping the check to
      // 'multi' keeps those private modes from depending on Discord's bot
      // API for a guild claim that can't affect anyone there.
      if (mode === 'multi') {
        const isMember = await this.discordService.isGuildMember(
          guildId,
          user.id,
        );
        if (!isMember) {
          return res
            .status(403)
            .json({ message: 'Not a member of the specified guild' });
        }
      }
      const token = mintWsSessionToken({
        userId: user.id,
        instanceId,
        guildId,
        mode,
        game,
        ...(difficulty !== undefined ? { difficulty } : {}),
        ...(winningScore !== undefined ? { winningScore } : {}),
      });
      const key = roomKey({ instanceId, game, mode, userId: user.id });
      return res.status(200).json({ data: { token, roomKey: key } });
    } catch (error) {
      logger.error('activity.controller.ws_session_failed', { error });
      return res.status(500).json({ message: 'Unknown Error' });
    }
  };
}

export default ActivityController;
