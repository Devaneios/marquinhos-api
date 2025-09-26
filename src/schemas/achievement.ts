import mongoose from 'mongoose';
import { IAchievement } from '../types';

const AchievementSchema = new mongoose.Schema<IAchievement>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  rarity: { 
    type: String, 
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  icon: { type: String, required: true },
  condition: { type: mongoose.Schema.Types.Mixed, required: true },
  reward: {
    xp: { type: Number },
    role: { type: String },
    badge: { type: String }
  }
}, {
  timestamps: true
});

export default mongoose.model<IAchievement>('Achievement', AchievementSchema);
