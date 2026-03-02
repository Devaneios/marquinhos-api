import { Request, Response } from 'express';
import { EvolutiveAchievementsService } from '../services/evolutiveAchievements';

const service = new EvolutiveAchievementsService();

export const evolutiveAchievements = {
  checkAndEvolve(req: Request, res: Response): void {
    const { userId, guildId } = req.params;
    try {
      const evolutions = service.checkAndEvolveAll(userId, guildId);
      res.json({ data: evolutions });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Failed to check evolution', error: String(error) });
    }
  },

  getUserEvolutiveAchievements(req: Request, res: Response): void {
    const { userId, guildId } = req.params;
    try {
      const achievements = service.getUserEvolutiveAchievements(
        userId,
        guildId,
      );
      res.json({ data: achievements });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to get evolutive achievements',
        error: String(error),
      });
    }
  },

  getEvolutionTimeline(req: Request, res: Response): void {
    const { userId, guildId } = req.params;
    try {
      const timeline = service.getEvolutionTimeline(userId, guildId);
      res.json({ data: timeline });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to get evolution timeline',
        error: String(error),
      });
    }
  },
};
