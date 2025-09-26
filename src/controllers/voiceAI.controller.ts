import { Request, Response } from 'express';
import { VoiceAIService } from '../services/voiceAI';

class VoiceAIController {
  private voiceAIService: VoiceAIService;

  constructor() {
    this.voiceAIService = new VoiceAIService();
  }

  async analyzeVoice(req: Request, res: Response) {
    try {
      const { userId, sessionId, guildId, audioBuffer, referenceTrack } = req.body;
      
      const analysis = await this.voiceAIService.analyzeVoiceData({
        userId,
        sessionId,
        guildId,
        audioBuffer,
        referenceTrack
      });
      
      return res.status(200).json({ 
        data: analysis, 
        message: 'Voice analysis completed successfully' 
      });
    } catch (error: any) {
      console.error('Error analyzing voice:', error);
      return res.status(500).json({ message: 'Error analyzing voice data' });
    }
  }

  async getVoiceProgress(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      
      const progress = await this.voiceAIService.getVoiceProgress(userId, guildId);
      
      if (!progress) {
        return res.status(404).json({ message: 'No voice progress data found' });
      }
      
      return res.status(200).json({ 
        data: progress, 
        message: 'Voice progress retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting voice progress:', error);
      return res.status(500).json({ message: 'Error retrieving voice progress' });
    }
  }

  async generateVocalExercises(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      
      const exercises = await this.voiceAIService.generatePersonalizedVocalExercises(userId, guildId);
      
      return res.status(200).json({ 
        data: exercises, 
        message: 'Vocal exercises generated successfully' 
      });
    } catch (error: any) {
      console.error('Error generating vocal exercises:', error);
      return res.status(500).json({ message: 'Error generating vocal exercises' });
    }
  }
}

export default VoiceAIController;
