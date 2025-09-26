import { Request, Response } from 'express';
import { MusicTherapistService } from '../services/musicTherapist';

class MusicTherapistController {
  private musicTherapistService: MusicTherapistService;

  constructor() {
    this.musicTherapistService = new MusicTherapistService();
  }

  async startSession(req: Request, res: Response) {
    try {
      const { userId, guildId, mood, energy, stress, focus, context, description, goals } = req.body;
      
      const session = await this.musicTherapistService.startTherapySession({
        userId,
        guildId,
        mood,
        energy,
        stress,
        focus,
        context,
        description,
        goals
      });
      
      return res.status(201).json({ 
        data: session, 
        message: 'Therapy session started successfully' 
      });
    } catch (error: any) {
      console.error('Error starting therapy session:', error);
      return res.status(500).json({ message: 'Error starting therapy session' });
    }
  }

  async updateProgress(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { currentMood, trackPlaying, biometricData } = req.body;
      
      const session = await this.musicTherapistService.updateSessionProgress(sessionId, {
        currentMood,
        trackPlaying,
        biometricData
      });
      
      if (!session) {
        return res.status(404).json({ message: 'Therapy session not found' });
      }
      
      return res.status(200).json({ 
        data: session, 
        message: 'Session progress updated successfully' 
      });
    } catch (error: any) {
      console.error('Error updating session progress:', error);
      return res.status(500).json({ message: 'Error updating session progress' });
    }
  }

  async endSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { mood, energy, stress, focus, satisfaction, notes } = req.body;
      
      const session = await this.musicTherapistService.endTherapySession(sessionId, {
        mood,
        energy,
        stress,
        focus,
        satisfaction,
        notes
      });
      
      if (!session) {
        return res.status(404).json({ message: 'Therapy session not found' });
      }
      
      return res.status(200).json({ 
        data: session, 
        message: 'Therapy session ended successfully' 
      });
    } catch (error: any) {
      console.error('Error ending therapy session:', error);
      return res.status(500).json({ message: 'Error ending therapy session' });
    }
  }

  async getInsights(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      
      const insights = await this.musicTherapistService.getTherapyInsights(userId, guildId);
      
      if (!insights) {
        return res.status(404).json({ message: 'No therapy insights found' });
      }
      
      return res.status(200).json({ 
        data: insights, 
        message: 'Therapy insights retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting therapy insights:', error);
      return res.status(500).json({ message: 'Error retrieving therapy insights' });
    }
  }
}

export default MusicTherapistController;
