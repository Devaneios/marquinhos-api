import mongoose from 'mongoose';
import { IUserAchievement } from '../types';

const UserAchievementSchema = new mongoose.Schema<IUserAchievement>({
  userId: { type: String, required: true },
  achievementId: { type: String, required: true },
  unlockedAt: { type: Date, default: Date.now },
  guildId: { type: String, required: true }
}, {
  timestamps: true
});

UserAchievementSchema.index({ userId: 1, guildId: 1 });
UserAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export default mongoose.model<IUserAchievement>('UserAchievement', UserAchievementSchema);
