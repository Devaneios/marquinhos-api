import mongoose from 'mongoose';
import { IMusicGroup } from '../types';

const MusicGroupSchema = new mongoose.Schema<IMusicGroup>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  guildId: { type: String, required: true },
  creatorId: { type: String, required: true },
  members: [{ type: String }],
  genre: { type: String },
  isPrivate: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

MusicGroupSchema.index({ guildId: 1 });
MusicGroupSchema.index({ creatorId: 1 });

export default mongoose.model<IMusicGroup>('MusicGroup', MusicGroupSchema);
