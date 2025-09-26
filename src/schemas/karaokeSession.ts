import mongoose from 'mongoose';
import { IKaraokeSession } from '../types';

const KaraokeTrackSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  lyrics: [{ type: String }],
  duration: { type: Number, required: true }
});

const KaraokeSessionSchema = new mongoose.Schema<IKaraokeSession>({
  id: { type: String, required: true, unique: true },
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  hostId: { type: String, required: true },
  currentTrack: KaraokeTrackSchema,
  participants: [{ type: String }],
  scores: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

KaraokeSessionSchema.index({ guildId: 1 });
KaraokeSessionSchema.index({ isActive: 1 });

export default mongoose.model<IKaraokeSession>('KaraokeSession', KaraokeSessionSchema);
