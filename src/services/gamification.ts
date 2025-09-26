import Achievement from '../schemas/achievement';
import UserAchievement from '../schemas/userAchievement';
import UserLevel from '../schemas/userLevel';
import UserStats from '../schemas/userStats';
import { IAchievement, IUserAchievement, IUserLevel } from '../types';

export class GamificationService {
  
  // XP and Level Management
  async addXP(userId: string, guildId: string, amount: number): Promise<IUserLevel> {
    let userLevel = await UserLevel.findOne({ userId, guildId });
    
    if (!userLevel) {
      userLevel = new UserLevel({ userId, guildId, xp: 0, totalXp: 0, level: 1 });
    }
    
    userLevel.xp += amount;
    userLevel.totalXp += amount;
    userLevel.lastXpGain = new Date();
    
    // Check for level up
    const requiredXP = this.getRequiredXPForLevel(userLevel.level + 1);
    if (userLevel.xp >= requiredXP) {
      userLevel.level += 1;
      userLevel.xp -= requiredXP;
      
      // Check for level-based achievements
      await this.checkLevelAchievements(userId, guildId, userLevel.level);
    }
    
    await userLevel.save();
    return userLevel;
  }
  
  async getUserLevel(userId: string, guildId: string): Promise<IUserLevel | null> {
    return await UserLevel.findOne({ userId, guildId });
  }
  
  async getLeaderboard(guildId: string, limit: number = 10): Promise<IUserLevel[]> {
    return await UserLevel.find({ guildId })
      .sort({ level: -1, xp: -1 })
      .limit(limit);
  }
  
  private getRequiredXPForLevel(level: number): number {
    // Exponential scaling: level^2 * 100
    return Math.floor(Math.pow(level, 2) * 100);
  }
  
  // Achievement System
  async createAchievement(achievementData: Partial<IAchievement>): Promise<IAchievement> {
    const achievement = new Achievement(achievementData);
    return await achievement.save();
  }
  
  async unlockAchievement(userId: string, guildId: string, achievementId: string): Promise<IUserAchievement | null> {
    // Check if already unlocked
    const existing = await UserAchievement.findOne({ userId, achievementId });
    if (existing) return null;
    
    const achievement = await Achievement.findOne({ id: achievementId });
    if (!achievement) return null;
    
    const userAchievement = new UserAchievement({
      userId,
      achievementId,
      guildId,
      unlockedAt: new Date()
    });
    
    await userAchievement.save();
    
    // Apply rewards
    if (achievement.reward?.xp) {
      await this.addXP(userId, guildId, achievement.reward.xp);
    }
    
    return userAchievement;
  }
  
  async getUserAchievements(userId: string, guildId: string): Promise<IUserAchievement[]> {
    return await UserAchievement.find({ userId, guildId })
      .populate('achievementId');
  }
  
  async getAllAchievements(): Promise<IAchievement[]> {
    return await Achievement.find();
  }
  
  // Achievement checking
  async checkCommandAchievements(userId: string, guildId: string, commandName: string): Promise<void> {
    const stats = await UserStats.findOne({ userId, guildId });
    if (!stats) return;
    
    // Check total commands achievements
    const commandMilestones = [10, 50, 100, 500, 1000, 5000];
    for (const milestone of commandMilestones) {
      if (stats.totalCommands >= milestone) {
        await this.unlockAchievement(userId, guildId, `commands_${milestone}`);
      }
    }
    
    // Check specific command achievements
    if (commandName === 'play' && stats.totalCommands >= 100) {
      await this.unlockAchievement(userId, guildId, 'music_lover');
    }
  }
  
  async checkScrobbleAchievements(userId: string, guildId: string): Promise<void> {
    const stats = await UserStats.findOne({ userId, guildId });
    if (!stats) return;
    
    const scrobbleMilestones = [1, 10, 100, 500, 1000, 5000];
    for (const milestone of scrobbleMilestones) {
      if (stats.totalScrobbles >= milestone) {
        await this.unlockAchievement(userId, guildId, `scrobbles_${milestone}`);
      }
    }
  }
  
  private async checkLevelAchievements(userId: string, guildId: string, level: number): Promise<void> {
    const levelMilestones = [5, 10, 25, 50, 100];
    for (const milestone of levelMilestones) {
      if (level >= milestone) {
        await this.unlockAchievement(userId, guildId, `level_${milestone}`);
      }
    }
  }
  
  // Initialize default achievements
  async initializeDefaultAchievements(): Promise<void> {
    const defaultAchievements = [
      {
        id: 'first_command',
        name: 'Primeiros Passos',
        description: 'Execute seu primeiro comando',
        category: 'commands',
        rarity: 'common',
        icon: '👋',
        condition: { type: 'commands', value: 1 },
        reward: { xp: 10 }
      },
      {
        id: 'commands_10',
        name: 'Usuário Ativo',
        description: 'Execute 10 comandos',
        category: 'commands',
        rarity: 'common',
        icon: '⚡',
        condition: { type: 'commands', value: 10 },
        reward: { xp: 50 }
      },
      {
        id: 'commands_100',
        name: 'Veterano',
        description: 'Execute 100 comandos',
        category: 'commands',
        rarity: 'rare',
        icon: '🏆',
        condition: { type: 'commands', value: 100 },
        reward: { xp: 200 }
      },
      {
        id: 'level_10',
        name: 'Escalador',
        description: 'Alcance o nível 10',
        category: 'level',
        rarity: 'rare',
        icon: '🧗',
        condition: { type: 'level', value: 10 },
        reward: { xp: 500 }
      },
      {
        id: 'music_lover',
        name: 'Amante da Música',
        description: 'Use comandos de música 100 vezes',
        category: 'music',
        rarity: 'epic',
        icon: '🎵',
        condition: { type: 'music_commands', value: 100 },
        reward: { xp: 300 }
      },
      {
        id: 'scrobbles_100',
        name: 'Scrobbler',
        description: 'Registre 100 scrobbles',
        category: 'scrobble',
        rarity: 'epic',
        icon: '📊',
        condition: { type: 'scrobbles', value: 100 },
        reward: { xp: 400 }
      }
    ];
    
    for (const achievement of defaultAchievements) {
      const existing = await Achievement.findOne({ id: achievement.id });
      if (!existing) {
        await this.createAchievement(achievement as any);
      }
    }
  }
}
