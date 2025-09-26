import { v4 as uuidv4 } from 'uuid';
import KaraokeSession from '../schemas/karaokeSession';
import { IKaraokeSession } from '../types';

export class KaraokeService {
  
  async createKaraokeSession(data: {
    guildId: string;
    channelId: string;
    hostId: string;
  }): Promise<IKaraokeSession> {
    const session = new KaraokeSession({
      id: uuidv4(),
      guildId: data.guildId,
      channelId: data.channelId,
      hostId: data.hostId,
      participants: [data.hostId],
      scores: new Map(),
      isActive: true
    });
    
    return await session.save();
  }
  
  async getKaraokeSession(sessionId: string): Promise<IKaraokeSession | null> {
    return await KaraokeSession.findOne({ id: sessionId });
  }
  
  async getActiveSession(guildId: string, channelId: string): Promise<IKaraokeSession | null> {
    return await KaraokeSession.findOne({ 
      guildId, 
      channelId, 
      isActive: true 
    });
  }
  
  async joinKaraokeSession(sessionId: string, userId: string): Promise<IKaraokeSession | null> {
    const session = await KaraokeSession.findOne({ id: sessionId });
    if (!session) return null;
    
    if (!session.participants.includes(userId)) {
      session.participants.push(userId);
      session.scores[userId] = 0;
      await session.save();
    }
    
    return session;
  }
  
  async leaveKaraokeSession(sessionId: string, userId: string): Promise<IKaraokeSession | null> {
    const session = await KaraokeSession.findOne({ id: sessionId });
    if (!session) return null;
    
    session.participants = session.participants.filter(p => p !== userId);
    session.scores[userId] = 0;
    
    // If host leaves, transfer to another participant or end session
    if (session.hostId === userId) {
      if (session.participants.length > 0) {
        session.hostId = session.participants[0];
      } else {
        session.isActive = false;
      }
    }
    
    await session.save();
    return session;
  }
  
  async setCurrentTrack(sessionId: string, hostId: string, track: {
    title: string;
    artist: string;
    lyrics?: string[];
  }): Promise<IKaraokeSession | null> {
    const session = await KaraokeSession.findOne({ id: sessionId });
    if (!session || session.hostId !== hostId) return null;
    
    // Try to get lyrics if not provided
    let lyrics = track.lyrics || [];
    if (lyrics.length === 0) {
      lyrics = await this.fetchLyrics(track.artist, track.title);
    }
    
    session.currentTrack = {
      title: track.title,
      artist: track.artist,
      lyrics: lyrics,
      duration: 180 // Default 3 minutes
    };
    
    // Reset scores for new song
    session.participants.forEach(participantId => {
      session.scores[participantId] = 0;
    });
    
    await session.save();
    return session;
  }
  
  async updateScore(sessionId: string, userId: string, score: number): Promise<IKaraokeSession | null> {
    const session = await KaraokeSession.findOne({ id: sessionId });
    if (!session) return null;
    
    const currentScore = session.scores[userId] || 0;
    session.scores[userId] = Math.max(currentScore, score);
    
    await session.save();
    return session;
  }
  
  async endKaraokeSession(sessionId: string, hostId: string): Promise<boolean> {
    const session = await KaraokeSession.findOne({ id: sessionId });
    if (!session || session.hostId !== hostId) return false;
    
    session.isActive = false;
    await session.save();
    return true;
  }
  
  async getSessionLeaderboard(sessionId: string): Promise<any[]> {
    const session = await KaraokeSession.findOne({ id: sessionId });
    if (!session) return [];
    
    const leaderboard = Object.entries(session.scores)
      .map(([userId, score]) => ({ userId, score }))
      .sort((a, b) => b.score - a.score);
    
    return leaderboard;
  }
  
  async getUserKaraokeStats(userId: string, guildId: string): Promise<any> {
    const sessions = await KaraokeSession.find({
      guildId,
      participants: userId,
      isActive: false
    });
    
    let totalSessions = sessions.length;
    let totalScore = 0;
    let bestScore = 0;
    let songsPerformed = 0;
    
    sessions.forEach(session => {
      const userScore = session.scores[userId] || 0;
      totalScore += userScore;
      bestScore = Math.max(bestScore, userScore);
      if (userScore > 0) songsPerformed++;
    });
    
    return {
      totalSessions,
      totalScore,
      averageScore: totalSessions > 0 ? Math.round(totalScore / totalSessions) : 0,
      bestScore,
      songsPerformed
    };
  }
  
  private async fetchLyrics(artist: string, title: string): Promise<string[]> {
    try {
      // This is a simplified example. In production, you'd use services like:
      // - Genius API
      // - Musixmatch API
      // - LyricFind API
      
      // Mock lyrics for demo
      const mockLyrics = [
        `♪ ${title} by ${artist} ♪`,
        "",
        "Verse 1:",
        "This is a sample lyric line",
        "Another line of the song",
        "",
        "Chorus:",
        "This is the chorus part",
        "Sing along with the beat",
        "",
        "Verse 2:",
        "Second verse continues here",
        "Building up to the end"
      ];
      
      return mockLyrics;
    } catch (error) {
      console.error('Failed to fetch lyrics:', error);
      return [`♪ ${title} by ${artist} ♪`, "", "Lyrics not available"];
    }
  }
  
  async getGuildKaraokeStats(guildId: string): Promise<any> {
    const sessions = await KaraokeSession.find({ guildId, isActive: false });
    
    const userStats = new Map();
    const songStats = new Map();
    
    sessions.forEach(session => {
      // User stats
      session.participants.forEach(userId => {
        const score = session.scores[userId] || 0;
        const current = userStats.get(userId) || { sessions: 0, totalScore: 0, bestScore: 0 };
        current.sessions++;
        current.totalScore += score;
        current.bestScore = Math.max(current.bestScore, score);
        userStats.set(userId, current);
      });
      
      // Song stats
      if (session.currentTrack) {
        const songKey = `${session.currentTrack.artist} - ${session.currentTrack.title}`;
        const songCount = songStats.get(songKey) || 0;
        songStats.set(songKey, songCount + 1);
      }
    });
    
    const topUsers = Array.from(userStats.entries())
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        averageScore: Math.round(stats.totalScore / stats.sessions)
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 10);
    
    const popularSongs = Array.from(songStats.entries())
      .map(([song, count]) => ({ song, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      totalSessions: sessions.length,
      topUsers,
      popularSongs
    };
  }
}
