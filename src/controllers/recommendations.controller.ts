import { Request, Response } from 'express';
import { RecommendationService } from '../services/recommendations';

class RecommendationsController {
  recommendationService: RecommendationService;

  constructor() {
    this.recommendationService = new RecommendationService();
  }

  async getPersonalizedRecommendations(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const recommendations = await this.recommendationService.getPersonalizedRecommendations(
        userId, 
        guildId, 
        limit
      );
      
      return res.status(200).json({ 
        data: recommendations, 
        message: 'Personalized recommendations retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getRecommendationsByGenre(req: Request, res: Response) {
    try {
      const { genre, guildId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const recommendations = await this.recommendationService.getRecommendationsByGenre(
        genre, 
        guildId, 
        limit
      );
      
      return res.status(200).json({ 
        data: recommendations, 
        message: 'Genre-based recommendations retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getRecommendationsByTime(req: Request, res: Response) {
    try {
      const { userId, guildId, timeOfDay } = req.params;
      
      if (!['morning', 'afternoon', 'evening', 'night'].includes(timeOfDay)) {
        return res.status(400).json({ message: 'Invalid time of day' });
      }
      
      const recommendations = await this.recommendationService.getRecommendationsByTime(
        userId, 
        guildId, 
        timeOfDay as any
      );
      
      return res.status(200).json({ 
        data: recommendations, 
        message: 'Time-based recommendations retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getCollaborativeRecommendations(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      
      const recommendations = await this.recommendationService.getCollaborativeRecommendations(
        userId, 
        guildId
      );
      
      return res.status(200).json({ 
        data: recommendations, 
        message: 'Collaborative recommendations retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async updateUserProfile(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      const { track } = req.body;
      
      await this.recommendationService.updateUserMusicProfile(userId, guildId, track);
      
      return res.status(200).json({ 
        message: 'User music profile updated successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default RecommendationsController;
