import { Request, Response } from 'express';
import { PlaylistService } from '../services/playlist';

class PlaylistController {
  playlistService: PlaylistService;

  constructor() {
    this.playlistService = new PlaylistService();
  }

  async createPlaylist(req: Request, res: Response) {
    try {
      const { name, description, creatorId, guildId, isCollaborative } = req.body;
      const playlist = await this.playlistService.createPlaylist({
        name,
        description,
        creatorId,
        guildId,
        isCollaborative
      });
      return res.status(201).json({ 
        data: playlist, 
        message: 'Playlist created successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getPlaylist(req: Request, res: Response) {
    try {
      const { playlistId } = req.params;
      const playlist = await this.playlistService.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      return res.status(200).json({ 
        data: playlist, 
        message: 'Playlist retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getUserPlaylists(req: Request, res: Response) {
    try {
      const { userId, guildId } = req.params;
      const playlists = await this.playlistService.getUserPlaylists(userId, guildId);
      return res.status(200).json({ 
        data: playlists, 
        message: 'User playlists retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getGuildPlaylists(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const playlists = await this.playlistService.getGuildPlaylists(guildId, limit);
      return res.status(200).json({ 
        data: playlists, 
        message: 'Guild playlists retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async addTrack(req: Request, res: Response) {
    try {
      const { playlistId } = req.params;
      const { userId, track } = req.body;
      const playlist = await this.playlistService.addTrackToPlaylist(playlistId, userId, track);
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      return res.status(200).json({ 
        data: playlist, 
        message: 'Track added successfully' 
      });
    } catch (error: any) {
      if (error.message === 'Permission denied') {
        return res.status(403).json({ message: 'Permission denied' });
      }
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async removeTrack(req: Request, res: Response) {
    try {
      const { playlistId, trackIndex } = req.params;
      const { userId } = req.body;
      const playlist = await this.playlistService.removeTrackFromPlaylist(
        playlistId, 
        parseInt(trackIndex), 
        userId
      );
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist or track not found' });
      }
      return res.status(200).json({ 
        data: playlist, 
        message: 'Track removed successfully' 
      });
    } catch (error: any) {
      if (error.message === 'Permission denied') {
        return res.status(403).json({ message: 'Permission denied' });
      }
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async voteTrack(req: Request, res: Response) {
    try {
      const { playlistId, trackIndex } = req.params;
      const { userId, voteType } = req.body;
      const playlist = await this.playlistService.voteTrack(
        playlistId, 
        parseInt(trackIndex), 
        userId, 
        voteType
      );
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist or track not found' });
      }
      return res.status(200).json({ 
        data: playlist, 
        message: 'Vote registered successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async followPlaylist(req: Request, res: Response) {
    try {
      const { playlistId } = req.params;
      const { userId } = req.body;
      const playlist = await this.playlistService.followPlaylist(playlistId, userId);
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      return res.status(200).json({ 
        data: playlist, 
        message: 'Playlist followed successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async unfollowPlaylist(req: Request, res: Response) {
    try {
      const { playlistId } = req.params;
      const { userId } = req.body;
      const playlist = await this.playlistService.unfollowPlaylist(playlistId, userId);
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      return res.status(200).json({ 
        data: playlist, 
        message: 'Playlist unfollowed successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async deletePlaylist(req: Request, res: Response) {
    try {
      const { playlistId } = req.params;
      const { userId } = req.body;
      const success = await this.playlistService.deletePlaylist(playlistId, userId);
      if (!success) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      return res.status(200).json({ 
        message: 'Playlist deleted successfully' 
      });
    } catch (error: any) {
      if (error.message === 'Permission denied') {
        return res.status(403).json({ message: 'Permission denied' });
      }
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async getPopularTracks(req: Request, res: Response) {
    try {
      const { guildId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      const popularTracks = await this.playlistService.getPopularTracks(guildId, limit);
      return res.status(200).json({ 
        data: popularTracks, 
        message: 'Popular tracks retrieved successfully' 
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default PlaylistController;
