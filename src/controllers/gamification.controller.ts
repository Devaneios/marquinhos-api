import { Request, Response } from 'express';
import { GamificationService } from '../services/gamification';

class GamificationController {
  gamificationService: GamificationService;

  constructor() {
    this.gamificationService = new GamificationService();
  }

  async addXP(req: Request, res: Response) {
    try {
      const { userId, guildId, amount } = req.body;
      const userLevel = await this.gamificationService.addXP(userId, guildId, amount);
      return res.status(200).json({ 
        data: userLevel, 
        message: 'XP added successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getUserLevel(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      const userLevel = await this.gamificationService.getUserLevel(userId, guildId);
      return res.status(200).json({ 
        data: userLevel, 
        message: 'User level retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getLeaderboard(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      const leaderboard = await this.gamificationService.getLeaderboard(guildId, limit);
      return res.status(200).json({ 
        data: leaderboard, 
        message: 'Leaderboard retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async unlockAchievement(req: Request, res: Response) {
    try {
      const { userId, guildId, achievementId } = req.body;
      const userAchievement = await this.gamificationService.unlockAchievement(
        userId, 
        guildId, 
        achievementId
      );
      return res.status(200).json({ 
        data: userAchievement, 
        message: 'Achievement unlocked successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getUserAchievements(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      const achievements = await this.gamificationService.getUserAchievements(userId, guildId);
      return res.status(200).json({ 
        data: achievements, 
        message: 'User achievements retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getAllAchievements(req: Request, res: Response) {
    try {
      const achievements = await this.gamificationService.getAllAchievements();
      return res.status(200).json({ 
        data: achievements, 
        message: 'All achievements retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async createAchievement(req: Request, res: Response) {
    try {
      const achievement = await this.gamificationService.createAchievement(req.body);
      return res.status(201).json({ 
        data: achievement, 
        message: 'Achievement created successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async initializeAchievements(req: Request, res: Response) {
    try {
      await this.gamificationService.initializeDefaultAchievements();
      return res.status(200).json({ 
        message: 'Default achievements initialized successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default GamificationController;
