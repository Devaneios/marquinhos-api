import mongoose from 'mongoose';

export interface IMusicTherapy extends mongoose.Document {
  userId: string;
  guildId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  initialState: {
    mood: string;
    energy: number; // 1-10
    stress: number; // 1-10
    focus: number; // 1-10
    context: string; // work, study, relax, exercise, etc
    description?: string;
  };
  finalState?: {
    mood: string;
    energy: number;
    stress: number;
    focus: number;
    satisfaction: number;
    notes?: string;
  };
  recommendations: {
    trackId: string;
    title: string;
    artist: string;
    therapeuticPurpose: string;
    scientificBasis: string;
    expectedEffect: string;
    actualFeedback?: string;
    effectiveness?: number; // 1-10
  }[];
  progressionPath: {
    timestamp: Date;
    currentMood: string;
    trackPlaying: string;
    biometricData?: {
      heartRate?: number;
      stressLevel?: number;
    };
  }[];
  therapyGoals: string[];
  adaptiveAdjustments: {
    timestamp: Date;
    reason: string;
    adjustment: string;
    newRecommendation?: string;
  }[];
  longTermProgress: {
    week: number;
    averageMoodImprovement: number;
    preferredTherapeuticGenres: string[];
    mostEffectiveTechniques: string[];
  }[];
}

const MusicTherapySchema = new mongoose.Schema<IMusicTherapy>({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  sessionId: { type: String, required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  initialState: {
    mood: { type: String, required: true },
    energy: { type: Number, min: 1, max: 10, required: true },
    stress: { type: Number, min: 1, max: 10, required: true },
    focus: { type: Number, min: 1, max: 10, required: true },
    context: { type: String, required: true },
    description: { type: String }
  },
  finalState: {
    mood: { type: String },
    energy: { type: Number, min: 1, max: 10 },
    stress: { type: Number, min: 1, max: 10 },
    focus: { type: Number, min: 1, max: 10 },
    satisfaction: { type: Number, min: 1, max: 10 },
    notes: { type: String }
  },
  recommendations: [{
    trackId: { type: String, required: true },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    therapeuticPurpose: { type: String, required: true },
    scientificBasis: { type: String, required: true },
    expectedEffect: { type: String, required: true },
    actualFeedback: { type: String },
    effectiveness: { type: Number, min: 1, max: 10 }
  }],
  progressionPath: [{
    timestamp: { type: Date, default: Date.now },
    currentMood: { type: String, required: true },
    trackPlaying: { type: String, required: true },
    biometricData: {
      heartRate: { type: Number },
      stressLevel: { type: Number }
    }
  }],
  therapyGoals: [{ type: String }],
  adaptiveAdjustments: [{
    timestamp: { type: Date, default: Date.now },
    reason: { type: String, required: true },
    adjustment: { type: String, required: true },
    newRecommendation: { type: String }
  }],
  longTermProgress: [{
    week: { type: Number, required: true },
    averageMoodImprovement: { type: Number, required: true },
    preferredTherapeuticGenres: [{ type: String }],
    mostEffectiveTechniques: [{ type: String }]
  }]
}, {
  timestamps: true
});

MusicTherapySchema.index({ userId: 1, guildId: 1 });
MusicTherapySchema.index({ sessionId: 1 });

export default mongoose.model<IMusicTherapy>('MusicTherapy', MusicTherapySchema);
