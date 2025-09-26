import mongoose from 'mongoose';

export interface IContextualIntelligence extends mongoose.Document {
  guildId: string;
  userId: string;
  timestamp: Date;
  contextData: {
    timeOfDay: string; // morning, afternoon, evening, night
    dayOfWeek: string;
    weather?: string;
    serverActivity: {
      activeUsers: number;
      channelActivity: string; // low, medium, high
      dominantMood: string;
    };
    userActivity: {
      recentCommands: string[];
      voiceChannelDuration: number;
      currentFocus: string; // gaming, studying, working, relaxing
    };
    socialContext: {
      isGroupListening: boolean;
      groupSize?: number;
      groupMood?: string;
      eventType?: string; // celebration, meeting, casual, etc
    };
  };
  recommendations: {
    trackId: string;
    title: string;
    artist: string;
    contextReason: string;
    confidence: number; // 0-100
    adaptiveFactors: string[];
  }[];
  adaptationHistory: {
    timestamp: Date;
    previousContext: any;
    newContext: any;
    adaptationsMade: string[];
    successMetrics: {
      userSatisfaction?: number;
      engagementTime?: number;
      skipRate?: number;
    };
  }[];
  learningPatterns: {
    contextPattern: string;
    preferredGenres: string[];
    optimalTiming: string;
    successRate: number;
    sampleSize: number;
  }[];
  contextualPreferences: Map<string, {
    preference: any;
    confidence: number;
    lastUpdated: Date;
  }>;
}

const ContextualIntelligenceSchema = new mongoose.Schema<IContextualIntelligence>({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  contextData: {
    timeOfDay: { type: String, required: true },
    dayOfWeek: { type: String, required: true },
    weather: { type: String },
    serverActivity: {
      activeUsers: { type: Number, required: true },
      channelActivity: { type: String, enum: ['low', 'medium', 'high'], required: true },
      dominantMood: { type: String, required: true }
    },
    userActivity: {
      recentCommands: [{ type: String }],
      voiceChannelDuration: { type: Number, default: 0 },
      currentFocus: { type: String, required: true }
    },
    socialContext: {
      isGroupListening: { type: Boolean, default: false },
      groupSize: { type: Number },
      groupMood: { type: String },
      eventType: { type: String }
    }
  },
  recommendations: [{
    trackId: { type: String, required: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    contextReason: { type: String, required: true },
    confidence: { type: Number, min: 0, max: 100, required: true },
    adaptiveFactors: [{ type: String }]
  }],
  adaptationHistory: [{
    timestamp: { type: Date, default: Date.now },
    previousContext: { type: mongoose.Schema.Types.Mixed },
    newContext: { type: mongoose.Schema.Types.Mixed },
    adaptationsMade: [{ type: String }],
    successMetrics: {
      userSatisfaction: { type: Number, min: 0, max: 100 },
      engagementTime: { type: Number },
      skipRate: { type: Number, min: 0, max: 1 }
    }
  }],
  learningPatterns: [{
    contextPattern: { type: String, required: true },
    preferredGenres: [{ type: String }],
    optimalTiming: { type: String, required: true },
    successRate: { type: Number, min: 0, max: 1, required: true },
    sampleSize: { type: Number, default: 1 }
  }],
  contextualPreferences: {
    type: Map,
    of: {
      preference: { type: mongoose.Schema.Types.Mixed },
      confidence: { type: Number, min: 0, max: 100 },
      lastUpdated: { type: Date, default: Date.now }
    },
    default: new Map()
  }
}, {
  timestamps: true
});

ContextualIntelligenceSchema.index({ guildId: 1, userId: 1, timestamp: -1 });
ContextualIntelligenceSchema.index({ 'contextData.timeOfDay': 1, 'contextData.userActivity.currentFocus': 1 });

export default mongoose.model<IContextualIntelligence>('ContextualIntelligence', ContextualIntelligenceSchema);
