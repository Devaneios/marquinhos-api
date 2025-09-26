export interface IUser extends mongoose.Document {
  id: string;
  lastfmSessionToken?: string;
  lastfmUsername?: string;
  scrobblesOn?: boolean;
  premium?: {
    plan: 'basic' | 'premium' | 'lifetime';
    startDate: Date;
    endDate?: Date;
    isActive: boolean;
  };
  preferences?: {
    notifications: boolean;
    autoRecommendations: boolean;
    publicStats: boolean;
  };
}

export interface IScrobble extends mongoose.Document {
  track: Track;
  playbackData: PlaybackData;
}

export type LastfmSessionResponse = {
  sessionKey: string;
  userName: string;
};

export type PlaybackData = {
  title: string;
  url?: string;
  listeningUsersId: string[];
  timestamp: Date;
  guildId: string;
  channelId: string;
  providerName: string;
};

export type Track = {
  artist: string;
  name: string;
  durationInMillis: number;
  album?: string;
  coverArtUrl?: string;
};

export interface ApiResponse<T> {
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export type LastfmTopListenedPeriod =
  | '7day'
  | '1month'
  | '3month'
  | '6month'
  | '12month'
  | 'overall';

// Extended interfaces for new features
export interface IUserLevel extends mongoose.Document {
  userId: string;
  guildId: string;
  level: number;
  xp: number;
  totalXp: number;
  lastXpGain: Date;
}

export interface IAchievement extends mongoose.Document {
  id: string;
  name: string;
  description: string;
  category: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: string;
  condition: any;
  reward?: any;
}

export interface IUserAchievement extends mongoose.Document {
  userId: string;
  achievementId: string;
  unlockedAt: Date;
  guildId: string;
}

export interface IPlaylist extends mongoose.Document {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  guildId: string;
  isCollaborative: boolean;
  tracks: any[];
  followers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IMusicGroup extends mongoose.Document {
  id: string;
  name: string;
  description: string;
  guildId: string;
  creatorId: string;
  members: string[];
  genre?: string;
  isPrivate: boolean;
  createdAt: Date;
}

export interface IListeningParty extends mongoose.Document {
  id: string;
  name: string;
  description: string;
  guildId: string;
  channelId: string;
  hostId: string;
  scheduledAt: Date;
  duration: number;
  playlist?: string;
  participants: string[];
  isActive: boolean;
  createdAt: Date;
}

export interface IUserStats extends mongoose.Document {
  userId: string;
  guildId: string;
  totalCommands: number;
  totalVoiceTime: number;
  totalScrobbles: number;
  favoriteGenres: string[];
  listeningPatterns: Record<string, number>;
  lastUpdated: Date;
}

export interface IKaraokeSession extends mongoose.Document {
  id: string;
  guildId: string;
  channelId: string;
  hostId: string;
  currentTrack?: any;
  participants: string[];
  scores: Record<string, number>;
  isActive: boolean;
  createdAt: Date;
}

declare module 'express' {
  export interface Request {
    user?: IUser;
  }
}
