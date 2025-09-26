import mongoose from 'mongoose';

export interface IEmpathySystem extends mongoose.Document {
  guildId: string;
  analysisTimestamp: Date;
  isolationDetection: {
    isolatedUsers: {
      userId: string;
      isolationScore: number; // 0-100
      reasons: string[];
      lastPositiveInteraction: Date;
      musicalLoneliness: number;
      socialDisconnection: number;
    }[];
    communityHealth: number; // 0-100
    fragmentationLevel: number; // 0-100
  };
  musicalBridges: {
    userA: string;
    userB: string;
    compatibilityScore: number;
    bridgeTracks: {
      title: string;
      artist: string;
      bridgeReason: string;
      connectionPotential: number;
    }[];
    recommendationMade: boolean;
    interactionResult?: {
      successful: boolean;
      feedback: string;
      newConnection: boolean;
    };
  }[];
  empathyMappings: {
    userId: string;
    empathyProfile: {
      musicalOpenness: number;
      socialReceptivity: number;
      influenceability: number;
      mentorPotential: number;
    };
    connectionHistory: {
      connectedWith: string;
      connectionStrength: number;
      throughMusic: string[];
      date: Date;
    }[];
  }[];
  communityDynamics: {
    musicalClusters: {
      clusterId: string;
      members: string[];
      centralGenres: string[];
      influence: number;
      openness: number;
    }[];
    bridgeUsers: {
      userId: string;
      bridgeScore: number;
      connectsClusters: string[];
      bridgeGenres: string[];
    }[];
    musicalInfluencers: {
      userId: string;
      influenceScore: number;
      introducedGenres: string[];
      convertedUsers: string[];
    }[];
  };
  interventionHistory: {
    timestamp: Date;
    intervention: string;
    targetUsers: string[];
    success: boolean;
    impact: string;
    followUpNeeded: boolean;
  }[];
  nextAnalysis: Date;
}

const EmpathySystemSchema = new mongoose.Schema<IEmpathySystem>({
  guildId: { type: String, required: true, unique: true },
  analysisTimestamp: { type: Date, default: Date.now },
  isolationDetection: {
    isolatedUsers: [{
      userId: { type: String, required: true },
      isolationScore: { type: Number, min: 0, max: 100, required: true },
      reasons: [{ type: String }],
      lastPositiveInteraction: { type: Date },
      musicalLoneliness: { type: Number, min: 0, max: 100, default: 0 },
      socialDisconnection: { type: Number, min: 0, max: 100, default: 0 }
    }],
    communityHealth: { type: Number, min: 0, max: 100, default: 50 },
    fragmentationLevel: { type: Number, min: 0, max: 100, default: 0 }
  },
  musicalBridges: [{
    userA: { type: String, required: true },
    userB: { type: String, required: true },
    compatibilityScore: { type: Number, min: 0, max: 100, required: true },
    bridgeTracks: [{
      title: { type: String, required: true },
      artist: { type: String, required: true },
      bridgeReason: { type: String, required: true },
      connectionPotential: { type: Number, min: 0, max: 100, required: true }
    }],
    recommendationMade: { type: Boolean, default: false },
    interactionResult: {
      successful: { type: Boolean },
      feedback: { type: String },
      newConnection: { type: Boolean }
    }
  }],
  empathyMappings: [{
    userId: { type: String, required: true },
    empathyProfile: {
      musicalOpenness: { type: Number, min: 0, max: 100, default: 50 },
      socialReceptivity: { type: Number, min: 0, max: 100, default: 50 },
      influenceability: { type: Number, min: 0, max: 100, default: 50 },
      mentorPotential: { type: Number, min: 0, max: 100, default: 50 }
    },
    connectionHistory: [{
      connectedWith: { type: String, required: true },
      connectionStrength: { type: Number, min: 0, max: 100, required: true },
      throughMusic: [{ type: String }],
      date: { type: Date, default: Date.now }
    }]
  }],
  communityDynamics: {
    musicalClusters: [{
      clusterId: { type: String, required: true },
      members: [{ type: String }],
      centralGenres: [{ type: String }],
      influence: { type: Number, min: 0, max: 100, default: 0 },
      openness: { type: Number, min: 0, max: 100, default: 50 }
    }],
    bridgeUsers: [{
      userId: { type: String, required: true },
      bridgeScore: { type: Number, min: 0, max: 100, required: true },
      connectsClusters: [{ type: String }],
      bridgeGenres: [{ type: String }]
    }],
    musicalInfluencers: [{
      userId: { type: String, required: true },
      influenceScore: { type: Number, min: 0, max: 100, required: true },
      introducedGenres: [{ type: String }],
      convertedUsers: [{ type: String }]
    }]
  },
  interventionHistory: [{
    timestamp: { type: Date, default: Date.now },
    intervention: { type: String, required: true },
    targetUsers: [{ type: String }],
    success: { type: Boolean, required: true },
    impact: { type: String, required: true },
    followUpNeeded: { type: Boolean, default: false }
  }],
  nextAnalysis: { type: Date, required: true }
}, {
  timestamps: true
});

EmpathySystemSchema.index({ guildId: 1 });
EmpathySystemSchema.index({ analysisTimestamp: -1 });

export default mongoose.model<IEmpathySystem>('EmpathySystem', EmpathySystemSchema);
