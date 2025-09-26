import mongoose from 'mongoose';

export interface IEvolutiveAchievement extends mongoose.Document {
  id: string;
  baseId: string; // Base achievement ID
  userId: string;
  guildId: string;
  currentForm: {
    name: string;
    description: string;
    icon: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythical';
    tier: number;
  };
  evolutionPath: {
    timestamp: Date;
    previousForm: any;
    newForm: any;
    triggerEvent: string;
    evolutionReason: string;
  }[];
  personalizedElements: {
    customName?: string;
    customDescription?: string;
    customIcon?: string;
    personalizedTriggers: string[];
  };
  narrativeElements: {
    storyChapter: number;
    characterDevelopment: string;
    personalJourney: string[];
    milestones: {
      date: Date;
      achievement: string;
      impact: string;
    }[];
  };
  temporalProperties: {
    isTimebound: boolean;
    availableUntil?: Date;
    seasonalType?: string;
    eventTied?: string;
  };
  collaborativeRequirements?: {
    requiredPartners: number;
    partnerIds: string[];
    groupObjective: string;
    distributedRewards: any[];
  };
  mysteryElements: {
    hasHiddenRequirements: boolean;
    communityDiscovered: boolean;
    discoveredBy?: string;
    discoveryDate?: Date;
    cluesGiven: string[];
  };
  nextEvolutionHints: string[];
  unlockedAt: Date;
  lastEvolution: Date;
}

const EvolutiveAchievementSchema = new mongoose.Schema<IEvolutiveAchievement>({
  id: { type: String, required: true, unique: true },
  baseId: { type: String, required: true },
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  currentForm: {
    name: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    rarity: { 
      type: String, 
      enum: ['common', 'rare', 'epic', 'legendary', 'mythical'],
      required: true 
    },
    tier: { type: Number, default: 1 }
  },
  evolutionPath: [{
    timestamp: { type: Date, default: Date.now },
    previousForm: { type: mongoose.Schema.Types.Mixed },
    newForm: { type: mongoose.Schema.Types.Mixed },
    triggerEvent: { type: String, required: true },
    evolutionReason: { type: String, required: true }
  }],
  personalizedElements: {
    customName: { type: String },
    customDescription: { type: String },
    customIcon: { type: String },
    personalizedTriggers: [{ type: String }]
  },
  narrativeElements: {
    storyChapter: { type: Number, default: 1 },
    characterDevelopment: { type: String, required: true },
    personalJourney: [{ type: String }],
    milestones: [{
      date: { type: Date, default: Date.now },
      achievement: { type: String, required: true },
      impact: { type: String, required: true }
    }]
  },
  temporalProperties: {
    isTimebound: { type: Boolean, default: false },
    availableUntil: { type: Date },
    seasonalType: { type: String },
    eventTied: { type: String }
  },
  collaborativeRequirements: {
    requiredPartners: { type: Number },
    partnerIds: [{ type: String }],
    groupObjective: { type: String },
    distributedRewards: [{ type: mongoose.Schema.Types.Mixed }]
  },
  mysteryElements: {
    hasHiddenRequirements: { type: Boolean, default: false },
    communityDiscovered: { type: Boolean, default: false },
    discoveredBy: { type: String },
    discoveryDate: { type: Date },
    cluesGiven: [{ type: String }]
  },
  nextEvolutionHints: [{ type: String }],
  unlockedAt: { type: Date, default: Date.now },
  lastEvolution: { type: Date, default: Date.now }
}, {
  timestamps: true
});

EvolutiveAchievementSchema.index({ userId: 1, guildId: 1 });
EvolutiveAchievementSchema.index({ baseId: 1 });

export default mongoose.model<IEvolutiveAchievement>('EvolutiveAchievement', EvolutiveAchievementSchema);
