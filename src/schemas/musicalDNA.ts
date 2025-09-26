import mongoose from 'mongoose';

export interface IMusicalDNA extends mongoose.Document {
  userId: string;
  guildId: string;
  dnaSignature: string;
  preferredBPM: {
    min: number;
    max: number;
    peak: number;
  };
  instrumentPreferences: Map<string, number>;
  harmonicPreferences: {
    majorKeys: number;
    minorKeys: number;
    modalKeys: number;
    dissonance: number;
  };
  rhythmicPatterns: Map<string, number>;
  emotionalMapping: Map<string, number>;
  temporalEvolution: {
    timestamp: Date;
    snapshot: any;
  }[];
  microPreferences: {
    timbres: string[];
    progressions: string[];
    structures: string[];
  };
  compatibilityScore: Map<string, number>; // userId -> compatibility%
  lastAnalysis: Date;
}

const MusicalDNASchema = new mongoose.Schema<IMusicalDNA>({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  dnaSignature: { type: String, required: true, unique: true },
  preferredBPM: {
    min: { type: Number, default: 60 },
    max: { type: Number, default: 180 },
    peak: { type: Number, default: 120 }
  },
  instrumentPreferences: {
    type: Map,
    of: Number,
    default: new Map()
  },
  harmonicPreferences: {
    majorKeys: { type: Number, default: 0.5 },
    minorKeys: { type: Number, default: 0.3 },
    modalKeys: { type: Number, default: 0.2 },
    dissonance: { type: Number, default: 0.1 }
  },
  rhythmicPatterns: {
    type: Map,
    of: Number,
    default: new Map()
  },
  emotionalMapping: {
    type: Map,
    of: Number,
    default: new Map()
  },
  temporalEvolution: [{
    timestamp: { type: Date, default: Date.now },
    snapshot: { type: mongoose.Schema.Types.Mixed }
  }],
  microPreferences: {
    timbres: [{ type: String }],
    progressions: [{ type: String }],
    structures: [{ type: String }]
  },
  compatibilityScore: {
    type: Map,
    of: Number,
    default: new Map()
  },
  lastAnalysis: { type: Date, default: Date.now }
}, {
  timestamps: true
});

MusicalDNASchema.index({ userId: 1, guildId: 1 }, { unique: true });
MusicalDNASchema.index({ dnaSignature: 1 });

export default mongoose.model<IMusicalDNA>('MusicalDNA', MusicalDNASchema);
