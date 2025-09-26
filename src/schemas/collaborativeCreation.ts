import mongoose from 'mongoose';

export interface ICollaborativeCreation extends mongoose.Document {
  id: string;
  guildId: string;
  projectName: string;
  description: string;
  creatorId: string;
  collaborators: {
    userId: string;
    role: string; // composer, lyricist, producer, vocalist, instrumentalist
    joinedAt: Date;
    contributions: number;
    specialties: string[];
  }[];
  projectType: string; // song, album, remix, mashup, instrumental, acapella
  currentPhase: string; // conception, composition, lyrics, arrangement, production, mixing, mastering, completed
  musicalElements: {
    tempo: number;
    key: string;
    timeSignature: string;
    genre: string[];
    mood: string[];
    inspiration: string;
  };
  structure: {
    sections: {
      sectionId: string;
      name: string; // intro, verse, chorus, bridge, outro, etc.
      duration: number; // in seconds
      order: number;
      contributedBy: string;
      description?: string;
      musicalContent?: string;
    }[];
    totalDuration: number;
    complexity: string; // simple, moderate, complex, experimental
  };
  contributions: {
    contributionId: string;
    contributorId: string;
    type: string; // melody, harmony, rhythm, lyrics, sound_effect, arrangement
    content: {
      text?: string; // for lyrics
      audioFile?: string; // file reference
      midiData?: string; // MIDI sequence
      notation?: string; // musical notation
      loopData?: any; // loop station data
    };
    sectionId?: string; // which section this belongs to
    timestamp: Date;
    votes: {
      userId: string;
      vote: number; // 1-5 stars
      comment?: string;
    }[];
    status: string; // pending, approved, integrated, rejected
    aiEnhancement?: {
      suggested: boolean;
      enhancement: string;
      confidence: number;
    };
  }[];
  collaborationSystem: {
    votingMechanism: {
      votingType: string; // democratic, weighted, hierarchical
      requiredVotes: number;
      passThreshold: number;
    };
    conflictResolution: {
      resolutionMethod: string; // voting, creator_decision, ai_mediation
      pendingConflicts: {
        conflictId: string;
        issue: string;
        involvedContributions: string[];
        resolutionStatus: string;
      }[];
    };
    qualityControl: {
      autoModeration: boolean;
      aiQualityCheck: boolean;
      humanReview: boolean;
      standards: {
        minQuality: number;
        stylistic: string[];
        technical: string[];
      };
    };
  };
  aiAssistance: {
    harmonyGeneration: {
      enabled: boolean;
      suggestions: {
        suggestionId: string;
        harmonyType: string;
        chordProgression: string[];
        confidence: number;
        basedOn: string; // which contribution this is based on
      }[];
    };
    rhythmSync: {
      enabled: boolean;
      quantization: boolean;
      grooveTemplates: string[];
      syncedContributions: string[];
    };
    lyricalCoherence: {
      enabled: boolean;
      themeAnalysis: {
        mainThemes: string[];
        narrative: string;
        emotionalArc: string[];
      };
      suggestions: {
        missingElements: string[];
        improvements: string[];
        rhymeScheme: string;
      };
    };
    productionAssistance: {
      mixingSuggestions: any[];
      instrumentArrangement: any[];
      effectsRecommendations: any[];
    };
  };
  versionControl: {
    versions: {
      versionId: string;
      versionNumber: string;
      timestamp: Date;
      changesFrom: string; // previous version ID
      changeSummary: string;
      contributors: string[];
      audioSnapshot?: string;
      approved: boolean;
    }[];
    branches: {
      branchId: string;
      branchName: string;
      createdBy: string;
      baseVersion: string;
      purpose: string;
      isActive: boolean;
    }[];
    mergeRequests: {
      requestId: string;
      fromBranch: string;
      toBranch: string;
      requestedBy: string;
      changes: any[];
      status: string; // pending, approved, rejected, merged
    }[];
  };
  finalOutput: {
    isCompleted: boolean;
    audioFile?: string;
    mixedVersion?: string;
    masteredVersion?: string;
    metadata: {
      title: string;
      artists: string[];
      credits: {
        role: string;
        contributor: string;
      }[];
      license: string;
      releaseNotes?: string;
    };
    publicationStatus: {
      isPublic: boolean;
      publishedAt?: Date;
      platforms: string[];
      downloads: number;
      plays: number;
      likes: number;
    };
  };
  analytics: {
    contributionStats: Map<string, {
      contributions: number;
      acceptanceRate: number;
      avgRating: number;
      specialization: string[];
    }>;
    phaseMetrics: {
      phase: string;
      timeSpent: number; // hours
      contributionsAdded: number;
      challengesFaced: string[];
    }[];
    collaborationHealth: {
      communicationScore: number;
      conflictRate: number;
      productivityTrend: number;
      satisfactionLevel: number;
    };
  };
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  estimatedCompletion?: Date;
}

const CollaborativeCreationSchema = new mongoose.Schema<ICollaborativeCreation>({
  id: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  projectName: { type: String, required: true },
  description: { type: String, required: true },
  creatorId: { type: String, required: true },
  collaborators: [{
    userId: { type: String, required: true },
    role: { 
      type: String, 
      enum: ['composer', 'lyricist', 'producer', 'vocalist', 'instrumentalist'],
      required: true 
    },
    joinedAt: { type: Date, default: Date.now },
    contributions: { type: Number, default: 0 },
    specialties: [{ type: String }]
  }],
  projectType: { 
    type: String, 
    enum: ['song', 'album', 'remix', 'mashup', 'instrumental', 'acapella'],
    required: true 
  },
  currentPhase: { 
    type: String, 
    enum: ['conception', 'composition', 'lyrics', 'arrangement', 'production', 'mixing', 'mastering', 'completed'],
    default: 'conception' 
  },
  musicalElements: {
    tempo: { type: Number, min: 40, max: 200, required: true },
    key: { type: String, required: true },
    timeSignature: { type: String, default: '4/4' },
    genre: [{ type: String }],
    mood: [{ type: String }],
    inspiration: { type: String }
  },
  structure: {
    sections: [{
      sectionId: { type: String, required: true },
      name: { type: String, required: true },
      duration: { type: Number, min: 0, required: true },
      order: { type: Number, required: true },
      contributedBy: { type: String, required: true },
      description: { type: String },
      musicalContent: { type: String }
    }],
    totalDuration: { type: Number, default: 0 },
    complexity: { 
      type: String, 
      enum: ['simple', 'moderate', 'complex', 'experimental'],
      default: 'moderate' 
    }
  },
  contributions: [{
    contributionId: { type: String, required: true },
    contributorId: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['melody', 'harmony', 'rhythm', 'lyrics', 'sound_effect', 'arrangement'],
      required: true 
    },
    content: {
      text: { type: String },
      audioFile: { type: String },
      midiData: { type: String },
      notation: { type: String },
      loopData: { type: mongoose.Schema.Types.Mixed }
    },
    sectionId: { type: String },
    timestamp: { type: Date, default: Date.now },
    votes: [{
      userId: { type: String, required: true },
      vote: { type: Number, min: 1, max: 5, required: true },
      comment: { type: String }
    }],
    status: { 
      type: String, 
      enum: ['pending', 'approved', 'integrated', 'rejected'],
      default: 'pending' 
    },
    aiEnhancement: {
      suggested: { type: Boolean, default: false },
      enhancement: { type: String },
      confidence: { type: Number, min: 0, max: 1 }
    }
  }],
  collaborationSystem: {
    votingMechanism: {
      votingType: { 
        type: String, 
        enum: ['democratic', 'weighted', 'hierarchical'],
        default: 'democratic' 
      },
      requiredVotes: { type: Number, default: 3 },
      passThreshold: { type: Number, default: 0.6 }
    },
    conflictResolution: {
      resolutionMethod: { 
        type: String, 
        enum: ['voting', 'creator_decision', 'ai_mediation'],
        default: 'voting' 
      },
      pendingConflicts: [{
        conflictId: { type: String, required: true },
        issue: { type: String, required: true },
        involvedContributions: [{ type: String }],
        resolutionStatus: { type: String, default: 'pending' }
      }]
    },
    qualityControl: {
      autoModeration: { type: Boolean, default: true },
      aiQualityCheck: { type: Boolean, default: true },
      humanReview: { type: Boolean, default: true },
      standards: {
        minQuality: { type: Number, min: 1, max: 5, default: 3 },
        stylistic: [{ type: String }],
        technical: [{ type: String }]
      }
    }
  },
  aiAssistance: {
    harmonyGeneration: {
      enabled: { type: Boolean, default: true },
      suggestions: [{
        suggestionId: { type: String, required: true },
        harmonyType: { type: String, required: true },
        chordProgression: [{ type: String }],
        confidence: { type: Number, min: 0, max: 1, required: true },
        basedOn: { type: String, required: true }
      }]
    },
    rhythmSync: {
      enabled: { type: Boolean, default: true },
      quantization: { type: Boolean, default: true },
      grooveTemplates: [{ type: String }],
      syncedContributions: [{ type: String }]
    },
    lyricalCoherence: {
      enabled: { type: Boolean, default: true },
      themeAnalysis: {
        mainThemes: [{ type: String }],
        narrative: { type: String },
        emotionalArc: [{ type: String }]
      },
      suggestions: {
        missingElements: [{ type: String }],
        improvements: [{ type: String }],
        rhymeScheme: { type: String }
      }
    },
    productionAssistance: {
      mixingSuggestions: [{ type: mongoose.Schema.Types.Mixed }],
      instrumentArrangement: [{ type: mongoose.Schema.Types.Mixed }],
      effectsRecommendations: [{ type: mongoose.Schema.Types.Mixed }]
    }
  },
  versionControl: {
    versions: [{
      versionId: { type: String, required: true },
      versionNumber: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      changesFrom: { type: String },
      changeSummary: { type: String, required: true },
      contributors: [{ type: String }],
      audioSnapshot: { type: String },
      approved: { type: Boolean, default: false }
    }],
    branches: [{
      branchId: { type: String, required: true },
      branchName: { type: String, required: true },
      createdBy: { type: String, required: true },
      baseVersion: { type: String, required: true },
      purpose: { type: String, required: true },
      isActive: { type: Boolean, default: true }
    }],
    mergeRequests: [{
      requestId: { type: String, required: true },
      fromBranch: { type: String, required: true },
      toBranch: { type: String, required: true },
      requestedBy: { type: String, required: true },
      changes: [{ type: mongoose.Schema.Types.Mixed }],
      status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'merged'],
        default: 'pending' 
      }
    }]
  },
  finalOutput: {
    isCompleted: { type: Boolean, default: false },
    audioFile: { type: String },
    mixedVersion: { type: String },
    masteredVersion: { type: String },
    metadata: {
      title: { type: String },
      artists: [{ type: String }],
      credits: [{
        role: { type: String, required: true },
        contributor: { type: String, required: true }
      }],
      license: { type: String, default: 'All Rights Reserved' },
      releaseNotes: { type: String }
    },
    publicationStatus: {
      isPublic: { type: Boolean, default: false },
      publishedAt: { type: Date },
      platforms: [{ type: String }],
      downloads: { type: Number, default: 0 },
      plays: { type: Number, default: 0 },
      likes: { type: Number, default: 0 }
    }
  },
  analytics: {
    contributionStats: {
      type: Map,
      of: {
        contributions: { type: Number, default: 0 },
        acceptanceRate: { type: Number, default: 0 },
        avgRating: { type: Number, default: 0 },
        specialization: [{ type: String }]
      },
      default: new Map()
    },
    phaseMetrics: [{
      phase: { type: String, required: true },
      timeSpent: { type: Number, default: 0 },
      contributionsAdded: { type: Number, default: 0 },
      challengesFaced: [{ type: String }]
    }],
    collaborationHealth: {
      communicationScore: { type: Number, min: 0, max: 100, default: 50 },
      conflictRate: { type: Number, min: 0, max: 1, default: 0 },
      productivityTrend: { type: Number, default: 0 },
      satisfactionLevel: { type: Number, min: 0, max: 100, default: 50 }
    }
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  estimatedCompletion: { type: Date }
}, {
  timestamps: true
});

CollaborativeCreationSchema.index({ guildId: 1, isActive: 1 });
CollaborativeCreationSchema.index({ creatorId: 1 });
CollaborativeCreationSchema.index({ 'collaborators.userId': 1 });

export default mongoose.model<ICollaborativeCreation>('CollaborativeCreation', CollaborativeCreationSchema);
