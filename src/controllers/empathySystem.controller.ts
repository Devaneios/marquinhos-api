import { Request, Response } from 'express';
import { EmpathySystemService } from '../services/empathySystem';

class EmpathySystemController {
  private empathySystemService: EmpathySystemService;

  constructor() {
    this.empathySystemService = new EmpathySystemService();
  }

  async analyzeGuild(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      
      const analysis = await this.empathySystemService.analyzeGuildEmpathy(guildId);
      
      return res.status(200).json({ 
        data: analysis, 
        message: 'Guild empathy analysis completed successfully' 
      });
    } catch (error: any) {
      console.error('Error analyzing guild empathy:', error);
      return res.status(500).json({ message: 'Error analyzing guild empathy' });
    }
  }

  async getInterventionRecommendations(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      
      const interventions = await this.empathySystemService.recommendIntervention(guildId);
      
      return res.status(200).json({ 
        data: interventions, 
        message: 'Intervention recommendations retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting intervention recommendations:', error);
      return res.status(500).json({ message: 'Error retrieving intervention recommendations' });
    }
  }

  async executeIntervention(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      const { type, targetUsers, description } = req.body;
      
      const success = await this.empathySystemService.executeIntervention(guildId, {
        type,
        targetUsers,
        description
      });
      
      if (!success) {
        return res.status(404).json({ message: 'Guild empathy system not found' });
      }
      
      return res.status(200).json({ 
        message: 'Intervention executed successfully' 
      });
    } catch (error: any) {
      console.error('Error executing intervention:', error);
      return res.status(500).json({ message: 'Error executing intervention' });
    }
  }

  async getEmpathyInsights(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      
      const insights = await this.empathySystemService.getEmpathyInsights(guildId);
      
      if (!insights) {
        return res.status(404).json({ message: 'No empathy insights found for this guild' });
      }
      
      return res.status(200).json({ 
        data: insights, 
        message: 'Empathy insights retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting empathy insights:', error);
      return res.status(500).json({ message: 'Error retrieving empathy insights' });
    }
  }
}

export default EmpathySystemController;
