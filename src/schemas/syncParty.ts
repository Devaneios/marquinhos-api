import mongoose from 'mongoose';

export interface ISyncParty extends mongoose.Document {
  id: string;
  hostId: string;
  guildId: string;
  channelId: string;
  name: string;
  description?: string;
  participants: {
    userId: string;
    platform: string; // spotify, youtube, apple, etc
    joinedAt: Date;
    latency: number;
  }[];
  currentTrack?: {
    title: string;
    artist: string;
    url: string;
    duration: number;
    startTime: Date;
    platformUrls: Map<string, string>; // platform -> url
  };
  playlist: {
    title: string;
    artist: string;
    url: string;
    platformUrls: Map<string, string>;
    votes: {
      userId: string;
      vote: 'up' | 'down' | 'next';
    }[];
  }[];
  isActive: boolean;
  syncSettings: {
    allowVoting: boolean;
    democraticControl: boolean;
    crossPlatformSync: boolean;
    latencyCompensation: boolean;
  };
  chatMessages: {
    userId: string;
    message: string;
    timestamp: Date;
    reactions: string[];
  }[];
  createdAt: Date;
}

const SyncPartySchema = new mongoose.Schema<ISyncParty>({
  id: { type: String, required: true, unique: true },
  hostId: { type: String, required: true },
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  participants: [{
    userId: { type: String, required: true },
    platform: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    latency: { type: Number, default: 0 }
  }],
  currentTrack: {
    title: { type: String },
    artist: { type: String },
    url: { type: String },
    duration: { type: Number },
    startTime: { type: Date },
    platformUrls: {
      type: Map,
      of: String,
      default: new Map()
    }
  },
  playlist: [{
    title: { type: String, required: true },
    artist: { type: String, required: true },
    url: { type: String, required: true },
    platformUrls: {
      type: Map,
      of: String,
      default: new Map()
    },
    votes: [{
      userId: { type: String, required: true },
      vote: { type: String, enum: ['up', 'down', 'next'], required: true }
    }]
  }],
  isActive: { type: Boolean, default: true },
  syncSettings: {
    allowVoting: { type: Boolean, default: true },
    democraticControl: { type: Boolean, default: false },
    crossPlatformSync: { type: Boolean, default: true },
    latencyCompensation: { type: Boolean, default: true }
  },
  chatMessages: [{
    userId: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    reactions: [{ type: String }]
  }],
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

SyncPartySchema.index({ guildId: 1, isActive: 1 });
SyncPartySchema.index({ hostId: 1 });

export default mongoose.model<ISyncParty>('SyncParty', SyncPartySchema);
