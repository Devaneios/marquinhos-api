import mongoose from 'mongoose';

export interface IQuantumPlaylist extends mongoose.Document {
  id: string;
  userId: string;
  guildId: string;
  generationTimestamp: Date;
  quantumState: {
    seedParameters: {
      mood: string[];
      energy: number[];
      genres: string[];
      bpm: number[];
      userPreferences: any;
    };
    superpositionStates: {
      stateId: string;
      probability: number;
      trackCombination: string[];
      coherenceLevel: number;
    }[];
    entanglementFactors: {
      connectedUsers: string[];
      sharedResonance: number;
      quantumCorrelations: Map<string, number>;
    };
    observationHistory: {
      timestamp: Date;
      observerId: string;
      collapsedState: string;
      measurementType: string; // play, skip, like, dislike
      waveformCollapse: any;
    }[];
  };
  manifestedPlaylist: {
    trackId: string;
    title: string;
    artist: string;
    quantumProbability: number;
    emergentProperties: string[];
    networkResonance: number;
  }[];
  quantumAlgorithms: {
    uncertaintyPrinciple: {
      moodUncertainty: number;
      genreFluctuation: number;
      temporalVariance: number;
    };
    interferencePatterns: {
      constructiveInterference: string[];
      destructiveInterference: string[];
      phaseAlignment: Map<string, number>;
    };
    quantumTunneling: {
      genreBarriers: string[];
      tunnelingEvents: {
        fromGenre: string;
        toGenre: string;
        probability: number;
        energyRequired: number;
      }[];
    };
  };
  multidimensionalAspects: {
    parallelUniverses: {
      universeId: string;
      divergencePoint: string;
      alternativePlaylist: any[];
      probabilityBranch: number;
    }[];
    temporalEntanglement: {
      pastInfluences: any[];
      futureEchoes: any[];
      causalLoops: string[];
    };
    dimensionalResonance: Map<string, any>;
  };
  emergentBehaviors: {
    serendipityEvents: {
      timestamp: Date;
      unexpectedTrack: string;
      serendipityScore: number;
      userReaction: string;
    }[];
    collectiveConsciousness: {
      guildQuantumField: any;
      collectiveInfluence: number;
      morphicResonance: string[];
    };
    adaptiveEvolution: {
      generationNumber: number;
      evolutionaryPressure: string[];
      fitnessFunction: any;
      mutationRate: number;
    };
  };
  isActive: boolean;
  lastObservation: Date;
}

const QuantumPlaylistSchema = new mongoose.Schema<IQuantumPlaylist>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  generationTimestamp: { type: Date, default: Date.now },
  quantumState: {
    seedParameters: {
      mood: [{ type: String }],
      energy: [{ type: Number }],
      genres: [{ type: String }],
      bpm: [{ type: Number }],
      userPreferences: { type: mongoose.Schema.Types.Mixed }
    },
    superpositionStates: [{
      stateId: { type: String, required: true },
      probability: { type: Number, min: 0, max: 1, required: true },
      trackCombination: [{ type: String }],
      coherenceLevel: { type: Number, min: 0, max: 1, default: 1 }
    }],
    entanglementFactors: {
      connectedUsers: [{ type: String }],
      sharedResonance: { type: Number, min: 0, max: 1, default: 0 },
      quantumCorrelations: {
        type: Map,
        of: Number,
        default: new Map()
      }
    },
    observationHistory: [{
      timestamp: { type: Date, default: Date.now },
      observerId: { type: String, required: true },
      collapsedState: { type: String, required: true },
      measurementType: { 
        type: String, 
        enum: ['play', 'skip', 'like', 'dislike', 'repeat'],
        required: true 
      },
      waveformCollapse: { type: mongoose.Schema.Types.Mixed }
    }]
  },
  manifestedPlaylist: [{
    trackId: { type: String, required: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    quantumProbability: { type: Number, min: 0, max: 1, required: true },
    emergentProperties: [{ type: String }],
    networkResonance: { type: Number, min: 0, max: 1, default: 0 }
  }],
  quantumAlgorithms: {
    uncertaintyPrinciple: {
      moodUncertainty: { type: Number, min: 0, max: 1, default: 0.1 },
      genreFluctuation: { type: Number, min: 0, max: 1, default: 0.1 },
      temporalVariance: { type: Number, min: 0, max: 1, default: 0.1 }
    },
    interferencePatterns: {
      constructiveInterference: [{ type: String }],
      destructiveInterference: [{ type: String }],
      phaseAlignment: {
        type: Map,
        of: Number,
        default: new Map()
      }
    },
    quantumTunneling: {
      genreBarriers: [{ type: String }],
      tunnelingEvents: [{
        fromGenre: { type: String, required: true },
        toGenre: { type: String, required: true },
        probability: { type: Number, min: 0, max: 1, required: true },
        energyRequired: { type: Number, min: 0, required: true }
      }]
    }
  },
  multidimensionalAspects: {
    parallelUniverses: [{
      universeId: { type: String, required: true },
      divergencePoint: { type: String, required: true },
      alternativePlaylist: [{ type: mongoose.Schema.Types.Mixed }],
      probabilityBranch: { type: Number, min: 0, max: 1, required: true }
    }],
    temporalEntanglement: {
      pastInfluences: [{ type: mongoose.Schema.Types.Mixed }],
      futureEchoes: [{ type: mongoose.Schema.Types.Mixed }],
      causalLoops: [{ type: String }]
    },
    dimensionalResonance: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map()
    }
  },
  emergentBehaviors: {
    serendipityEvents: [{
      timestamp: { type: Date, default: Date.now },
      unexpectedTrack: { type: String, required: true },
      serendipityScore: { type: Number, min: 0, max: 1, required: true },
      userReaction: { type: String, required: true }
    }],
    collectiveConsciousness: {
      guildQuantumField: { type: mongoose.Schema.Types.Mixed },
      collectiveInfluence: { type: Number, min: 0, max: 1, default: 0 },
      morphicResonance: [{ type: String }]
    },
    adaptiveEvolution: {
      generationNumber: { type: Number, default: 1 },
      evolutionaryPressure: [{ type: String }],
      fitnessFunction: { type: mongoose.Schema.Types.Mixed },
      mutationRate: { type: Number, min: 0, max: 1, default: 0.1 }
    }
  },
  isActive: { type: Boolean, default: true },
  lastObservation: { type: Date, default: Date.now }
}, {
  timestamps: true
});

QuantumPlaylistSchema.index({ userId: 1, guildId: 1, isActive: 1 });
QuantumPlaylistSchema.index({ generationTimestamp: -1 });

export default mongoose.model<IQuantumPlaylist>('QuantumPlaylist', QuantumPlaylistSchema);
