import { Request, Response } from 'express';
import { KaraokeService } from '../services/karaoke';

class KaraokeController {
  karaokeService: KaraokeService;

  constructor() {
    this.karaokeService = new KaraokeService();
  }

  async createSession(req: Request, res: Response) {
    try {
      const { guildId, channelId, hostId } = req.body;
      const session = await this.karaokeService.createKaraokeSession({
        guildId,
        channelId,
        hostId
      });
      return res.status(201).json({ 
        data: session, 
        message: 'Karaoke session created successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const session = await this.karaokeService.getKaraokeSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Karaoke session not found' });
      }
      return res.status(200).json({ 
        data: session, 
        message: 'Karaoke session retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getActiveSession(req: Request, res: Response) {
    try {
      const { guildId, channelId } = req.params;
      const session = await this.karaokeService.getActiveSession(guildId, channelId);
      return res.status(200).json({ 
        data: session, 
        message: 'Active session retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async joinSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { userId } = req.body;
      const session = await this.karaokeService.joinKaraokeSession(sessionId, userId);
      if (!session) {
        return res.status(404).json({ message: 'Karaoke session not found' });
      }
      return res.status(200).json({ 
        data: session, 
        message: 'Joined karaoke session successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async leaveSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { userId } = req.body;
      const session = await this.karaokeService.leaveKaraokeSession(sessionId, userId);
      if (!session) {
        return res.status(404).json({ message: 'Karaoke session not found' });
      }
      return res.status(200).json({ 
        data: session, 
        message: 'Left karaoke session successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async setCurrentTrack(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { hostId, track } = req.body;
      const session = await this.karaokeService.setCurrentTrack(sessionId, hostId, track);
      if (!session) {
        return res.status(404).json({ message: 'Karaoke session not found or permission denied' });
      }
      return res.status(200).json({ 
        data: session, 
        message: 'Current track set successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async updateScore(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { userId, score } = req.body;
      const session = await this.karaokeService.updateScore(sessionId, userId, score);
      if (!session) {
        return res.status(404).json({ message: 'Karaoke session not found' });
      }
      return res.status(200).json({ 
        data: session, 
        message: 'Score updated successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async endSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { hostId } = req.body;
      const success = await this.karaokeService.endKaraokeSession(sessionId, hostId);
      if (!success) {
        return res.status(404).json({ message: 'Karaoke session not found or permission denied' });
      }
      return res.status(200).json({ 
        message: 'Karaoke session ended successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getLeaderboard(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const leaderboard = await this.karaokeService.getSessionLeaderboard(sessionId);
      return res.status(200).json({ 
        data: leaderboard, 
        message: 'Leaderboard retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getUserStats(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      const stats = await this.karaokeService.getUserKaraokeStats(userId, guildId);
      return res.status(200).json({ 
        data: stats, 
        message: 'User karaoke stats retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getGuildStats(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      const stats = await this.karaokeService.getGuildKaraokeStats(guildId);
      return res.status(200).json({ 
        data: stats, 
        message: 'Guild karaoke stats retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default KaraokeController;
