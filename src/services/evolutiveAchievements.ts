import { v4 as uuidv4 } from 'uuid';
import EvolutiveAchievement, { IEvolutiveAchievement } from '../schemas/evolutiveAchievement';
import UserStats from '../schemas/userStats';

export class EvolutiveAchievementsService {
  
  private baseAchievements = {
    'musical-explorer': {
      name: 'Explorador Musical',
      description: 'Descubra novos gêneros musicais',
      icon: '🎵',
      evolutionPath: [
        { tier: 1, name: 'Primeiro Ouvinte', rarity: 'common' as const },
        { tier: 2, name: 'Descobridor Curioso', rarity: 'rare' as const },
        { tier: 3, name: 'Curador de Raridades', rarity: 'epic' as const },
        { tier: 4, name: 'Descobridor de Talentos', rarity: 'legendary' as const },
        { tier: 5, name: 'Visionário Musical', rarity: 'mythical' as const }
      ]
    },
    'social-connector': {
      name: 'Conector Social',
      description: 'Una pessoas através da música',
      icon: '🤝',
      evolutionPath: [
        { tier: 1, name: 'Novo Amigo', rarity: 'common' as const },
        { tier: 2, name: 'Facilitador', rarity: 'rare' as const },
        { tier: 3, name: 'Influenciador Musical', rarity: 'epic' as const },
        { tier: 4, name: 'Ponte entre Mundos', rarity: 'legendary' as const },
        { tier: 5, name: 'Unificador Universal', rarity: 'mythical' as const }
      ]
    },
    'rhythm-master': {
      name: 'Mestre do Ritmo',
      description: 'Domine diferentes estilos rítmicos',
      icon: '🥁',
      evolutionPath: [
        { tier: 1, name: 'Batida Básica', rarity: 'common' as const },
        { tier: 2, name: 'Groove Intermediário', rarity: 'rare' as const },
        { tier: 3, name: 'Ritmo Avançado', rarity: 'epic' as const },
        { tier: 4, name: 'Metrônomo Humano', rarity: 'legendary' as const },
        { tier: 5, name: 'Senhor do Tempo', rarity: 'mythical' as const }
      ]
    },
    'season-listener': {
      name: 'Ouvinte Sazonal',
      description: 'Adapte sua música às estações',
      icon: '🍂',
      temporal: true,
      evolutionPath: [
        { tier: 1, name: 'Ouvinte de Verão', rarity: 'common' as const },
        { tier: 2, name: 'Guardião do Outono', rarity: 'rare' as const },
        { tier: 3, name: 'Espírito do Inverno', rarity: 'epic' as const },
        { tier: 4, name: 'Florescer da Primavera', rarity: 'legendary' as const },
        { tier: 5, name: 'Senhor das Estações', rarity: 'mythical' as const }
      ]
    }
  };
  
  async initializeEvolutiveAchievement(
    userId: string,
    guildId: string,
    baseId: string,
    triggerEvent: string
  ): Promise<IEvolutiveAchievement | null> {
    
    const baseAchievement = this.baseAchievements[baseId as keyof typeof this.baseAchievements];
    if (!baseAchievement) return null;
    
    // Check if user already has this achievement
    const existing = await EvolutiveAchievement.findOne({ userId, guildId, baseId });
    if (existing) return null;
    
    const initialForm = baseAchievement.evolutionPath[0];
    
    const achievement = new EvolutiveAchievement({
      id: uuidv4(),
      baseId,
      userId,
      guildId,
      currentForm: {
        name: initialForm.name,
        description: baseAchievement.description,
        icon: baseAchievement.icon,
        rarity: initialForm.rarity,
        tier: initialForm.tier
      },
      evolutionPath: [{
        timestamp: new Date(),
        previousForm: null,
        newForm: initialForm,
        triggerEvent,
        evolutionReason: 'Initial unlock'
      }],
      personalizedElements: {
        personalizedTriggers: []
      },
      narrativeElements: {
        storyChapter: 1,
        characterDevelopment: this.generateInitialNarrative(baseId, userId),
        personalJourney: [],
        milestones: [{
          date: new Date(),
          achievement: 'First step on the journey',
          impact: 'Beginning of musical evolution'
        }]
      },
      temporalProperties: {
        isTimebound: false,
        availableUntil: this.calculateSeasonEnd(),
        seasonalType: this.getCurrentSeason()
      },
      mysteryElements: {
        hasHiddenRequirements: Math.random() > 0.7, // 30% chance
        communityDiscovered: false,
        cluesGiven: []
      },
      nextEvolutionHints: this.generateEvolutionHints(baseId, 1)
    });
    
    await achievement.save();
    return achievement;
  }
  
  async checkAndEvolveAchievement(
    userId: string,
    guildId: string,
    triggerData: {
      type: string;
      value: any;
      context?: string;
    }
  ): Promise<IEvolutiveAchievement[]> {
    
    const userAchievements = await EvolutiveAchievement.find({ userId, guildId });
    const evolvedAchievements: IEvolutiveAchievement[] = [];
    
    for (const achievement of userAchievements) {
      const evolved = await this.checkEvolutionCriteria(achievement, triggerData);
      if (evolved) {
        evolvedAchievements.push(evolved);
      }
    }
    
    return evolvedAchievements;
  }
  
  private async checkEvolutionCriteria(
    achievement: IEvolutiveAchievement,
    triggerData: any
  ): Promise<IEvolutiveAchievement | null> {
    
    const baseAchievement = this.baseAchievements[achievement.baseId as keyof typeof this.baseAchievements];
    if (!baseAchievement) return null;
    
    const currentTier = achievement.currentForm.tier;
    const nextTierData = baseAchievement.evolutionPath[currentTier]; // Next tier (0-indexed vs 1-indexed)
    
    if (!nextTierData) return null; // Already at max tier
    
    // Check evolution criteria based on achievement type
    const shouldEvolve = await this.evaluateEvolutionCriteria(achievement, triggerData);
    
    if (shouldEvolve) {
      return await this.evolveAchievement(achievement, nextTierData, triggerData);
    }
    
    return null;
  }
  
  private async evaluateEvolutionCriteria(
    achievement: IEvolutiveAchievement,
    triggerData: any
  ): Promise<boolean> {
    
    const userStats = await UserStats.findOne({ 
      userId: achievement.userId, 
      guildId: achievement.guildId 
    });
    
    switch (achievement.baseId) {
      case 'musical-explorer':
        return this.checkExplorerEvolution(achievement, userStats, triggerData);
      
      case 'social-connector':
        return this.checkConnectorEvolution(achievement, userStats, triggerData);
      
      case 'rhythm-master':
        return this.checkRhythmEvolution(achievement, userStats, triggerData);
      
      case 'season-listener':
        return this.checkSeasonalEvolution(achievement, userStats, triggerData);
      
      default:
        return false;
    }
  }
  
  private checkExplorerEvolution(achievement: IEvolutiveAchievement, userStats: any, triggerData: any): boolean {
    const tier = achievement.currentForm.tier;
    const genreCount = userStats?.favoriteGenres?.length || 0;
    
    const requirements = {
      1: { genres: 3, scrobbles: 10 },
      2: { genres: 8, scrobbles: 50 },
      3: { genres: 15, scrobbles: 200 },
      4: { genres: 25, scrobbles: 500 }
    };
    
    const requirement = requirements[tier as keyof typeof requirements];
    if (!requirement) return false;
    
    return genreCount >= requirement.genres && 
           (userStats?.totalScrobbles || 0) >= requirement.scrobbles;
  }
  
  private checkConnectorEvolution(achievement: IEvolutiveAchievement, userStats: any, triggerData: any): boolean {
    const tier = achievement.currentForm.tier;
    
    // Simulated social interaction metrics
    const connectionsMade = Math.floor(Math.random() * 20); // Would be real data
    const influenceScore = Math.floor(Math.random() * 100);
    
    const requirements = {
      1: { connections: 2, influence: 10 },
      2: { connections: 5, influence: 25 },
      3: { connections: 12, influence: 50 },
      4: { connections: 25, influence: 80 }
    };
    
    const requirement = requirements[tier as keyof typeof requirements];
    if (!requirement) return false;
    
    return connectionsMade >= requirement.connections && 
           influenceScore >= requirement.influence;
  }
  
  private checkRhythmEvolution(achievement: IEvolutiveAchievement, userStats: any, triggerData: any): boolean {
    const tier = achievement.currentForm.tier;
    
    // Check rhythm-related activities (voice AI scores, karaoke, etc)
    const rhythmScore = Math.floor(Math.random() * 100); // Would be calculated from voice AI data
    const sessionsCompleted = Math.floor(Math.random() * 50);
    
    const requirements = {
      1: { score: 60, sessions: 5 },
      2: { score: 70, sessions: 15 },
      3: { score: 80, sessions: 30 },
      4: { score: 90, sessions: 50 }
    };
    
    const requirement = requirements[tier as keyof typeof requirements];
    if (!requirement) return false;
    
    return rhythmScore >= requirement.score && 
           sessionsCompleted >= requirement.sessions;
  }
  
  private checkSeasonalEvolution(achievement: IEvolutiveAchievement, userStats: any, triggerData: any): boolean {
    const tier = achievement.currentForm.tier;
    const currentSeason = this.getCurrentSeason();
    
    // Check if user has been active in current season
    const seasonalActivity = Math.floor(Math.random() * 30); // Days active this season
    
    const requirements = {
      1: { days: 7 },
      2: { days: 15 },
      3: { days: 30 },
      4: { days: 60 } // Multiple seasons
    };
    
    const requirement = requirements[tier as keyof typeof requirements];
    if (!requirement) return false;
    
    return seasonalActivity >= requirement.days;
  }
  
  private async evolveAchievement(
    achievement: IEvolutiveAchievement,
    nextTierData: any,
    triggerData: any
  ): Promise<IEvolutiveAchievement> {
    
    const previousForm = { ...achievement.currentForm };
    const newForm = {
      name: nextTierData.name,
      description: this.generatePersonalizedDescription(achievement, nextTierData),
      icon: this.evolveIcon(achievement.currentForm.icon, nextTierData.tier),
      rarity: nextTierData.rarity,
      tier: nextTierData.tier
    };
    
    // Update achievement
    achievement.currentForm = newForm;
    achievement.lastEvolution = new Date();
    
    // Add to evolution path
    achievement.evolutionPath.push({
      timestamp: new Date(),
      previousForm,
      newForm,
      triggerEvent: triggerData.type,
      evolutionReason: this.generateEvolutionReason(achievement, triggerData)
    });
    
    // Update narrative
    achievement.narrativeElements.storyChapter++;
    achievement.narrativeElements.personalJourney.push(
      this.generateJourneyEntry(achievement, newForm)
    );
    achievement.narrativeElements.milestones.push({
      date: new Date(),
      achievement: `Evolved to ${newForm.name}`,
      impact: this.generateImpactDescription(newForm)
    });
    
    // Generate new hints
    achievement.nextEvolutionHints = this.generateEvolutionHints(
      achievement.baseId, 
      newForm.tier
    );
    
    // Check for personalization opportunities
    await this.personalizeAchievement(achievement, triggerData);
    
    await achievement.save();
    return achievement;
  }
  
  private generatePersonalizedDescription(achievement: IEvolutiveAchievement, tierData: any): string {
    const baseDescription = this.baseAchievements[achievement.baseId as keyof typeof this.baseAchievements]?.description || '';
    
    // Add personal touches based on user's journey
    const personalElements = achievement.personalizedElements;
    
    if (personalElements.customDescription) {
      return personalElements.customDescription;
    }
    
    // Generate based on user's musical journey
    const personalizedPhrases = [
      'Your unique musical path has led you here',
      'Through your distinct taste, you\'ve become',
      'Your musical soul has evolved into',
      'The rhythm of your journey created'
    ];
    
    const randomPhrase = personalizedPhrases[Math.floor(Math.random() * personalizedPhrases.length)];
    return `${baseDescription}. ${randomPhrase} ${tierData.name}.`;
  }
  
  private evolveIcon(currentIcon: string, tier: number): string {
    const evolutionMaps: { [key: string]: string[] } = {
      '🎵': ['🎵', '🎶', '🎼', '🎹', '🌟'],
      '🤝': ['🤝', '👥', '🌐', '🌍', '💫'],
      '🥁': ['🥁', '🎺', '🎸', '🎻', '🎭'],
      '🍂': ['🌱', '🌸', '☀️', '🍂', '❄️']
    };
    
    const evolutionPath = evolutionMaps[currentIcon];
    return evolutionPath ? evolutionPath[Math.min(tier - 1, evolutionPath.length - 1)] : currentIcon;
  }
  
  private generateEvolutionReason(achievement: IEvolutiveAchievement, triggerData: any): string {
    const reasons = {
      'musical-explorer': [
        'Discovered new musical territories',
        'Expanded sonic horizons',
        'Embraced musical diversity'
      ],
      'social-connector': [
        'Brought people together through music',
        'Created musical bridges',
        'Fostered community connections'
      ],
      'rhythm-master': [
        'Mastered complex rhythmic patterns',
        'Achieved perfect timing',
        'Transcended rhythmic boundaries'
      ],
      'season-listener': [
        'Adapted to seasonal musical moods',
        'Embraced temporal musical flows',
        'Synchronized with natural rhythms'
      ]
    };
    
    const baseReasons = reasons[achievement.baseId as keyof typeof reasons] || ['Continued musical growth'];
    return baseReasons[Math.floor(Math.random() * baseReasons.length)];
  }
  
  private generateJourneyEntry(achievement: IEvolutiveAchievement, newForm: any): string {
    const entries = [
      `Transformed into ${newForm.name}, embracing new musical possibilities`,
      `Reached the ${newForm.name} milestone, unlocking deeper musical understanding`,
      `Evolved to ${newForm.name}, marking a significant musical growth`,
      `Ascended to ${newForm.name}, reflecting true musical evolution`
    ];
    
    return entries[Math.floor(Math.random() * entries.length)];
  }
  
  private generateImpactDescription(newForm: any): string {
    const impacts = {
      common: 'A foundation of musical discovery',
      rare: 'Noticeable influence on musical taste',
      epic: 'Significant impact on musical community',
      legendary: 'Legendary status in musical expertise',
      mythical: 'Mythical influence transcending normal boundaries'
    };
    
    return impacts[newForm.rarity as keyof typeof impacts] || 'Musical growth achieved';
  }
  
  private generateEvolutionHints(baseId: string, currentTier: number): string[] {
    const hints: { [key: string]: { [key: number]: string[] } } = {
      'musical-explorer': {
        1: ['Try listening to genres you\'ve never explored', 'Rate different types of music'],
        2: ['Discover underground artists', 'Explore world music'],
        3: ['Curate playlists for others', 'Find emerging talents'],
        4: ['Predict the next big musical trend', 'Become a tastemaker']
      },
      'social-connector': {
        1: ['Share music with friends', 'Join listening parties'],
        2: ['Create collaborative playlists', 'Host music events'],
        3: ['Bridge different musical communities', 'Mentor new listeners'],
        4: ['Connect global music communities', 'Facilitate cross-cultural musical exchange']
      },
      'rhythm-master': {
        1: ['Practice with karaoke', 'Focus on timing accuracy'],
        2: ['Master complex time signatures', 'Study polyrhythms'],
        3: ['Create your own rhythmic patterns', 'Teach rhythm to others'],
        4: ['Transcend traditional rhythm concepts', 'Innovate new rhythmic forms']
      },
      'season-listener': {
        1: ['Listen actively during current season', 'Match music to weather'],
        2: ['Adapt playlists seasonally', 'Feel the seasonal moods'],
        3: ['Predict seasonal music trends', 'Create seasonal ambiances'],
        4: ['Master the cyclical nature of musical time', 'Become one with temporal rhythms']
      }
    };
    
    return hints[baseId]?.[currentTier] || ['Continue your musical journey'];
  }
  
  private async personalizeAchievement(achievement: IEvolutiveAchievement, triggerData: any): Promise<void> {
    // Add personalized triggers based on user behavior
    if (triggerData.context) {
      achievement.personalizedElements.personalizedTriggers.push(triggerData.context);
    }
    
    // Potential for custom naming if user reaches certain tier
    if (achievement.currentForm.tier >= 3 && !achievement.personalizedElements.customName) {
      const names = [
        `${achievement.currentForm.name} ${this.getRandomSuffix()}`,
        `The ${this.getRandomPrefix()} ${achievement.currentForm.name}`,
        `${achievement.currentForm.name} of ${this.getRandomDomain()}`
      ];
      
      achievement.personalizedElements.customName = names[Math.floor(Math.random() * names.length)];
    }
  }
  
  private getRandomSuffix(): string {
    const suffixes = ['of the Dawn', 'of Echoes', 'of Harmony', 'of Rhythm', 'of Dreams'];
    return suffixes[Math.floor(Math.random() * suffixes.length)];
  }
  
  private getRandomPrefix(): string {
    const prefixes = ['Legendary', 'Mystical', 'Ethereal', 'Cosmic', 'Sublime'];
    return prefixes[Math.floor(Math.random() * prefixes.length)];
  }
  
  private getRandomDomain(): string {
    const domains = ['Sound', 'Melody', 'Harmony', 'Frequency', 'Resonance'];
    return domains[Math.floor(Math.random() * domains.length)];
  }
  
  private generateInitialNarrative(baseId: string, userId: string): string {
    const narratives = {
      'musical-explorer': 'A new soul awakens to the vast musical universe',
      'social-connector': 'Someone who will bring hearts together through rhythm',
      'rhythm-master': 'A student of time and beat begins their journey',
      'season-listener': 'A being attuned to the natural cycles of sound'
    };
    
    return narratives[baseId as keyof typeof narratives] || 'A new musical journey begins';
  }
  
  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  }
  
  private calculateSeasonEnd(): Date {
    const now = new Date();
    const month = now.getMonth();
    
    let endMonth: number;
    if (month >= 2 && month <= 4) endMonth = 5; // Spring ends in May
    else if (month >= 5 && month <= 7) endMonth = 8; // Summer ends in August
    else if (month >= 8 && month <= 10) endMonth = 11; // Autumn ends in November
    else endMonth = 2; // Winter ends in February (next year)
    
    const endDate = new Date(now.getFullYear(), endMonth, 1);
    if (endMonth === 2 && month >= 11) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    
    return endDate;
  }
  
  async discoverMysteryAchievement(
    achievementId: string,
    discoveredBy: string,
    clue: string
  ): Promise<boolean> {
    
    const achievement = await EvolutiveAchievement.findOne({ id: achievementId });
    if (!achievement || achievement.mysteryElements.communityDiscovered) return false;
    
    achievement.mysteryElements.communityDiscovered = true;
    achievement.mysteryElements.discoveredBy = discoveredBy;
    achievement.mysteryElements.discoveryDate = new Date();
    achievement.mysteryElements.cluesGiven.push(clue);
    
    await achievement.save();
    return true;
  }
  
  async getEvolutionTimeline(userId: string, guildId: string): Promise<any[]> {
    const achievements = await EvolutiveAchievement.find({ userId, guildId })
      .sort({ unlockedAt: 1 });
    
    const timeline = [];
    
    for (const achievement of achievements) {
      for (const evolution of achievement.evolutionPath) {
        timeline.push({
          timestamp: evolution.timestamp,
          achievementName: achievement.currentForm.name,
          evolution: evolution.newForm,
          reason: evolution.evolutionReason,
          trigger: evolution.triggerEvent,
          narrative: achievement.narrativeElements.personalJourney.find(j => 
            j.includes(evolution.newForm.name)
          )
        });
      }
    }
    
    return timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  
  async createCollaborativeAchievement(
    achievementData: {
      name: string;
      description: string;
      requiredPartners: number;
      groupObjective: string;
      guildId: string;
    }
  ): Promise<string> {
    
    const collaborativeId = uuidv4();
    
    // This would be stored in a separate collaborative achievements collection
    // For now, we'll return the ID for tracking
    
    return collaborativeId;
  }
}
