import { Request, Response } from 'express';
import { EvolutiveAchievementsService } from '../services/evolutiveAchievements';

class EvolutiveAchievementsController {
  private evolutiveAchievementsService: EvolutiveAchievementsService;

  constructor() {
    this.evolutiveAchievementsService = new EvolutiveAchievementsService();
  }

  async initializeAchievement(req: Request, res: Response) {
    try {
      const { userId, guildId, baseId, triggerEvent } = req.body;
      
      const achievement = await this.evolutiveAchievementsService.initializeEvolutiveAchievement(
        userId,
        guildId,
        baseId,
        triggerEvent
      );
      
      if (!achievement) {
        return res.status(400).json({ message: 'Achievement already exists or invalid base ID' });
      }
      
      return res.status(201).json({ 
        data: achievement, 
        message: 'Evolutive achievement initialized successfully' 
      });
    } catch (error: any) {
      console.error('Error initializing achievement:', error);
      return res.status(500).json({ message: 'Error initializing evolutive achievement' });
    }
  }

  async checkEvolution(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      const { triggerData } = req.body;
      
      const evolvedAchievements = await this.evolutiveAchievementsService.checkAndEvolveAchievement(
        userId,
        guildId,
        triggerData
      );
      
      return res.status(200).json({ 
        data: evolvedAchievements, 
        message: 'Evolution check completed successfully' 
      });
    } catch (error: any) {
      console.error('Error checking evolution:', error);
      return res.status(500).json({ message: 'Error checking achievement evolution' });
    }
  }

  async getEvolutionTimeline(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      
      const timeline = await this.evolutiveAchievementsService.getEvolutionTimeline(userId, guildId);
      
      return res.status(200).json({ 
        data: timeline, 
        message: 'Evolution timeline retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting evolution timeline:', error);
      return res.status(500).json({ message: 'Error retrieving evolution timeline' });
    }
  }

  async discoverMystery(req: Request, res: Response) {
    try {
      const { achievementId } = req.params;
      const { discoveredBy, clue } = req.body;
      
      const success = await this.evolutiveAchievementsService.discoverMysteryAchievement(
        achievementId,
        discoveredBy,
        clue
      );
      
      if (!success) {
        return res.status(400).json({ message: 'Achievement not found or already discovered' });
      }
      
      return res.status(200).json({ 
        message: 'Mystery achievement discovered successfully' 
      });
    } catch (error: any) {
      console.error('Error discovering mystery achievement:', error);
      return res.status(500).json({ message: 'Error discovering mystery achievement' });
    }
  }

  async createCollaborative(req: Request, res: Response) {
    try {
      const { name, description, requiredPartners, groupObjective, guildId } = req.body;
      
      const collaborativeId = await this.evolutiveAchievementsService.createCollaborativeAchievement({
        name,
        description,
        requiredPartners,
        groupObjective,
        guildId
      });
      
      return res.status(201).json({ 
        data: { collaborativeId }, 
        message: 'Collaborative achievement created successfully' 
      });
    } catch (error: any) {
      console.error('Error creating collaborative achievement:', error);
      return res.status(500).json({ message: 'Error creating collaborative achievement' });
    }
  }
}

export default EvolutiveAchievementsController;
