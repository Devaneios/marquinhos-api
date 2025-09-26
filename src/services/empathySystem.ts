import { v4 as uuidv4 } from 'uuid';
import EmpathySystem, { IEmpathySystem } from '../schemas/empathySystem';
import MusicalDNA from '../schemas/musicalDNA';
import Scrobble from '../schemas/scrobble';
import UserStats from '../schemas/userStats';

export class EmpathySystemService {
  
  async analyzeGuildEmpathy(guildId: string): Promise<IEmpathySystem> {
    let empathyAnalysis = await EmpathySystem.findOne({ guildId });
    
    if (!empathyAnalysis) {
      empathyAnalysis = new EmpathySystem({
        guildId,
        analysisTimestamp: new Date(),
        isolationDetection: {
          isolatedUsers: [],
          communityHealth: 50,
          fragmentationLevel: 0
        },
        musicalBridges: [],
        empathyMappings: [],
        communityDynamics: {
          musicalClusters: [],
          bridgeUsers: [],
          musicalInfluencers: []
        },
        interventionHistory: [],
        nextAnalysis: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Weekly analysis
      });
    }
    
    await this.performIsolationAnalysis(empathyAnalysis);
    await this.identifyMusicalBridges(empathyAnalysis);
    await this.mapEmpathyProfiles(empathyAnalysis);
    await this.analyzeCommunityDynamics(empathyAnalysis);
    
    empathyAnalysis.analysisTimestamp = new Date();
    empathyAnalysis.nextAnalysis = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await empathyAnalysis.save();
    return empathyAnalysis;
  }
  
  private async performIsolationAnalysis(empathySystem: IEmpathySystem): Promise<void> {
    // Get all users with musical data in this guild
    const guildUsers = await MusicalDNA.find({ guildId: empathySystem.guildId });
    const userStats = await UserStats.find({ guildId: empathySystem.guildId });
    
    const isolatedUsers = [];
    let totalHealth = 0;
    let totalUsers = guildUsers.length;
    
    for (const user of guildUsers) {
      const stats = userStats.find(s => s.userId === user.userId);
      const isolationScore = await this.calculateIsolationScore(user, stats, empathySystem.guildId);
      
      if (isolationScore > 60) { // High isolation threshold
        const reasons = await this.identifyIsolationReasons(user, stats);
        
        isolatedUsers.push({
          userId: user.userId,
          isolationScore,
          reasons,
          lastPositiveInteraction: await this.getLastPositiveInteraction(user.userId, empathySystem.guildId),
          musicalLoneliness: isolationScore * 0.6,
          socialDisconnection: isolationScore * 0.4
        });
      }
      
      totalHealth += (100 - isolationScore);
    }
    
    empathySystem.isolationDetection.isolatedUsers = isolatedUsers;
    empathySystem.isolationDetection.communityHealth = totalUsers > 0 ? totalHealth / totalUsers : 50;
    empathySystem.isolationDetection.fragmentationLevel = (isolatedUsers.length / Math.max(totalUsers, 1)) * 100;
  }
  
  private async calculateIsolationScore(user: any, stats: any, guildId: string): Promise<number> {
    let isolationScore = 0;
    
    // Musical loneliness factors
    const compatibilityScores = Array.from(user.compatibilityScore.values());
    const avgCompatibility = compatibilityScores.length > 0 
      ? compatibilityScores.reduce((a: any, b: any) => a + b, 0) as number / compatibilityScores.length 
      : 0;
    
    if (avgCompatibility < 30) isolationScore += 30; // Low musical compatibility
    if (compatibilityScores.length < 3) isolationScore += 20; // Few connections
    
    // Social interaction factors
    const recentScrobbles = await Scrobble.find({
      'playbackData.listeningUsersId': user.userId,
      'playbackData.guildId': guildId,
      'playbackData.timestamp': { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
    });
    
    if (recentScrobbles.length === 0) isolationScore += 25; // No recent activity
    if (recentScrobbles.length < 5) isolationScore += 15; // Low activity
    
    // Musical diversity isolation
    const genreCount = stats?.favoriteGenres?.length || 0;
    if (genreCount < 3) isolationScore += 10; // Limited musical interests
    
    // Unique taste isolation
    const uniqueGenres = await this.countUniqueGenres(user.userId, guildId);
    if (uniqueGenres > genreCount * 0.8) isolationScore += 20; // Too unique, hard to connect
    
    return Math.min(100, isolationScore);
  }
  
  private async identifyIsolationReasons(user: any, stats: any): Promise<string[]> {
    const reasons = [];
    
    const compatibilityScores = Array.from(user.compatibilityScore.values());
    if (compatibilityScores.length === 0) {
      reasons.push('No musical connections established');
    } else if (compatibilityScores.every((score: any) => score < 30)) {
      reasons.push('Very low musical compatibility with others');
    }
    
    if (!stats || stats.totalCommands < 5) {
      reasons.push('Limited interaction with the community');
    }
    
    const genreCount = stats?.favoriteGenres?.length || 0;
    if (genreCount < 3) {
      reasons.push('Narrow musical interests limiting connections');
    }
    
    if (genreCount > 20) {
      reasons.push('Extremely diverse taste making it hard to find common ground');
    }
    
    return reasons;
  }
  
  private async getLastPositiveInteraction(userId: string, guildId: string): Promise<Date> {
    // Simplified - would track actual positive interactions
    const recentScrobble = await Scrobble.findOne({
      'playbackData.listeningUsersId': userId,
      'playbackData.guildId': guildId
    }).sort({ 'playbackData.timestamp': -1 });
    
    return recentScrobble?.playbackData?.timestamp || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  
  private async countUniqueGenres(userId: string, guildId: string): Promise<number> {
    // Count how many of user's genres are rare in the guild
    const userDNA = await MusicalDNA.findOne({ userId, guildId });
    if (!userDNA) return 0;
    
    const allUsers = await MusicalDNA.find({ guildId });
    const allGenres = new Map<string, number>();
    
    // Count genre popularity
    allUsers.forEach(user => {
      user.instrumentPreferences.forEach((_, genre) => {
        allGenres.set(genre, (allGenres.get(genre) || 0) + 1);
      });
    });
    
    // Count user's unique genres (genres that < 20% of users have)
    const threshold = Math.max(1, allUsers.length * 0.2);
    let uniqueCount = 0;
    
    userDNA.instrumentPreferences.forEach((_, genre) => {
      if ((allGenres.get(genre) || 0) < threshold) {
        uniqueCount++;
      }
    });
    
    return uniqueCount;
  }
  
  private async identifyMusicalBridges(empathySystem: IEmpathySystem): Promise<void> {
    const guildUsers = await MusicalDNA.find({ guildId: empathySystem.guildId });
    const bridges = [];
    
    // Find potential bridges between incompatible users
    for (let i = 0; i < guildUsers.length; i++) {
      for (let j = i + 1; j < guildUsers.length; j++) {
        const userA = guildUsers[i];
        const userB = guildUsers[j];
        
        const compatibility = userA.compatibilityScore.get(userB.userId) || 0;
        
        if (compatibility < 40) { // Low compatibility - need bridge
          const bridgeTracks = await this.findBridgeTracks(userA, userB);
          
          if (bridgeTracks.length > 0) {
            bridges.push({
              userA: userA.userId,
              userB: userB.userId,
              compatibilityScore: compatibility,
              bridgeTracks,
              recommendationMade: false
            });
          }
        }
      }
    }
    
    empathySystem.musicalBridges = bridges;
  }
  
  private async findBridgeTracks(userA: any, userB: any): Promise<any[]> {
    const bridgeTracks = [];
    
    // Find overlapping instruments with different preferences
    const commonInstruments: any[] = [];
    userA.instrumentPreferences.forEach((valueA: any, instrument: any) => {
      const valueB = userB.instrumentPreferences.get(instrument);
      if (valueB && Math.abs(valueA - valueB) < 0.3) {
        commonInstruments.push(instrument);
      }
    });
    
    // Find BPM overlap
    const bpmOverlapMin = Math.max(userA.preferredBPM.min, userB.preferredBPM.min);
    const bpmOverlapMax = Math.min(userA.preferredBPM.max, userB.preferredBPM.max);
    
    if (bpmOverlapMin <= bpmOverlapMax && commonInstruments.length > 0) {
      // Generate bridge track recommendations
      for (const instrument of commonInstruments.slice(0, 3)) {
        const bridgeBPM = Math.round((bpmOverlapMin + bpmOverlapMax) / 2);
        
        bridgeTracks.push({
          title: `${instrument.charAt(0).toUpperCase() + instrument.slice(1)} Bridge`,
          artist: 'Recommended Artist',
          bridgeReason: `Both users appreciate ${instrument} at ~${bridgeBPM} BPM`,
          connectionPotential: this.calculateConnectionPotential(userA, userB, instrument)
        });
      }
    }
    
    // Find emotional bridges
    const commonEmotions: any[] = [];
    userA.emotionalMapping.forEach((valueA: any, emotion: any) => {
      const valueB = userB.emotionalMapping.get(emotion);
      if (valueB && Math.min(valueA, valueB) > 0.3) {
        commonEmotions.push(emotion);
      }
    });
    
    for (const emotion of commonEmotions.slice(0, 2)) {
      bridgeTracks.push({
        title: `${emotion.charAt(0).toUpperCase() + emotion.slice(1)} Connection`,
        artist: 'Emotional Bridge',
        bridgeReason: `Both resonate with ${emotion} music`,
        connectionPotential: this.calculateEmotionalConnectionPotential(userA, userB, emotion)
      });
    }
    
    return bridgeTracks;
  }
  
  private calculateConnectionPotential(userA: any, userB: any, instrument: string): number {
    const prefA = userA.instrumentPreferences.get(instrument) || 0;
    const prefB = userB.instrumentPreferences.get(instrument) || 0;
    
    const similarity = 1 - Math.abs(prefA - prefB);
    const strength = Math.min(prefA, prefB);
    
    return Math.round((similarity * 0.6 + strength * 0.4) * 100);
  }
  
  private calculateEmotionalConnectionPotential(userA: any, userB: any, emotion: string): number {
    const prefA = userA.emotionalMapping.get(emotion) || 0;
    const prefB = userB.emotionalMapping.get(emotion) || 0;
    
    return Math.round(Math.min(prefA, prefB) * 100);
  }
  
  private async mapEmpathyProfiles(empathySystem: IEmpathySystem): Promise<void> {
    const guildUsers = await MusicalDNA.find({ guildId: empathySystem.guildId });
    const empathyMappings = [];
    
    for (const user of guildUsers) {
      const empathyProfile = await this.calculateEmpathyProfile(user, empathySystem.guildId);
      const connectionHistory = await this.getConnectionHistory(user.userId, empathySystem.guildId);
      
      empathyMappings.push({
        userId: user.userId,
        empathyProfile,
        connectionHistory
      });
    }
    
    empathySystem.empathyMappings = empathyMappings;
  }
  
  private async calculateEmpathyProfile(user: any, guildId: string): Promise<any> {
    // Musical openness - how diverse their taste is
    const genreCount = Array.from(user.instrumentPreferences.keys()).length;
    const musicalOpenness = Math.min(100, (genreCount / 15) * 100); // 15 genres = 100% open
    
    // Social receptivity - how well they connect with others
    const compatibilityScores = Array.from(user.compatibilityScore.values());
    const avgCompatibility = compatibilityScores.length > 0 
      ? compatibilityScores.reduce((a: any, b: any) => a + b, 0) as number / compatibilityScores.length 
      : 50;
    
    // Influenceability - how much their taste changes
    const evolutionCount = user.temporalEvolution?.length || 0;
    const influenceability = Math.min(100, (evolutionCount / 6) * 100); // 6 evolutions = highly influenceable
    
    // Mentor potential - ability to guide others
    const connectionCount = compatibilityScores.length;
    const highConnections = compatibilityScores.filter((score: any) => score > 70).length;
    const mentorPotential = connectionCount > 0 ? (highConnections / connectionCount) * 100 : 0;
    
    return {
      musicalOpenness: Math.round(musicalOpenness),
      socialReceptivity: Math.round(avgCompatibility),
      influenceability: Math.round(influenceability),
      mentorPotential: Math.round(mentorPotential)
    };
  }
  
  private async getConnectionHistory(userId: string, guildId: string): Promise<any[]> {
    // Simplified connection history - would track actual connections made
    const connections: any[] = [];
    const userDNA = await MusicalDNA.findOne({ userId, guildId });
    
    if (userDNA) {
      userDNA.compatibilityScore.forEach((strength, connectedUserId) => {
        if (strength > 50) {
          connections.push({
            connectedWith: connectedUserId,
            connectionStrength: strength,
            throughMusic: ['collaborative discovery'], // Simplified
            date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random recent date
          });
        }
      });
    }
    
    return connections;
  }
  
  private async analyzeCommunityDynamics(empathySystem: IEmpathySystem): Promise<void> {
    const guildUsers = await MusicalDNA.find({ guildId: empathySystem.guildId });
    
    // Cluster analysis
    const clusters = await this.identifyMusicalClusters(guildUsers);
    empathySystem.communityDynamics.musicalClusters = clusters;
    
    // Bridge users analysis
    const bridgeUsers = await this.identifyBridgeUsers(guildUsers, clusters);
    empathySystem.communityDynamics.bridgeUsers = bridgeUsers;
    
    // Influencers analysis
    const influencers = await this.identifyMusicalInfluencers(guildUsers);
    empathySystem.communityDynamics.musicalInfluencers = influencers;
  }
  
  private async identifyMusicalClusters(users: any[]): Promise<any[]> {
    const clusters: any[] = [];
    const processed = new Set<string>();
    
    for (const user of users) {
      if (processed.has(user.userId)) continue;
      
      const cluster = {
        clusterId: uuidv4(),
        members: [user.userId],
        centralGenres: this.getTopGenres(user),
        influence: 0,
        openness: 0
      };
      
      // Find similar users for this cluster
      for (const otherUser of users) {
        if (otherUser.userId === user.userId || processed.has(otherUser.userId)) continue;
        
        const compatibility = user.compatibilityScore.get(otherUser.userId) || 0;
        if (compatibility > 60) {
          cluster.members.push(otherUser.userId);
          processed.add(otherUser.userId);
        }
      }
      
      if (cluster.members.length > 1) {
        cluster.influence = this.calculateClusterInfluence(cluster.members, users);
        cluster.openness = this.calculateClusterOpenness(cluster.members, users);
        clusters.push(cluster);
      }
      
      processed.add(user.userId);
    }
    
    return clusters;
  }
  
  private getTopGenres(user: any): string[] {
    return Array.from(user.instrumentPreferences.entries())
      .sort(([,a]: any, [,b]: any) => b - a)
      .slice(0, 3)
      .map(([genre]: any) => genre);
  }
  
  private calculateClusterInfluence(memberIds: string[], allUsers: any[]): number {
    const members = allUsers.filter(u => memberIds.includes(u.userId));
    const totalConnections = members.reduce((sum, member) => {
      return sum + Array.from(member.compatibilityScore.values()).length;
    }, 0);
    
    return Math.min(100, (totalConnections / memberIds.length) * 10);
  }
  
  private calculateClusterOpenness(memberIds: string[], allUsers: any[]): number {
    const members = allUsers.filter(u => memberIds.includes(u.userId));
    const avgGenreCount = members.reduce((sum, member) => {
      return sum + Array.from(member.instrumentPreferences.keys()).length;
    }, 0) / members.length;
    
    return Math.min(100, (avgGenreCount / 15) * 100);
  }
  
  private async identifyBridgeUsers(users: any[], clusters: any[]): Promise<any[]> {
    const bridgeUsers = [];
    
    for (const user of users) {
      const userClusters = clusters.filter(cluster => cluster.members.includes(user.userId));
      const connectedClusters = clusters.filter(cluster => 
        !cluster.members.includes(user.userId) && 
        cluster.members.some((memberId: any) => (user.compatibilityScore.get(memberId) || 0) > 40)
      );
      
      if (userClusters.length === 1 && connectedClusters.length > 0) {
        const bridgeScore = connectedClusters.length * 20 + 
          Array.from(user.compatibilityScore.values()).filter((score: any) => score > 40).length * 5;
        
        bridgeUsers.push({
          userId: user.userId,
          bridgeScore: Math.min(100, bridgeScore),
          connectsClusters: [userClusters[0].clusterId, ...connectedClusters.map(c => c.clusterId)],
          bridgeGenres: this.getTopGenres(user)
        });
      }
    }
    
    return bridgeUsers.sort((a, b) => b.bridgeScore - a.bridgeScore);
  }
  
  private async identifyMusicalInfluencers(users: any[]): Promise<any[]> {
    const influencers = [];
    
    for (const user of users) {
      const connections = Array.from(user.compatibilityScore.values());
      const highQualityConnections = connections.filter((score: any) => score > 70).length;
      const totalConnections = connections.length;
      
      if (totalConnections > 3) {
        const influenceScore = (highQualityConnections / totalConnections) * 100;
        
        influencers.push({
          userId: user.userId,
          influenceScore: Math.round(influenceScore),
          introducedGenres: this.getTopGenres(user), // Simplified
          convertedUsers: [] // Would track actual conversions
        });
      }
    }
    
    return influencers.sort((a, b) => b.influenceScore - a.influenceScore).slice(0, 5);
  }
  
  async recommendIntervention(guildId: string): Promise<any[]> {
    const empathySystem = await EmpathySystem.findOne({ guildId });
    if (!empathySystem) return [];
    
    const interventions = [];
    
    // For isolated users
    for (const isolatedUser of empathySystem.isolationDetection.isolatedUsers) {
      if (isolatedUser.isolationScore > 70) {
        // Find potential mentors
        const potentialMentors = empathySystem.empathyMappings
          .filter(mapping => mapping.empathyProfile.mentorPotential > 60)
          .slice(0, 3);
        
        interventions.push({
          type: 'mentor_connection',
          targetUser: isolatedUser.userId,
          mentors: potentialMentors.map(m => m.userId),
          description: 'Connect isolated user with community mentors',
          priority: 'high'
        });
      }
    }
    
    // For bridge opportunities
    for (const bridge of empathySystem.musicalBridges.slice(0, 5)) {
      if (!bridge.recommendationMade) {
        interventions.push({
          type: 'musical_bridge',
          targetUsers: [bridge.userA, bridge.userB],
          bridgeTracks: bridge.bridgeTracks,
          description: 'Facilitate connection through bridge music',
          priority: 'medium'
        });
      }
    }
    
    // For community fragmentation
    if (empathySystem.isolationDetection.fragmentationLevel > 30) {
      interventions.push({
        type: 'community_event',
        targetUsers: empathySystem.communityDynamics.bridgeUsers.map(u => u.userId),
        description: 'Organize community listening party to reduce fragmentation',
        priority: 'high'
      });
    }
    
    return interventions;
  }
  
  async executeIntervention(
    guildId: string,
    intervention: {
      type: string;
      targetUsers: string[];
      description: string;
    }
  ): Promise<boolean> {
    
    const empathySystem = await EmpathySystem.findOne({ guildId });
    if (!empathySystem) return false;
    
    // Log intervention
    empathySystem.interventionHistory.push({
      timestamp: new Date(),
      intervention: intervention.type,
      targetUsers: intervention.targetUsers,
      success: true, // Would be updated based on actual results
      impact: 'Intervention executed successfully',
      followUpNeeded: true
    });
    
    // Mark bridge recommendations as made if applicable
    if (intervention.type === 'musical_bridge') {
      empathySystem.musicalBridges.forEach(bridge => {
        if (intervention.targetUsers.includes(bridge.userA) && 
            intervention.targetUsers.includes(bridge.userB)) {
          bridge.recommendationMade = true;
        }
      });
    }
    
    await empathySystem.save();
    return true;
  }
  
  async getEmpathyInsights(guildId: string): Promise<any> {
    const empathySystem = await EmpathySystem.findOne({ guildId });
    if (!empathySystem) return null;
    
    return {
      communityHealth: empathySystem.isolationDetection.communityHealth,
      isolatedUsersCount: empathySystem.isolationDetection.isolatedUsers.length,
      fragmentationLevel: empathySystem.isolationDetection.fragmentationLevel,
      bridgeOpportunities: empathySystem.musicalBridges.length,
      clusterCount: empathySystem.communityDynamics.musicalClusters.length,
      influencerCount: empathySystem.communityDynamics.musicalInfluencers.length,
      interventionsExecuted: empathySystem.interventionHistory.length,
      lastAnalysis: empathySystem.analysisTimestamp,
      nextAnalysis: empathySystem.nextAnalysis
    };
  }
}
