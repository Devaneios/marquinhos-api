import mongoose from 'mongoose';

export interface IPredictiveTrends extends mongoose.Document {
  guildId: string;
  analysisTimestamp: Date;
  predictionScope: {
    timeframe: string; // 1week, 1month, 3months, 6months, 1year
    confidence: number; // 0-100
    dataPoints: number;
    analysisDepth: string; // surface, intermediate, deep, quantum
  };
  trendDetection: {
    emergingGenres: {
      genre: string;
      currentPopularity: number;
      predictedGrowth: number;
      trendStrength: number;
      earlyAdopters: string[];
      breakoutProbability: number;
      timeToMainstream: number; // weeks
    }[];
    fadingGenres: {
      genre: string;
      currentPopularity: number;
      predictedDecline: number;
      replacementGenres: string[];
      loyalists: string[];
    }[];
    stableGenres: {
      genre: string;
      stabilityScore: number;
      marketShare: number;
      resilience: number;
    }[];
  };
  artistTrajectories: {
    risingStars: {
      artistName: string;
      currentMetrics: {
        plays: number;
        uniqueListeners: number;
        growth: number;
      };
      predictedMetrics: {
        estimatedPlays: number;
        estimatedListeners: number;
        breakoutProbability: number;
      };
      trendFactors: string[];
      supportingGenres: string[];
      criticalMass: Date;
    }[];
    decliningArtists: {
      artistName: string;
      declineFactors: string[];
      recencyEffect: number;
      nostalgiaFactor: number;
    }[];
    stableCatalysts: {
      artistName: string;
      influenceScore: number;
      trendSetting: string[];
      longevity: number;
    }[];
  };
  microTrendSignals: {
    signalId: string;
    signalType: string; // tempo_shift, harmonic_evolution, vocal_style, production_tech
    strength: number;
    firstDetected: Date;
    propagationRate: number;
    affectedGenres: string[];
    originSources: string[];
    predictedImpact: {
      scope: string; // local, regional, global
      timeline: string;
      disruption: number;
    };
  }[];
  culturalPredictions: {
    culturalShifts: {
      shiftType: string;
      trigger: string;
      musicalManifestations: string[];
      timeline: Date;
      certainty: number;
    }[];
    generationalChanges: {
      ageGroup: string;
      changingPreferences: string[];
      drivingFactors: string[];
      adaptationSpeed: number;
    }[];
    seasonalEvolution: {
      season: string;
      evolvingPatterns: string[];
      stabilityChanges: number;
    }[];
  };
  networkAnalysis: {
    influenceNetworks: {
      influencerId: string;
      networkReach: number;
      trendAmplification: number;
      followersImpact: string[];
      crossoverPotential: string[];
    }[];
    viralPrediction: {
      contentId: string;
      viralProbability: number;
      peakPrediction: Date;
      decay: number;
      amplifiers: string[];
    }[];
    clusterEvolution: {
      clusterId: string;
      evolutionDirection: string;
      splittingProbability: number;
      mergingCandidates: string[];
    }[];
  };
  algorithmicInsights: {
    patternRecognition: {
      patterns: {
        patternId: string;
        description: string;
        frequency: number;
        reliability: number;
        applicability: string[];
      }[];
      anomalies: {
        anomalyId: string;
        deviation: number;
        significance: string;
        investigationPriority: number;
      }[];
    };
    machiningLearning: {
      modelAccuracy: number;
      trainingData: number;
      featureImportance: Map<string, number>;
      predictionConfidence: Map<string, number>;
    };
    quantumForecasting: {
      quantumStates: any[];
      probabilityDistributions: Map<string, number[]>;
      entanglementFactors: string[];
      uncertaintyPrinciples: any;
    };
  };
  validationMetrics: {
    historicalAccuracy: {
      oneWeekOut: number;
      oneMonthOut: number;
      threeMonthsOut: number;
      sixMonthsOut: number;
    };
    realTimeValidation: {
      currentPredictions: any[];
      ongoingAccuracy: number;
      adjustmentsMade: number;
    };
    confidenceIntervals: Map<string, {
      lower: number;
      upper: number;
      median: number;
    }>;
  };
  nextAnalysis: Date;
}

const PredictiveTrendsSchema = new mongoose.Schema<IPredictiveTrends>({
  guildId: { type: String, required: true, unique: true },
  analysisTimestamp: { type: Date, default: Date.now },
  predictionScope: {
    timeframe: { 
      type: String, 
      enum: ['1week', '1month', '3months', '6months', '1year'],
      required: true 
    },
    confidence: { type: Number, min: 0, max: 100, required: true },
    dataPoints: { type: Number, required: true },
    analysisDepth: { 
      type: String, 
      enum: ['surface', 'intermediate', 'deep', 'quantum'],
      default: 'intermediate' 
    }
  },
  trendDetection: {
    emergingGenres: [{
      genre: { type: String, required: true },
      currentPopularity: { type: Number, min: 0, max: 100, required: true },
      predictedGrowth: { type: Number, required: true },
      trendStrength: { type: Number, min: 0, max: 100, required: true },
      earlyAdopters: [{ type: String }],
      breakoutProbability: { type: Number, min: 0, max: 1, required: true },
      timeToMainstream: { type: Number, required: true }
    }],
    fadingGenres: [{
      genre: { type: String, required: true },
      currentPopularity: { type: Number, min: 0, max: 100, required: true },
      predictedDecline: { type: Number, required: true },
      replacementGenres: [{ type: String }],
      loyalists: [{ type: String }]
    }],
    stableGenres: [{
      genre: { type: String, required: true },
      stabilityScore: { type: Number, min: 0, max: 100, required: true },
      marketShare: { type: Number, min: 0, max: 100, required: true },
      resilience: { type: Number, min: 0, max: 100, required: true }
    }]
  },
  artistTrajectories: {
    risingStars: [{
      artistName: { type: String, required: true },
      currentMetrics: {
        plays: { type: Number, required: true },
        uniqueListeners: { type: Number, required: true },
        growth: { type: Number, required: true }
      },
      predictedMetrics: {
        estimatedPlays: { type: Number, required: true },
        estimatedListeners: { type: Number, required: true },
        breakoutProbability: { type: Number, min: 0, max: 1, required: true }
      },
      trendFactors: [{ type: String }],
      supportingGenres: [{ type: String }],
      criticalMass: { type: Date }
    }],
    decliningArtists: [{
      artistName: { type: String, required: true },
      declineFactors: [{ type: String }],
      recencyEffect: { type: Number, min: 0, max: 1, required: true },
      nostalgiaFactor: { type: Number, min: 0, max: 1, required: true }
    }],
    stableCatalysts: [{
      artistName: { type: String, required: true },
      influenceScore: { type: Number, min: 0, max: 100, required: true },
      trendSetting: [{ type: String }],
      longevity: { type: Number, required: true }
    }]
  },
  microTrendSignals: [{
    signalId: { type: String, required: true },
    signalType: { 
      type: String, 
      enum: ['tempo_shift', 'harmonic_evolution', 'vocal_style', 'production_tech'],
      required: true 
    },
    strength: { type: Number, min: 0, max: 100, required: true },
    firstDetected: { type: Date, required: true },
    propagationRate: { type: Number, min: 0, max: 1, required: true },
    affectedGenres: [{ type: String }],
    originSources: [{ type: String }],
    predictedImpact: {
      scope: { type: String, enum: ['local', 'regional', 'global'], required: true },
      timeline: { type: String, required: true },
      disruption: { type: Number, min: 0, max: 100, required: true }
    }
  }],
  culturalPredictions: {
    culturalShifts: [{
      shiftType: { type: String, required: true },
      trigger: { type: String, required: true },
      musicalManifestations: [{ type: String }],
      timeline: { type: Date, required: true },
      certainty: { type: Number, min: 0, max: 100, required: true }
    }],
    generationalChanges: [{
      ageGroup: { type: String, required: true },
      changingPreferences: [{ type: String }],
      drivingFactors: [{ type: String }],
      adaptationSpeed: { type: Number, min: 0, max: 1, required: true }
    }],
    seasonalEvolution: [{
      season: { type: String, enum: ['spring', 'summer', 'autumn', 'winter'], required: true },
      evolvingPatterns: [{ type: String }],
      stabilityChanges: { type: Number, required: true }
    }]
  },
  networkAnalysis: {
    influenceNetworks: [{
      influencerId: { type: String, required: true },
      networkReach: { type: Number, min: 0, required: true },
      trendAmplification: { type: Number, min: 0, max: 10, required: true },
      followersImpact: [{ type: String }],
      crossoverPotential: [{ type: String }]
    }],
    viralPrediction: [{
      contentId: { type: String, required: true },
      viralProbability: { type: Number, min: 0, max: 1, required: true },
      peakPrediction: { type: Date, required: true },
      decay: { type: Number, min: 0, max: 1, required: true },
      amplifiers: [{ type: String }]
    }],
    clusterEvolution: [{
      clusterId: { type: String, required: true },
      evolutionDirection: { type: String, required: true },
      splittingProbability: { type: Number, min: 0, max: 1, required: true },
      mergingCandidates: [{ type: String }]
    }]
  },
  algorithmicInsights: {
    patternRecognition: {
      patterns: [{
        patternId: { type: String, required: true },
        description: { type: String, required: true },
        frequency: { type: Number, min: 0, required: true },
        reliability: { type: Number, min: 0, max: 1, required: true },
        applicability: [{ type: String }]
      }],
      anomalies: [{
        anomalyId: { type: String, required: true },
        deviation: { type: Number, required: true },
        significance: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
        investigationPriority: { type: Number, min: 1, max: 10, required: true }
      }]
    },
    machiningLearning: {
      modelAccuracy: { type: Number, min: 0, max: 1, required: true },
      trainingData: { type: Number, min: 0, required: true },
      featureImportance: {
        type: Map,
        of: Number,
        default: new Map()
      },
      predictionConfidence: {
        type: Map,
        of: Number,
        default: new Map()
      }
    },
    quantumForecasting: {
      quantumStates: [{ type: mongoose.Schema.Types.Mixed }],
      probabilityDistributions: {
        type: Map,
        of: [Number],
        default: new Map()
      },
      entanglementFactors: [{ type: String }],
      uncertaintyPrinciples: { type: mongoose.Schema.Types.Mixed }
    }
  },
  validationMetrics: {
    historicalAccuracy: {
      oneWeekOut: { type: Number, min: 0, max: 100, default: 0 },
      oneMonthOut: { type: Number, min: 0, max: 100, default: 0 },
      threeMonthsOut: { type: Number, min: 0, max: 100, default: 0 },
      sixMonthsOut: { type: Number, min: 0, max: 100, default: 0 }
    },
    realTimeValidation: {
      currentPredictions: [{ type: mongoose.Schema.Types.Mixed }],
      ongoingAccuracy: { type: Number, min: 0, max: 100, default: 0 },
      adjustmentsMade: { type: Number, default: 0 }
    },
    confidenceIntervals: {
      type: Map,
      of: {
        lower: { type: Number, required: true },
        upper: { type: Number, required: true },
        median: { type: Number, required: true }
      },
      default: new Map()
    }
  },
  nextAnalysis: { type: Date, required: true }
}, {
  timestamps: true
});

PredictiveTrendsSchema.index({ guildId: 1 });
PredictiveTrendsSchema.index({ analysisTimestamp: -1 });
PredictiveTrendsSchema.index({ 'predictionScope.timeframe': 1 });

export default mongoose.model<IPredictiveTrends>('PredictiveTrends', PredictiveTrendsSchema);
