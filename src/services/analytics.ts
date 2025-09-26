import KaraokeSession from '../schemas/karaokeSession';
import Playlist from '../schemas/playlist';
import Scrobble from '../schemas/scrobble';
import UserLevel from '../schemas/userLevel';
import UserStats from '../schemas/userStats';

export class AnalyticsService {
  
  async getUserAnalytics(userId: string, guildId: string): Promise<any> {
    const [userStats, userLevel, playlists, recentScrobbles] = await Promise.all([
      UserStats.findOne({ userId, guildId }),
      UserLevel.findOne({ userId, guildId }),
      Playlist.find({ creatorId: userId, guildId }),
      Scrobble.find({ 'playbackData.listeningUsersId': userId, 'playbackData.guildId': guildId })
        .sort({ 'playbackData.timestamp': -1 })
        .limit(50)
    ]);

    const analytics = {
      profile: {
        level: userLevel?.level || 1,
        totalXp: userLevel?.totalXp || 0,
        totalCommands: userStats?.totalCommands || 0,
        totalVoiceTime: userStats?.totalVoiceTime || 0,
        totalScrobbles: userStats?.totalScrobbles || 0,
        favoriteGenres: userStats?.favoriteGenres || []
      },
      activity: {
        playlistsCreated: playlists.length,
        tracksInPlaylists: playlists.reduce((sum, p) => sum + p.tracks.length, 0),
        listeningPatterns: Object.fromEntries(userStats?.listeningPatterns as any),
        recentActivity: this.generateRecentActivity(recentScrobbles)
      },
      trends: {
        weeklyActivity: await this.getWeeklyActivity(userId, guildId),
        topArtists: await this.getUserTopArtists(userId, guildId),
        topGenres: userStats?.favoriteGenres.slice(0, 5) || []
      }
    };

    return analytics;
  }

  async getGuildAnalytics(guildId: string): Promise<any> {
    const [userStats, playlists, scrobbles, karaokeSessions] = await Promise.all([
      UserStats.find({ guildId }),
      Playlist.find({ guildId }),
      Scrobble.find({ 'playbackData.guildId': guildId }),
      KaraokeSession.find({ guildId })
    ]);

    const activeUsers = userStats.filter(s => s.totalCommands > 10).length;
    const totalUsers = userStats.length;

    const analytics = {
      overview: {
        totalUsers,
        activeUsers,
        totalPlaylists: playlists.length,
        totalScrobbles: scrobbles.length,
        totalKaraokeSessions: karaokeSessions.length
      },
      activity: {
        dailyActivity: await this.getDailyActivity(guildId),
        popularCommands: await this.getPopularCommands(userStats),
        peakHours: this.calculatePeakHours(userStats)
      },
      music: {
        topTracks: await this.getGuildTopTracks(guildId),
        topArtists: await this.getGuildTopArtists(guildId),
        genreDistribution: this.calculateGenreDistribution(userStats)
      },
      engagement: {
        averageSessionLength: this.calculateAverageSessionLength(userStats),
        retentionRate: this.calculateRetentionRate(userStats),
        mostActiveUsers: this.getMostActiveUsers(userStats)
      }
    };

    return analytics;
  }

  async generateServerReport(guildId: string, period: 'weekly' | 'monthly' = 'weekly'): Promise<any> {
    const days = period === 'weekly' ? 7 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [userStats, recentScrobbles, recentActivity] = await Promise.all([
      UserStats.find({ guildId }),
      Scrobble.find({ 
        'playbackData.guildId': guildId,
        'playbackData.timestamp': { $gte: startDate }
      }),
      this.getActivityInPeriod(guildId, startDate)
    ]);

    const report = {
      period: period,
      dateRange: {
        start: startDate,
        end: new Date()
      },
      summary: {
        totalUsers: userStats.length,
        activeUsers: userStats.filter(s => s.lastUpdated >= startDate).length,
        totalCommands: userStats.reduce((sum, s) => sum + s.totalCommands, 0),
        totalScrobbles: recentScrobbles.length,
        totalVoiceTime: userStats.reduce((sum, s) => sum + s.totalVoiceTime, 0)
      },
      topContent: {
        tracks: await this.getTopTracksInPeriod(guildId, startDate),
        artists: await this.getTopArtistsInPeriod(guildId, startDate),
        genres: this.getTopGenresInPeriod(userStats)
      },
      insights: {
        growth: await this.calculateGrowthMetrics(guildId, startDate),
        engagement: this.calculateEngagementMetrics(userStats, startDate),
        recommendations: this.generateRecommendations(userStats)
      }
    };

    return report;
  }

  async updateUserStats(userId: string, guildId: string, activity: {
    commandUsed?: boolean;
    voiceTimeAdded?: number;
    scrobbleAdded?: boolean;
    trackPlayed?: any;
  }): Promise<void> {
    let userStats = await UserStats.findOne({ userId, guildId });
    
    if (!userStats) {
      userStats = new UserStats({
        userId,
        guildId,
        totalCommands: 0,
        totalVoiceTime: 0,
        totalScrobbles: 0,
        favoriteGenres: [],
        listeningPatterns: new Map(),
        lastUpdated: new Date()
      });
    }

    if (activity.commandUsed) {
      userStats.totalCommands += 1;
    }

    if (activity.voiceTimeAdded) {
      userStats.totalVoiceTime += activity.voiceTimeAdded;
    }

    if (activity.scrobbleAdded) {
      userStats.totalScrobbles += 1;
    }

    if (activity.trackPlayed) {
      // Update listening patterns
      const hour = new Date().getHours();
      let timeOfDay = '';
      
      if (hour >= 6 && hour < 12) timeOfDay = 'morning';
      else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
      else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
      else timeOfDay = 'night';

      const currentCount = userStats.listeningPatterns[timeOfDay] || 0;
      userStats.listeningPatterns[timeOfDay] = currentCount + 1;
    }

    userStats.lastUpdated = new Date();
    await userStats.save();
  }

  private generateRecentActivity(scrobbles: any[]): any[] {
    return scrobbles.slice(0, 10).map(scrobble => ({
      type: 'scrobble',
      track: `${scrobble.track.artist} - ${scrobble.track.name}`,
      timestamp: scrobble.playbackData.timestamp
    }));
  }

  private async getWeeklyActivity(userId: string, guildId: string): Promise<any[]> {
    // Simplified - would normally query actual activity logs
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map(day => ({
      day,
      commands: Math.floor(Math.random() * 20),
      voiceTime: Math.floor(Math.random() * 300),
      scrobbles: Math.floor(Math.random() * 15)
    }));
  }

  private async getUserTopArtists(userId: string, guildId: string): Promise<any[]> {
    const scrobbles = await Scrobble.find({ 
      'playbackData.listeningUsersId': userId,
      'playbackData.guildId': guildId
    });

    const artistCounts = new Map();
    scrobbles.forEach(scrobble => {
      const artist = scrobble.track.artist;
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    });

    return Array.from(artistCounts.entries())
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async getDailyActivity(guildId: string): Promise<any[]> {
    // Simplified implementation
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push({
        date: date.toISOString().split('T')[0],
        activity: Math.floor(Math.random() * 100)
      });
    }
    return last7Days;
  }

  private async getPopularCommands(userStats: any[]): Promise<any[]> {
    // Simplified - would track actual command usage
    return [
      { command: '/play', usage: 450 },
      { command: '/skip', usage: 320 },
      { command: '/queue', usage: 280 },
      { command: '/level', usage: 150 },
      { command: '/playlist', usage: 120 }
    ];
  }

  private calculatePeakHours(userStats: any[]): any[] {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, activity: 0 }));
    
    userStats.forEach(stats => {
      stats.listeningPatterns.forEach((count: number, timeOfDay: string) => {
        const hourRanges = {
          morning: [6, 7, 8, 9, 10, 11],
          afternoon: [12, 13, 14, 15, 16, 17],
          evening: [18, 19, 20, 21],
          night: [22, 23, 0, 1, 2, 3, 4, 5]
        };
        
        const range = hourRanges[timeOfDay as keyof typeof hourRanges] || [];
        range.forEach(hour => {
          hours[hour].activity += count;
        });
      });
    });

    return hours.sort((a, b) => b.activity - a.activity).slice(0, 5);
  }

  private async getGuildTopTracks(guildId: string): Promise<any[]> {
    const playlists = await Playlist.find({ guildId });
    const trackCounts = new Map();

    playlists.forEach(playlist => {
      playlist.tracks.forEach(track => {
        const key = `${track.artist} - ${track.title}`;
        trackCounts.set(key, (trackCounts.get(key) || 0) + track.votes + 1);
      });
    });

    return Array.from(trackCounts.entries())
      .map(([track, count]) => ({ track, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async getGuildTopArtists(guildId: string): Promise<any[]> {
    const scrobbles = await Scrobble.find({ 'playbackData.guildId': guildId });
    const artistCounts = new Map();

    scrobbles.forEach(scrobble => {
      const artist = scrobble.track.artist;
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    });

    return Array.from(artistCounts.entries())
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private calculateGenreDistribution(userStats: any[]): any[] {
    const genreCounts = new Map();
    
    userStats.forEach(stats => {
      stats.favoriteGenres.forEach((genre: string) => {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      });
    });

    return Array.from(genreCounts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count);
  }

  private calculateAverageSessionLength(userStats: any[]): number {
    const totalVoiceTime = userStats.reduce((sum, s) => sum + s.totalVoiceTime, 0);
    const totalCommands = userStats.reduce((sum, s) => sum + s.totalCommands, 0);
    return totalCommands > 0 ? Math.round(totalVoiceTime / totalCommands) : 0;
  }

  private calculateRetentionRate(userStats: any[]): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const activeLastWeek = userStats.filter(s => s.lastUpdated >= oneWeekAgo).length;
    return userStats.length > 0 ? Math.round((activeLastWeek / userStats.length) * 100) : 0;
  }

  private getMostActiveUsers(userStats: any[]): any[] {
    return userStats
      .sort((a, b) => b.totalCommands - a.totalCommands)
      .slice(0, 5)
      .map(stats => ({
        userId: stats.userId,
        totalCommands: stats.totalCommands,
        totalVoiceTime: stats.totalVoiceTime,
        totalScrobbles: stats.totalScrobbles
      }));
  }

  private async getActivityInPeriod(guildId: string, startDate: Date): Promise<any> {
    // Simplified implementation
    return {
      commandsUsed: Math.floor(Math.random() * 1000),
      voiceTimeTotal: Math.floor(Math.random() * 50000),
      scrobblesTotal: Math.floor(Math.random() * 500)
    };
  }

  private async getTopTracksInPeriod(guildId: string, startDate: Date): Promise<any[]> {
    const scrobbles = await Scrobble.find({ 
      'playbackData.guildId': guildId,
      'playbackData.timestamp': { $gte: startDate }
    });

    const trackCounts = new Map();
    scrobbles.forEach(scrobble => {
      const key = `${scrobble.track.artist} - ${scrobble.track.name}`;
      trackCounts.set(key, (trackCounts.get(key) || 0) + 1);
    });

    return Array.from(trackCounts.entries())
      .map(([track, count]) => ({ track, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async getTopArtistsInPeriod(guildId: string, startDate: Date): Promise<any[]> {
    const scrobbles = await Scrobble.find({ 
      'playbackData.guildId': guildId,
      'playbackData.timestamp': { $gte: startDate }
    });

    const artistCounts = new Map();
    scrobbles.forEach(scrobble => {
      artistCounts.set(scrobble.track.artist, (artistCounts.get(scrobble.track.artist) || 0) + 1);
    });

    return Array.from(artistCounts.entries())
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopGenresInPeriod(userStats: any[]): any[] {
    return this.calculateGenreDistribution(userStats).slice(0, 5);
  }

  private async calculateGrowthMetrics(guildId: string, startDate: Date): Promise<any> {
    // Simplified implementation
    return {
      userGrowth: '+15%',
      activityGrowth: '+23%',
      engagementGrowth: '+8%'
    };
  }

  private calculateEngagementMetrics(userStats: any[], startDate: Date): any {
    const activeUsers = userStats.filter(s => s.lastUpdated >= startDate).length;
    const totalUsers = userStats.length;
    
    return {
      activeUserRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
      averageCommandsPerUser: totalUsers > 0 ? Math.round(userStats.reduce((sum, s) => sum + s.totalCommands, 0) / totalUsers) : 0,
      averageVoiceTimePerUser: totalUsers > 0 ? Math.round(userStats.reduce((sum, s) => sum + s.totalVoiceTime, 0) / totalUsers) : 0
    };
  }

  private generateRecommendations(userStats: any[]): string[] {
    const recommendations = [];
    
    if (userStats.length < 10) {
      recommendations.push('Consider promoting the bot to increase user adoption');
    }
    
    const avgCommands = userStats.reduce((sum, s) => sum + s.totalCommands, 0) / userStats.length;
    if (avgCommands < 5) {
      recommendations.push('Create more engaging commands to increase user interaction');
    }
    
    const activeUsers = userStats.filter(s => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      return s.lastUpdated >= oneWeekAgo;
    }).length;
    
    if (activeUsers / userStats.length < 0.3) {
      recommendations.push('Implement retention strategies to keep users engaged');
    }
    
    return recommendations;
  }
}
