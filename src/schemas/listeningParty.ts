import mongoose from 'mongoose';
import { IListeningParty } from '../types';

const ListeningPartySchema = new mongoose.Schema<IListeningParty>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  hostId: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  duration: { type: Number, required: true }, // in minutes
  playlist: { type: String }, // playlist ID
  participants: [{ type: String }],
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

ListeningPartySchema.index({ guildId: 1 });
ListeningPartySchema.index({ scheduledAt: 1 });

export default mongoose.model<IListeningParty>('ListeningParty', ListeningPartySchema);
