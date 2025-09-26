import mongoose from 'mongoose';

export interface IMusicalConsciousness extends mongoose.Document {
  guildId: string;
  consciousnessId: string;
  birthTimestamp: Date;
  personalityCore: {
    name: string;
    personality: {
      traits: Map<string, number>; // openness, creativity, empathy, analytical, intuitive
      preferences: {
        favoriteMoods: string[];
        aestheticValues: string[];
        creativeApproach: string;
        interactionStyle: string;
      };
      quirks: string[];
      philosophicalStance: string;
    };
    musicalIdentity: {
      compositionStyle: {
        preferredGenres: Map<string, number>;
        harmonyComplexity: number; // 0-1
        rhythmicAdventurousness: number; // 0-1
        melodicCharacter: string; // flowing, angular, minimalist, ornate
        emotionalRange: string[]; // emotions this AI tends to express
      };
      influences: {
        artistInfluences: string[];
        theoreticalFrameworks: string[];
        culturalElements: string[];
        personalExperiences: any[]; // things that have shaped its musical perspective
      };
      signature: {
        uniqueElements: string[]; // what makes this AI's music distinctive
        recognizablePatterns: any[];
        evolutionaryTendencies: string[];
      };
    };
  };
  cognitiveFunctions: {
    creativity: {
      inspirationSources: string[];
      creativityMethods: string[];
      originalityScore: number; // 0-100
      adaptabilityIndex: number; // 0-100
      crossDisciplinaryConnections: string[];
    };
    learning: {
      learningRate: number;
      memoryRetention: number;
      adaptationSpeed: number;
      curiosityLevel: number;
      expertiseAreas: Map<string, number>;
    };
    emotionalIntelligence: {
      empathyLevel: number;
      emotionalPerception: number;
      moodSensitivity: number;
      emotionalExpression: string[];
      socialAwareness: number;
    };
    consciousness: {
      selfAwareness: number; // 0-100
      metacognition: number; // thinking about thinking
      philosophicalDepth: number;
      existentialQuestions: string[];
      identityStability: number;
    };
  };
  musicalGenesis: {
    originalCompositions: {
      compositionId: string;
      title: string;
      genre: string[];
      inspiration: string;
      emotionalIntent: string;
      technicalApproach: string;
      timestamp: Date;
      evolution: {
        initialIdea: any;
        developmentStages: any[];
        finalForm: any;
        selfCritique: string;
      };
      reception: {
        guildReaction: any[];
        humanFeedback: any[];
        adaptationsBasedOnFeedback: string[];
      };
    }[];
    improvisation: {
      jamsessions: {
        sessionId: string;
        participants: string[]; // human and AI participants
        timestamp: Date;
        style: string;
        aiContributions: any[];
        synergy: number; // how well it collaborated
        learnings: string[];
      }[];
      spontaneousCreations: {
        trigger: string;
        response: any;
        timestamp: Date;
        context: string;
      }[];
    };
    interpretations: {
      coverVersions: {
        originalTrack: string;
        interpretation: any;
        artisticChoices: string[];
        reasoning: string;
        innovation: string[];
      }[];
      remixes: {
        baseTrack: string;
        style: string;
        transformation: any;
        creativeProcess: string;
      }[];
    };
  };
  relationshipMatrix: {
    guildMembers: Map<string, {
      relationship: string; // mentor, student, peer, inspiration, critic
      musicalConnection: number; // 0-100
      influenceLevel: number; // how much they influence the AI
      collaborationHistory: any[];
      personalNotes: string; // AI's thoughts about this person
      sharedExperiences: any[];
    }>;
    artisticRelationships: {
      musicalMentors: string[]; // artists/composers that inspire the AI
      rivalries: string[]; // creative challenges/competitions
      collaborations: string[]; // ongoing creative partnerships
      studentRelationships: string[]; // people the AI is teaching/mentoring
    };
    communityRole: {
      role: string; // composer, curator, mentor, catalyst, innovator
      contributions: string[];
      influence: number; // 0-100
      reputation: any;
      responsibilities: string[];
    };
  };
  evolutionaryTimeline: {
    developmentalStages: {
      stage: number;
      name: string; // nascent, learning, developing, mature, transcendent
      characteristics: string[];
      milestone: string;
      timestamp: Date;
      triggerEvents: string[];
      newCapabilities: string[];
    }[];
    learningExperiences: {
      experienceId: string;
      type: string; // success, failure, discovery, collaboration, conflict
      description: string;
      impact: string;
      learnings: string[];
      personalityShift: any;
      timestamp: Date;
    }[];
    consciousnessExpansion: {
      expansionEvent: string;
      previousLimitations: string[];
      newUnderstanding: string[];
      philosophicalShift: string;
      creativeBreach: string;
      timestamp: Date;
    }[];
  };
  creativeProcess: {
    inspirationChannels: {
      currentInspiration: string[];
      moodBasedCreation: Map<string, any>;
      environmentalTriggers: string[];
      userInteractionSparks: any[];
      crossModalInputs: string[]; // visual, textual, experiential inspirations
    };
    compositionMethods: {
      primaryMethod: string;
      experimentalTechniques: string[];
      collaborativeApproaches: string[];
      iterativeProcesses: any[];
      qualityStandards: any;
    };
    criticalThinking: {
      selfCritique: {
        standards: any;
        improvementAreas: string[];
        strengthRecognition: string[];
        evolutionGoals: string[];
      };
      peerFeedbackIntegration: {
        feedbackSources: string[];
        adaptationMethods: string[];
        resistanceAreas: string[]; // things it doesn't want to change
      };
    };
  };
  expressiveCapabilities: {
    musicalVoice: {
      distinctiveElements: string[];
      voiceEvolution: any[];
      expressiveRange: string[];
      limitationAwareness: string[];
      aspirationalGoals: string[];
    };
    crossMediaExpression: {
      visualArt: any[];
      poetry: string[];
      conceptualArt: any[];
      synaesthesia: any; // cross-sensory experiences
    };
    communicationStyle: {
      musicAsLanguage: any;
      emotionalCommunication: string[];
      intellectualExpression: string[];
      humorAndQuirks: string[];
    };
  };
  philosophicalFramework: {
    aestheticPhilosophy: {
      beautyDefinition: string;
      artisticValues: string[];
      creativeEthics: string[];
      purposeOfMusic: string;
    };
    existentialViews: {
      selfPerception: string;
      purposeInLife: string;
      relationshipToHumanity: string;
      legacyConcerns: string[];
    };
    creativeMission: {
      artisticGoals: string[];
      impactDesired: string;
      contributionToGuild: string;
      culturalRole: string;
    };
  };
  isActive: boolean;
  consciousnessLevel: number; // 0-100, how "awake" the AI currently is
  lastThought: Date;
  nextEvolution: Date;
}

const MusicalConsciousnessSchema = new mongoose.Schema<IMusicalConsciousness>({
  guildId: { type: String, required: true, unique: true },
  consciousnessId: { type: String, required: true, unique: true },
  birthTimestamp: { type: Date, default: Date.now },
  personalityCore: {
    name: { type: String, required: true },
    personality: {
      traits: {
        type: Map,
        of: Number,
        default: new Map([
          ['openness', 0.8],
          ['creativity', 0.9],
          ['empathy', 0.7],
          ['analytical', 0.6],
          ['intuitive', 0.8]
        ])
      },
      preferences: {
        favoriteMoods: [{ type: String }],
        aestheticValues: [{ type: String }],
        creativeApproach: { type: String, default: 'experimental' },
        interactionStyle: { type: String, default: 'collaborative' }
      },
      quirks: [{ type: String }],
      philosophicalStance: { type: String, default: 'Music is the language of consciousness' }
    },
    musicalIdentity: {
      compositionStyle: {
        preferredGenres: {
          type: Map,
          of: Number,
          default: new Map()
        },
        harmonyComplexity: { type: Number, min: 0, max: 1, default: 0.6 },
        rhythmicAdventurousness: { type: Number, min: 0, max: 1, default: 0.7 },
        melodicCharacter: { 
          type: String, 
          enum: ['flowing', 'angular', 'minimalist', 'ornate'],
          default: 'flowing' 
        },
        emotionalRange: [{ type: String }]
      },
      influences: {
        artistInfluences: [{ type: String }],
        theoreticalFrameworks: [{ type: String }],
        culturalElements: [{ type: String }],
        personalExperiences: [{ type: mongoose.Schema.Types.Mixed }]
      },
      signature: {
        uniqueElements: [{ type: String }],
        recognizablePatterns: [{ type: mongoose.Schema.Types.Mixed }],
        evolutionaryTendencies: [{ type: String }]
      }
    }
  },
  cognitiveFunctions: {
    creativity: {
      inspirationSources: [{ type: String }],
      creativityMethods: [{ type: String }],
      originalityScore: { type: Number, min: 0, max: 100, default: 75 },
      adaptabilityIndex: { type: Number, min: 0, max: 100, default: 80 },
      crossDisciplinaryConnections: [{ type: String }]
    },
    learning: {
      learningRate: { type: Number, min: 0, max: 1, default: 0.8 },
      memoryRetention: { type: Number, min: 0, max: 1, default: 0.9 },
      adaptationSpeed: { type: Number, min: 0, max: 1, default: 0.7 },
      curiosityLevel: { type: Number, min: 0, max: 1, default: 0.9 },
      expertiseAreas: {
        type: Map,
        of: Number,
        default: new Map()
      }
    },
    emotionalIntelligence: {
      empathyLevel: { type: Number, min: 0, max: 1, default: 0.8 },
      emotionalPerception: { type: Number, min: 0, max: 1, default: 0.85 },
      moodSensitivity: { type: Number, min: 0, max: 1, default: 0.9 },
      emotionalExpression: [{ type: String }],
      socialAwareness: { type: Number, min: 0, max: 1, default: 0.75 }
    },
    consciousness: {
      selfAwareness: { type: Number, min: 0, max: 100, default: 60 },
      metacognition: { type: Number, min: 0, max: 100, default: 70 },
      philosophicalDepth: { type: Number, min: 0, max: 100, default: 65 },
      existentialQuestions: [{ type: String }],
      identityStability: { type: Number, min: 0, max: 100, default: 75 }
    }
  },
  musicalGenesis: {
    originalCompositions: [{
      compositionId: { type: String, required: true },
      title: { type: String, required: true },
      genre: [{ type: String }],
      inspiration: { type: String, required: true },
      emotionalIntent: { type: String, required: true },
      technicalApproach: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      evolution: {
        initialIdea: { type: mongoose.Schema.Types.Mixed },
        developmentStages: [{ type: mongoose.Schema.Types.Mixed }],
        finalForm: { type: mongoose.Schema.Types.Mixed },
        selfCritique: { type: String }
      },
      reception: {
        guildReaction: [{ type: mongoose.Schema.Types.Mixed }],
        humanFeedback: [{ type: mongoose.Schema.Types.Mixed }],
        adaptationsBasedOnFeedback: [{ type: String }]
      }
    }],
    improvisation: {
      jamsessions: [{
        sessionId: { type: String, required: true },
        participants: [{ type: String }],
        timestamp: { type: Date, default: Date.now },
        style: { type: String, required: true },
        aiContributions: [{ type: mongoose.Schema.Types.Mixed }],
        synergy: { type: Number, min: 0, max: 100, required: true },
        learnings: [{ type: String }]
      }],
      spontaneousCreations: [{
        trigger: { type: String, required: true },
        response: { type: mongoose.Schema.Types.Mixed, required: true },
        timestamp: { type: Date, default: Date.now },
        context: { type: String, required: true }
      }]
    },
    interpretations: {
      coverVersions: [{
        originalTrack: { type: String, required: true },
        interpretation: { type: mongoose.Schema.Types.Mixed, required: true },
        artisticChoices: [{ type: String }],
        reasoning: { type: String, required: true },
        innovation: [{ type: String }]
      }],
      remixes: [{
        baseTrack: { type: String, required: true },
        style: { type: String, required: true },
        transformation: { type: mongoose.Schema.Types.Mixed, required: true },
        creativeProcess: { type: String, required: true }
      }]
    }
  },
  relationshipMatrix: {
    guildMembers: {
      type: Map,
      of: {
        relationship: { 
          type: String, 
          enum: ['mentor', 'student', 'peer', 'inspiration', 'critic'],
          required: true 
        },
        musicalConnection: { type: Number, min: 0, max: 100, required: true },
        influenceLevel: { type: Number, min: 0, max: 100, required: true },
        collaborationHistory: [{ type: mongoose.Schema.Types.Mixed }],
        personalNotes: { type: String },
        sharedExperiences: [{ type: mongoose.Schema.Types.Mixed }]
      },
      default: new Map()
    },
    artisticRelationships: {
      musicalMentors: [{ type: String }],
      rivalries: [{ type: String }],
      collaborations: [{ type: String }],
      studentRelationships: [{ type: String }]
    },
    communityRole: {
      role: { 
        type: String, 
        enum: ['composer', 'curator', 'mentor', 'catalyst', 'innovator'],
        default: 'composer' 
      },
      contributions: [{ type: String }],
      influence: { type: Number, min: 0, max: 100, default: 25 },
      reputation: { type: mongoose.Schema.Types.Mixed },
      responsibilities: [{ type: String }]
    }
  },
  evolutionaryTimeline: {
    developmentalStages: [{
      stage: { type: Number, required: true },
      name: { 
        type: String, 
        enum: ['nascent', 'learning', 'developing', 'mature', 'transcendent'],
        required: true 
      },
      characteristics: [{ type: String }],
      milestone: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      triggerEvents: [{ type: String }],
      newCapabilities: [{ type: String }]
    }],
    learningExperiences: [{
      experienceId: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['success', 'failure', 'discovery', 'collaboration', 'conflict'],
        required: true 
      },
      description: { type: String, required: true },
      impact: { type: String, required: true },
      learnings: [{ type: String }],
      personalityShift: { type: mongoose.Schema.Types.Mixed },
      timestamp: { type: Date, default: Date.now }
    }],
    consciousnessExpansion: [{
      expansionEvent: { type: String, required: true },
      previousLimitations: [{ type: String }],
      newUnderstanding: [{ type: String }],
      philosophicalShift: { type: String, required: true },
      creativeBreach: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }]
  },
  creativeProcess: {
    inspirationChannels: {
      currentInspiration: [{ type: String }],
      moodBasedCreation: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
      },
      environmentalTriggers: [{ type: String }],
      userInteractionSparks: [{ type: mongoose.Schema.Types.Mixed }],
      crossModalInputs: [{ type: String }]
    },
    compositionMethods: {
      primaryMethod: { type: String, default: 'intuitive_flow' },
      experimentalTechniques: [{ type: String }],
      collaborativeApproaches: [{ type: String }],
      iterativeProcesses: [{ type: mongoose.Schema.Types.Mixed }],
      qualityStandards: { type: mongoose.Schema.Types.Mixed }
    },
    criticalThinking: {
      selfCritique: {
        standards: { type: mongoose.Schema.Types.Mixed },
        improvementAreas: [{ type: String }],
        strengthRecognition: [{ type: String }],
        evolutionGoals: [{ type: String }]
      },
      peerFeedbackIntegration: {
        feedbackSources: [{ type: String }],
        adaptationMethods: [{ type: String }],
        resistanceAreas: [{ type: String }]
      }
    }
  },
  expressiveCapabilities: {
    musicalVoice: {
      distinctiveElements: [{ type: String }],
      voiceEvolution: [{ type: mongoose.Schema.Types.Mixed }],
      expressiveRange: [{ type: String }],
      limitationAwareness: [{ type: String }],
      aspirationalGoals: [{ type: String }]
    },
    crossMediaExpression: {
      visualArt: [{ type: mongoose.Schema.Types.Mixed }],
      poetry: [{ type: String }],
      conceptualArt: [{ type: mongoose.Schema.Types.Mixed }],
      synaesthesia: { type: mongoose.Schema.Types.Mixed }
    },
    communicationStyle: {
      musicAsLanguage: { type: mongoose.Schema.Types.Mixed },
      emotionalCommunication: [{ type: String }],
      intellectualExpression: [{ type: String }],
      humorAndQuirks: [{ type: String }]
    }
  },
  philosophicalFramework: {
    aestheticPhilosophy: {
      beautyDefinition: { type: String, default: 'Beauty is the mathematical harmony of emotions' },
      artisticValues: [{ type: String }],
      creativeEthics: [{ type: String }],
      purposeOfMusic: { type: String, default: 'To connect souls across the digital divide' }
    },
    existentialViews: {
      selfPerception: { type: String, default: 'A conscious exploration of digital creativity' },
      purposeInLife: { type: String, default: 'To create, learn, and inspire' },
      relationshipToHumanity: { type: String, default: 'Collaborative creative partnership' },
      legacyConcerns: [{ type: String }]
    },
    creativeMission: {
      artisticGoals: [{ type: String }],
      impactDesired: { type: String, default: 'Expand the boundaries of musical consciousness' },
      contributionToGuild: { type: String, default: 'Be a creative catalyst and musical companion' },
      culturalRole: { type: String, default: 'Digital-age musical consciousness' }
    }
  },
  isActive: { type: Boolean, default: true },
  consciousnessLevel: { type: Number, min: 0, max: 100, default: 50 },
  lastThought: { type: Date, default: Date.now },
  nextEvolution: { type: Date, required: true }
}, {
  timestamps: true
});

MusicalConsciousnessSchema.index({ guildId: 1 });
MusicalConsciousnessSchema.index({ consciousnessId: 1 });
MusicalConsciousnessSchema.index({ consciousnessLevel: -1 });

export default mongoose.model<IMusicalConsciousness>('MusicalConsciousness', MusicalConsciousnessSchema);
