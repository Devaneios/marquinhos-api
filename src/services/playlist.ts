import { v4 as uuidv4 } from 'uuid';
import Playlist from '../schemas/playlist';
import { IPlaylist } from '../types';

export class PlaylistService {
  
  async createPlaylist(data: {
    name: string;
    description?: string;
    creatorId: string;
    guildId: string;
    isCollaborative?: boolean;
  }): Promise<IPlaylist> {
    const playlist = new Playlist({
      id: uuidv4(),
      name: data.name,
      description: data.description,
      creatorId: data.creatorId,
      guildId: data.guildId,
      isCollaborative: data.isCollaborative || false,
      tracks: [],
      followers: [data.creatorId]
    });
    
    return await playlist.save();
  }
  
  async getPlaylist(playlistId: string): Promise<IPlaylist | null> {
    return await Playlist.findOne({ id: playlistId });
  }
  
  async getUserPlaylists(userId: string, guildId: string): Promise<IPlaylist[]> {
    return await Playlist.find({ 
      guildId,
      $or: [
        { creatorId: userId },
        { followers: userId }
      ]
    }).sort({ updatedAt: -1 });
  }
  
  async getGuildPlaylists(guildId: string, limit: number = 20): Promise<IPlaylist[]> {
    return await Playlist.find({ guildId })
      .sort({ updatedAt: -1 })
      .limit(limit);
  }
  
  async addTrackToPlaylist(
    playlistId: string, 
    userId: string,
    track: {
      title: string;
      artist: string;
      url: string;
    }
  ): Promise<IPlaylist | null> {
    const playlist = await Playlist.findOne({ id: playlistId });
    if (!playlist) return null;
    
    // Check permissions
    if (!playlist.isCollaborative && playlist.creatorId !== userId) {
      throw new Error('Permission denied');
    }
    
    playlist.tracks.push({
      title: track.title,
      artist: track.artist,
      url: track.url,
      addedBy: userId,
      addedAt: new Date(),
      votes: 0,
      voters: []
    });
    
    playlist.updatedAt = new Date();
    return await playlist.save();
  }
  
  async removeTrackFromPlaylist(
    playlistId: string,
    trackIndex: number,
    userId: string
  ): Promise<IPlaylist | null> {
    const playlist = await Playlist.findOne({ id: playlistId });
    if (!playlist) return null;
    
    const track = playlist.tracks[trackIndex];
    if (!track) return null;
    
    // Check permissions
    if (playlist.creatorId !== userId && track.addedBy !== userId) {
      throw new Error('Permission denied');
    }
    
    playlist.tracks.splice(trackIndex, 1);
    playlist.updatedAt = new Date();
    return await playlist.save();
  }
  
  async voteTrack(
    playlistId: string,
    trackIndex: number,
    userId: string,
    voteType: 'up' | 'down'
  ): Promise<IPlaylist | null> {
    const playlist = await Playlist.findOne({ id: playlistId });
    if (!playlist) return null;
    
    const track = playlist.tracks[trackIndex];
    if (!track) return null;
    
    const hasVoted = track.voters.includes(userId);
    
    if (hasVoted) {
      // Remove vote
      track.voters = track.voters.filter((voter: any) => voter !== userId);
      track.votes += voteType === 'up' ? -1 : 1;
    } else {
      // Add vote
      track.voters.push(userId);
      track.votes += voteType === 'up' ? 1 : -1;
    }
    
    return await playlist.save();
  }
  
  async followPlaylist(playlistId: string, userId: string): Promise<IPlaylist | null> {
    const playlist = await Playlist.findOne({ id: playlistId });
    if (!playlist) return null;
    
    if (!playlist.followers.includes(userId)) {
      playlist.followers.push(userId);
      await playlist.save();
    }
    
    return playlist;
  }
  
  async unfollowPlaylist(playlistId: string, userId: string): Promise<IPlaylist | null> {
    const playlist = await Playlist.findOne({ id: playlistId });
    if (!playlist) return null;
    
    playlist.followers = playlist.followers.filter((follower: any) => follower !== userId);
    await playlist.save();
    
    return playlist;
  }
  
  async deletePlaylist(playlistId: string, userId: string): Promise<boolean> {
    const playlist = await Playlist.findOne({ id: playlistId });
    if (!playlist) return false;
    
    if (playlist.creatorId !== userId) {
      throw new Error('Permission denied');
    }
    
    await Playlist.deleteOne({ id: playlistId });
    return true;
  }
  
  async getPopularTracks(guildId: string, limit: number = 10): Promise<any[]> {
    const playlists = await Playlist.find({ guildId });
    const trackCounts = new Map();
    
    playlists.forEach(playlist => {
      playlist.tracks.forEach(track => {
        const key = `${track.artist} - ${track.title}`;
        const current = trackCounts.get(key) || { 
          artist: track.artist, 
          title: track.title, 
          count: 0, 
          totalVotes: 0 
        };
        current.count++;
        current.totalVotes += track.votes;
        trackCounts.set(key, current);
      });
    });
    
    return Array.from(trackCounts.values())
      .sort((a, b) => b.count - a.count || b.totalVotes - a.totalVotes)
      .slice(0, limit);
  }
}
