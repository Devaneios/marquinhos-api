import mongoose from 'mongoose';
import { IUserLevel } from '../types';

const UserLevelSchema = new mongoose.Schema<IUserLevel>({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  totalXp: { type: Number, default: 0 },
  lastXpGain: { type: Date, default: Date.now }
}, {
  timestamps: true
});

UserLevelSchema.index({ userId: 1, guildId: 1 }, { unique: true });
UserLevelSchema.index({ guildId: 1, level: -1, xp: -1 });

export default mongoose.model<IUserLevel>('UserLevel', UserLevelSchema);
