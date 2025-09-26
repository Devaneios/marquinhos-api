import { Request, Response } from 'express';
import { MusicalDNAService } from '../services/musicalDNA';

class MusicalDNAController {
  private musicalDNAService: MusicalDNAService;

  constructor() {
    this.musicalDNAService = new MusicalDNAService();
  }

  async generateDNA(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.body;
      
      const musicalDNA = await this.musicalDNAService.generateMusicalDNA(userId, guildId);
      
      return res.status(200).json({ 
        data: musicalDNA, 
        message: 'Musical DNA generated successfully' 
      });
    } catch (error: any) {
      console.error('Error generating musical DNA:', error);
      return res.status(500).json({ message: 'Error generating musical DNA' });
    }
  }

  async calculateCompatibility(req: Request, res: Response) {
    try {
      const { userA, userB, guildId } = req.body;
      
      const compatibility = await this.musicalDNAService.calculateCompatibility(userA, userB, guildId);
      
      return res.status(200).json({ 
        data: { compatibility }, 
        message: 'Compatibility calculated successfully' 
      });
    } catch (error: any) {
      console.error('Error calculating compatibility:', error);
      return res.status(500).json({ message: 'Error calculating musical compatibility' });
    }
  }

  async getMusicalEvolution(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      
      const evolution = await this.musicalDNAService.getMusicalEvolution(userId, guildId);
      
      if (!evolution) {
        return res.status(404).json({ message: 'No evolution data found' });
      }
      
      return res.status(200).json({ 
        data: evolution, 
        message: 'Musical evolution retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting musical evolution:', error);
      return res.status(500).json({ message: 'Error retrieving musical evolution' });
    }
  }

  async getDNAProfile(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      
      const profile = await this.musicalDNAService.generateMusicalDNA(userId, guildId);
      
      return res.status(200).json({ 
        data: profile, 
        message: 'DNA profile retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting DNA profile:', error);
      return res.status(500).json({ message: 'Error retrieving DNA profile' });
    }
  }
}

export default MusicalDNAController;
