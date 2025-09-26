import { Request, Response } from 'express';
import { SyncPartyService } from '../services/syncParty';

class SyncPartyController {
  private syncPartyService: SyncPartyService;

  constructor() {
    this.syncPartyService = new SyncPartyService();
  }

  async createParty(req: Request, res: Response) {
    try {
      const { hostId, guildId, channelId, name, description, settings } = req.body;
      
      const party = await this.syncPartyService.createSyncParty({
        hostId,
        guildId,
        channelId,
        name,
        description,
        settings
      });
      
      return res.status(201).json({ 
        data: party, 
        message: 'Sync party created successfully' 
      });
    } catch (error: any) {
      console.error('Error creating sync party:', error);
      return res.status(500).json({ message: 'Error creating sync party' });
    }
  }

  async joinParty(req: Request, res: Response) {
    try {
      const { partyId } = req.params;
      const { userId, platform } = req.body;
      
      const party = await this.syncPartyService.joinSyncParty(partyId, userId, platform);
      
      if (!party) {
        return res.status(404).json({ message: 'Sync party not found or inactive' });
      }
      
      return res.status(200).json({ 
        data: party, 
        message: 'Joined sync party successfully' 
      });
    } catch (error: any) {
      console.error('Error joining sync party:', error);
      return res.status(500).json({ message: 'Error joining sync party' });
    }
  }

  async addTrack(req: Request, res: Response) {
    try {
      const { partyId } = req.params;
      const { userId, track } = req.body;
      
      const party = await this.syncPartyService.addTrackToParty(partyId, userId, track);
      
      if (!party) {
        return res.status(404).json({ message: 'Sync party not found or user not participant' });
      }
      
      return res.status(200).json({ 
        data: party, 
        message: 'Track added to party successfully' 
      });
    } catch (error: any) {
      console.error('Error adding track to party:', error);
      return res.status(500).json({ message: 'Error adding track to party' });
    }
  }

  async voteTrack(req: Request, res: Response) {
    try {
      const { partyId } = req.params;
      const { userId, trackIndex, voteType } = req.body;
      
      const party = await this.syncPartyService.voteOnTrack(partyId, userId, trackIndex, voteType);
      
      if (!party) {
        return res.status(404).json({ message: 'Sync party not found or voting disabled' });
      }
      
      return res.status(200).json({ 
        data: party, 
        message: 'Vote recorded successfully' 
      });
    } catch (error: any) {
      console.error('Error voting on track:', error);
      return res.status(500).json({ message: 'Error recording vote' });
    }
  }

  async playNext(req: Request, res: Response) {
    try {
      const { partyId } = req.params;
      const { requesterId } = req.body;
      
      const party = await this.syncPartyService.playNextTrack(partyId, requesterId);
      
      if (!party) {
        return res.status(403).json({ message: 'Unauthorized to control playback or party not found' });
      }
      
      return res.status(200).json({ 
        data: party, 
        message: 'Next track started successfully' 
      });
    } catch (error: any) {
      console.error('Error playing next track:', error);
      return res.status(500).json({ message: 'Error playing next track' });
    }
  }

  async addChatMessage(req: Request, res: Response) {
    try {
      const { partyId } = req.params;
      const { userId, message } = req.body;
      
      const party = await this.syncPartyService.addChatMessage(partyId, userId, message);
      
      if (!party) {
        return res.status(404).json({ message: 'Sync party not found' });
      }
      
      return res.status(200).json({ 
        data: party, 
        message: 'Chat message added successfully' 
      });
    } catch (error: any) {
      console.error('Error adding chat message:', error);
      return res.status(500).json({ message: 'Error adding chat message' });
    }
  }

  async getPartyStats(req: Request, res: Response) {
    try {
      const { partyId } = req.params;
      
      const stats = await this.syncPartyService.getSyncPartyStats(partyId);
      
      if (!stats) {
        return res.status(404).json({ message: 'Sync party not found' });
      }
      
      return res.status(200).json({ 
        data: stats, 
        message: 'Party stats retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting party stats:', error);
      return res.status(500).json({ message: 'Error retrieving party stats' });
    }
  }

  async endParty(req: Request, res: Response) {
    try {
      const { partyId } = req.params;
      const { hostId } = req.body;
      
      const success = await this.syncPartyService.endSyncParty(partyId, hostId);
      
      if (!success) {
        return res.status(403).json({ message: 'Unauthorized to end party or party not found' });
      }
      
      return res.status(200).json({ message: 'Sync party ended successfully' });
    } catch (error: any) {
      console.error('Error ending sync party:', error);
      return res.status(500).json({ message: 'Error ending sync party' });
    }
  }

  async getActiveParties(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      
      const parties = await this.syncPartyService.getActiveSyncParties(guildId);
      
      return res.status(200).json({ 
        data: parties, 
        message: 'Active sync parties retrieved successfully' 
      });
    } catch (error: any) {
      console.error('Error getting active parties:', error);
      return res.status(500).json({ message: 'Error retrieving active parties' });
    }
  }
}

export default SyncPartyController;
