import mongoose from 'mongoose';
import { IPlaylist } from '../types';

const PlaylistTrackSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  url: { type: String, required: true },
  addedBy: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
  votes: { type: Number, default: 0 },
  voters: [{ type: String }]
});

const PlaylistSchema = new mongoose.Schema<IPlaylist>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  creatorId: { type: String, required: true },
  guildId: { type: String, required: true },
  isCollaborative: { type: Boolean, default: false },
  tracks: [PlaylistTrackSchema],
  followers: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

PlaylistSchema.index({ guildId: 1 });
PlaylistSchema.index({ creatorId: 1 });

export default mongoose.model<IPlaylist>('Playlist', PlaylistSchema);
