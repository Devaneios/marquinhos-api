import SyncParty from '../schemas/syncParty';
import { ISyncParty } from '../schemas/syncParty';
import { v4 as uuidv4 } from 'uuid';

export class SyncPartyService {
  
  async createSyncParty(data: {
    hostId: string;
    guildId: string;
    channelId: string;
    name: string;
    description?: string;
    settings?: any;
  }): Promise<ISyncParty> {
    
    const syncParty = new SyncParty({
      id: uuidv4(),
      hostId: data.hostId,
      guildId: data.guildId,
      channelId: data.channelId,
      name: data.name,
      description: data.description,
      participants: [{
        userId: data.hostId,
        platform: 'discord',
        joinedAt: new Date(),
        latency: 0
      }],
      playlist: [],
      isActive: true,
      syncSettings: {
        allowVoting: true,
        democraticControl: false,
        crossPlatformSync: true,
        latencyCompensation: true,
        ...data.settings
      },
      chatMessages: []
    });
    
    await syncParty.save();
    return syncParty;
  }
  
  async joinSyncParty(partyId: string, userId: string, platform: string): Promise<ISyncParty | null> {
    const party = await SyncParty.findOne({ id: partyId, isActive: true });
    if (!party) return null;
    
    // Check if user already in party
    const existing = party.participants.find(p => p.userId === userId);
    if (existing) {
      existing.platform = platform;
      existing.joinedAt = new Date();
    } else {
      party.participants.push({
        userId,
        platform,
        joinedAt: new Date(),
        latency: await this.measureLatency(userId, platform)
      });
    }
    
    await party.save();
    return party;
  }
  
  async addTrackToParty(
    partyId: string, 
    userId: string, 
    track: {
      title: string;
      artist: string;
      url: string;
      platformUrls?: Map<string, string>;
    }
  ): Promise<ISyncParty | null> {
    const party = await SyncParty.findOne({ id: partyId, isActive: true });
    if (!party) return null;
    
    // Check if user is participant
    const isParticipant = party.participants.some(p => p.userId === userId);
    if (!isParticipant) return null;
    
    // Find cross-platform URLs for this track
    const platformUrls = await this.findCrossPlatformUrls(track);
    
    party.playlist.push({
      title: track.title,
      artist: track.artist,
      url: track.url,
      platformUrls: platformUrls || new Map(),
      votes: []
    });
    
    await party.save();
    return party;
  }
  
  async voteOnTrack(
    partyId: string,
    userId: string,
    trackIndex: number,
    voteType: 'up' | 'down' | 'next'
  ): Promise<ISyncParty | null> {
    const party = await SyncParty.findOne({ id: partyId, isActive: true });
    if (!party || !party.syncSettings.allowVoting) return null;
    
    const track = party.playlist[trackIndex];
    if (!track) return null;
    
    // Remove existing vote
    track.votes = track.votes.filter(v => v.userId !== userId);
    
    // Add new vote
    track.votes.push({
      userId,
      vote: voteType
    });
    
    // Check for democratic control
    if (party.syncSettings.democraticControl) {
      await this.processDemocraticControl(party, trackIndex);
    }
    
    await party.save();
    return party;
  }
  
  async playNextTrack(partyId: string, requesterId?: string): Promise<ISyncParty | null> {
    const party = await SyncParty.findOne({ id: partyId, isActive: true });
    if (!party) return null;
    
    // Check permissions
    if (requesterId && party.hostId !== requesterId && !party.syncSettings.democraticControl) {
      return null;
    }
    
    if (party.playlist.length === 0) return party;
    
    // Get next track (highest voted if democratic)
    let nextTrackIndex = 0;
    
    if (party.syncSettings.allowVoting) {
      nextTrackIndex = this.getHighestVotedTrack(party.playlist);
    }
    
    const nextTrack = party.playlist[nextTrackIndex];
    
    // Set as current track
    party.currentTrack = {
      title: nextTrack.title,
      artist: nextTrack.artist,
      url: nextTrack.url,
      duration: 180, // Default 3 minutes - would be fetched from service
      startTime: new Date(),
      platformUrls: nextTrack.platformUrls
    };
    
    // Remove from playlist
    party.playlist.splice(nextTrackIndex, 1);
    
    // Send sync signals to all participants
    await this.sendSyncSignals(party);
    
    await party.save();
    return party;
  }
  
  private async sendSyncSignals(party: ISyncParty): Promise<void> {
    // In production, this would send real-time sync signals
    // For now, just calculate sync timing
    
    const syncTimestamp = new Date(Date.now() + 3000); // 3 second countdown
    
    for (const participant of party.participants) {
      // Adjust for participant's latency
      const adjustedStart = new Date(syncTimestamp.getTime() + participant.latency);
      
      // Here you would send WebSocket/real-time message to participant
      // with their specific start time and platform URL
      console.log(`Sync signal for ${participant.userId}: start at ${adjustedStart}`);
    }
  }
  
  private async measureLatency(userId: string, platform: string): Promise<number> {
    // Simulated latency measurement
    // In production, would ping user's connection and platform APIs
    
    const baseLatency = {
      spotify: 200,
      youtube: 300,
      apple: 250,
      discord: 100
    };
    
    return (baseLatency[platform as keyof typeof baseLatency] || 200) + Math.random() * 100;
  }
  
  private async findCrossPlatformUrls(track: any): Promise<Map<string, string>> {
    // Simulated cross-platform search
    // In production, would search across Spotify, YouTube, Apple Music APIs
    
    const platformUrls = new Map<string, string>();
    
    const searchQuery = `${track.artist} ${track.title}`;
    
    // Mock URLs - in production would be real API responses
    platformUrls.set('spotify', `spotify:track:${uuidv4()}`);
    platformUrls.set('youtube', `https://youtube.com/watch?v=${uuidv4().slice(0, 11)}`);
    platformUrls.set('apple', `https://music.apple.com/track/${uuidv4()}`);
    
    return platformUrls;
  }
  
  private async processDemocraticControl(party: ISyncParty, trackIndex: number): Promise<void> {
    const track = party.playlist[trackIndex];
    const participantCount = party.participants.length;
    
    // Count votes
    const upVotes = track.votes.filter(v => v.vote === 'up').length;
    const downVotes = track.votes.filter(v => v.vote === 'down').length;
    const nextVotes = track.votes.filter(v => v.vote === 'next').length;
    
    // Democratic thresholds
    const majorityThreshold = Math.ceil(participantCount / 2);
    
    if (nextVotes >= majorityThreshold && party.currentTrack) {
      // Skip current track
      await this.playNextTrack(party.id);
    } else if (downVotes >= majorityThreshold) {
      // Remove track from playlist
      party.playlist.splice(trackIndex, 1);
    }
  }
  
  private getHighestVotedTrack(playlist: any[]): number {
    let highestIndex = 0;
    let highestScore = -Infinity;
    
    playlist.forEach((track, index) => {
      const upVotes = track.votes.filter((v: any) => v.vote === 'up').length;
      const downVotes = track.votes.filter((v: any) => v.vote === 'down').length;
      const score = upVotes - downVotes;
      
      if (score > highestScore) {
        highestScore = score;
        highestIndex = index;
      }
    });
    
    return highestIndex;
  }
  
  async addChatMessage(
    partyId: string,
    userId: string,
    message: string
  ): Promise<ISyncParty | null> {
    const party = await SyncParty.findOne({ id: partyId, isActive: true });
    if (!party) return null;
    
    party.chatMessages.push({
      userId,
      message,
      timestamp: new Date(),
      reactions: []
    });
    
    // Keep only last 100 messages
    if (party.chatMessages.length > 100) {
      party.chatMessages = party.chatMessages.slice(-100);
    }
    
    await party.save();
    return party;
  }
  
  async addReactionToMessage(
    partyId: string,
    messageIndex: number,
    reaction: string
  ): Promise<ISyncParty | null> {
    const party = await SyncParty.findOne({ id: partyId, isActive: true });
    if (!party) return null;
    
    const message = party.chatMessages[messageIndex];
    if (!message) return null;
    
    if (!message.reactions.includes(reaction)) {
      message.reactions.push(reaction);
    }
    
    await party.save();
    return party;
  }
  
  async getSyncPartyStats(partyId: string): Promise<any> {
    const party = await SyncParty.findOne({ id: partyId });
    if (!party) return null;
    
    const stats = {
      totalParticipants: party.participants.length,
      tracksPlayed: party.chatMessages.filter(m => m.message.includes('🎵')).length,
      averageLatency: party.participants.reduce((sum, p) => sum + p.latency, 0) / party.participants.length,
      totalVotes: party.playlist.reduce((sum, track) => sum + track.votes.length, 0),
      chatActivity: party.chatMessages.length,
      duration: party.currentTrack ? new Date().getTime() - party.createdAt.getTime() : 0,
      platformDistribution: this.calculatePlatformDistribution(party.participants)
    };
    
    return stats;
  }
  
  private calculatePlatformDistribution(participants: any[]): any {
    const distribution: { [key: string]: number } = {};
    
    participants.forEach(p => {
      distribution[p.platform] = (distribution[p.platform] || 0) + 1;
    });
    
    return distribution;
  }
  
  async endSyncParty(partyId: string, hostId: string): Promise<boolean> {
    const party = await SyncParty.findOne({ id: partyId });
    if (!party || party.hostId !== hostId) return false;
    
    party.isActive = false;
    await party.save();
    
    return true;
  }
  
  async getActiveSyncParties(guildId: string): Promise<ISyncParty[]> {
    return await SyncParty.find({ guildId, isActive: true })
      .sort({ createdAt: -1 });
  }
}
