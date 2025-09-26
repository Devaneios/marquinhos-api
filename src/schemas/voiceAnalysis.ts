import mongoose from 'mongoose';

export interface IVoiceAnalysis extends mongoose.Document {
  userId: string;
  sessionId: string;
  guildId: string;
  timestamp: Date;
  pitch: number;
  confidence: number;
  timing: number;
  volume: number;
  vibrato: number;
  breathControl: number;
  pitchAccuracy: number;
  timingAccuracy: number;
  expressiveness: number;
  totalScore: number;
  feedback: string[];
}

const VoiceAnalysisSchema = new mongoose.Schema<IVoiceAnalysis>({
  userId: { type: String, required: true },
  sessionId: { type: String, required: true },
  guildId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  pitch: { type: Number, required: true },
  confidence: { type: Number, required: true },
  timing: { type: Number, required: true },
  volume: { type: Number, required: true },
  vibrato: { type: Number, required: true },
  breathControl: { type: Number, required: true },
  pitchAccuracy: { type: Number, required: true },
  timingAccuracy: { type: Number, required: true },
  expressiveness: { type: Number, required: true },
  totalScore: { type: Number, required: true },
  feedback: [{ type: String }]
}, {
  timestamps: true
});

VoiceAnalysisSchema.index({ userId: 1, sessionId: 1 });
VoiceAnalysisSchema.index({ guildId: 1, timestamp: -1 });

export default mongoose.model<IVoiceAnalysis>('VoiceAnalysis', VoiceAnalysisSchema);
