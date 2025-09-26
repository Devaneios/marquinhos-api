import Playlist from '../schemas/playlist';
import Scrobble from '../schemas/scrobble';
import UserStats from '../schemas/userStats';
import { LastfmService } from './lastfm';

export class RecommendationService {
  private lastfmService: LastfmService;

  constructor() {
    this.lastfmService = new LastfmService();
  }

  async getPersonalizedRecommendations(userId: string, guildId: string, limit: number = 10): Promise<any[]> {
    const recommendations: any[] = [];

    // Get user's music history
    const userStats = await UserStats.findOne({ userId, guildId });
    if (!userStats || userStats.favoriteGenres.length === 0) {
      return await this.getDefaultRecommendations(guildId, limit);
    }

    // Get similar users based on favorite genres
    const similarUsers = await this.findSimilarUsers(userId, guildId, userStats.favoriteGenres);
    
    // Get recommendations from similar users' playlists
    const playlistRecommendations = await this.getRecommendationsFromSimilarUsers(similarUsers, limit / 2);
    recommendations.push(...playlistRecommendations);

    // Get trending tracks in the guild
    const trendingTracks = await this.getTrendingTracks(guildId, limit / 2);
    recommendations.push(...trendingTracks);

    // Remove duplicates and shuffle
    const uniqueRecommendations = this.removeDuplicates(recommendations);
    return this.shuffleArray(uniqueRecommendations).slice(0, limit);
  }

  async getRecommendationsByGenre(genre: string, guildId: string, limit: number = 10): Promise<any[]> {
    const playlists = await Playlist.find({ guildId });
    const genreTracks: any[] = [];

    playlists.forEach(playlist => {
      playlist.tracks.forEach(track => {
        // Simple genre matching (could be improved with actual genre classification)
        if (track.artist.toLowerCase().includes(genre.toLowerCase()) ||
            track.title.toLowerCase().includes(genre.toLowerCase())) {
          genreTracks.push({
            ...track,
            score: track.votes,
            reason: `Recommended because you like ${genre}`
          });
        }
      });
    });

    return genreTracks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getRecommendationsByTime(userId: string, guildId: string, timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'): Promise<any[]> {
    const userStats = await UserStats.findOne({ userId, guildId });
    if (!userStats) return [];

    // Get listening patterns for the specific time
    const timePattern = userStats.listeningPatterns[timeOfDay] || 0;
    
    if (timePattern === 0) {
      return await this.getPersonalizedRecommendations(userId, guildId, 5);
    }

    // Find tracks commonly played at this time
    const scrobbles = await Scrobble.find({ 
      'playbackData.guildId': guildId,
      'playbackData.listeningUsersId': userId
    });

    const timeBasedTracks: any[] = [];
    
    scrobbles.forEach(scrobble => {
      const hour = new Date(scrobble.playbackData.timestamp).getHours();
      let period = '';
      
      if (hour >= 6 && hour < 12) period = 'morning';
      else if (hour >= 12 && hour < 18) period = 'afternoon';
      else if (hour >= 18 && hour < 22) period = 'evening';
      else period = 'night';

      if (period === timeOfDay) {
        timeBasedTracks.push({
          artist: scrobble.track.artist,
          title: scrobble.track.name,
          score: 1,
          reason: `Perfect for ${timeOfDay} listening`
        });
      }
    });

    return this.removeDuplicates(timeBasedTracks).slice(0, 5);
  }

  async getCollaborativeRecommendations(userId: string, guildId: string): Promise<any[]> {
    // Find users with similar listening habits
    const userStats = await UserStats.findOne({ userId, guildId });
    if (!userStats) return [];

    const similarUsers = await this.findSimilarUsers(userId, guildId, userStats.favoriteGenres);
    return await this.getRecommendationsFromSimilarUsers(similarUsers, 10);
  }

  private async findSimilarUsers(userId: string, guildId: string, userGenres: string[]): Promise<string[]> {
    const allUserStats = await UserStats.find({ 
      guildId,
      userId: { $ne: userId },
      favoriteGenres: { $in: userGenres }
    });

    return allUserStats
      .map(stats => ({
        userId: stats.userId,
        similarity: this.calculateGenreSimilarity(userGenres, stats.favoriteGenres)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(user => user.userId);
  }

  private calculateGenreSimilarity(genres1: string[], genres2: string[]): number {
    const intersection = genres1.filter(genre => genres2.includes(genre));
    const union = [...new Set([...genres1, ...genres2])];
    return intersection.length / union.length;
  }

  private async getRecommendationsFromSimilarUsers(similarUsers: string[], limit: number): Promise<any[]> {
    const recommendations: any[] = [];

    for (const similarUserId of similarUsers) {
      const userPlaylists = await Playlist.find({ creatorId: similarUserId });
      
      userPlaylists.forEach(playlist => {
        playlist.tracks.forEach(track => {
          recommendations.push({
            ...track,
            score: track.votes + 1,
            reason: 'Recommended based on similar users'
          });
        });
      });
    }

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async getTrendingTracks(guildId: string, limit: number): Promise<any[]> {
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
      .map(track => ({
        ...track,
        score: track.count + track.totalVotes,
        reason: 'Trending in your server'
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async getDefaultRecommendations(guildId: string, limit: number): Promise<any[]> {
    // Return popular tracks as default recommendations
    return await this.getTrendingTracks(guildId, limit);
  }

  private removeDuplicates(tracks: any[]): any[] {
    const seen = new Set();
    return tracks.filter(track => {
      const key = `${track.artist} - ${track.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private shuffleArray(array: any[]): any[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async updateUserMusicProfile(userId: string, guildId: string, track: any): Promise<void> {
    let userStats = await UserStats.findOne({ userId, guildId });
    
    if (!userStats) {
      userStats = new UserStats({
        userId,
        guildId,
        totalCommands: 0,
        totalVoiceTime: 0,
        totalScrobbles: 0,
        favoriteGenres: [],
        listeningPatterns: new Map()
      });
    }

    // Update listening patterns based on time
    const hour = new Date().getHours();
    let timeOfDay = '';
    
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const currentCount = userStats.listeningPatterns[timeOfDay] || 0;
    userStats.listeningPatterns[timeOfDay] = currentCount + 1;

    // Simple genre extraction (could be improved with music APIs)
    const possibleGenres = ['rock', 'pop', 'jazz', 'electronic', 'hip-hop', 'classical', 'country', 'indie'];
    const trackGenres = possibleGenres.filter(genre => 
      track.artist.toLowerCase().includes(genre) || track.title.toLowerCase().includes(genre)
    );

    trackGenres.forEach(genre => {
      if (!userStats!.favoriteGenres.includes(genre)) {
        userStats!.favoriteGenres.push(genre);
      }
    });

    userStats.lastUpdated = new Date();
    await userStats.save();
  }
}
