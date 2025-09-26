import mongoose from 'mongoose';
import { IUserStats } from '../types';

const UserStatsSchema = new mongoose.Schema<IUserStats>({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  totalCommands: { type: Number, default: 0 },
  totalVoiceTime: { type: Number, default: 0 }, // in seconds
  totalScrobbles: { type: Number, default: 0 },
  favoriteGenres: [{ type: String }],
  listeningPatterns: {
    type: Map,
    of: Number,
    default: new Map()
  },
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
});

UserStatsSchema.index({ userId: 1, guildId: 1 }, { unique: true });

export default mongoose.model<IUserStats>('UserStats', UserStatsSchema);
