import User from '../schemas/user';
import { IUser, LastfmTopListenedPeriod } from 'types';
import { DiscordService } from './discord';
import dotenv from 'dotenv';
import { LastfmService } from './lastfm';
import { SpotifyService } from './spotify';

dotenv.config();

export class UserService {
  userDB: typeof User;
  discordService: DiscordService;
  lastfmService: LastfmService;
  spotifyService: SpotifyService;

  constructor() {
    this.userDB = User;
    this.discordService = new DiscordService();
    this.lastfmService = new LastfmService();
    this.spotifyService = new SpotifyService();
  }

  async create(id: string) {
    const user = await this.userDB.findOne({ id });

    if (user) {
      throw new Error('User already exists');
    }

    return await this.userDB.create({
      id,
    });
  }

  async enableLastfm(id: string, token: string) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    const sessionToken = await this.lastfmService.getSession(token);

    if (!sessionToken) {
      throw new Error('Invalid token');
    }

    user.lastfmSessionToken = sessionToken.sessionKey;
    user.lastfmUsername = sessionToken.userName;
    user.scrobblesOn = true;

    await user.save();

    return {
      id,
    };
  }

  async deleteLastfmData(id: string) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    user.lastfmSessionToken = undefined;
    user.lastfmUsername = undefined;
    user.scrobblesOn = undefined;

    await user.save();

    return {
      id,
    };
  }

  async deleteAllData(id: string) {
    return await this.userDB.deleteOne({ id });
  }

  async toggleScrobbles(id: string) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    user.scrobblesOn = !user.scrobblesOn;

    await user.save();

    return {
      id,
      scrobblesOn: user.scrobblesOn,
    };
  }

  async exists(id: string) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      return null;
    }

    return {
      id,
    };
  }

  async hasValidLastfmSessionToken(id: string) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.lastfmSessionToken) {
      return null;
    }

    const lastfmUser = await this.lastfmService.getUserInfo(
      user.lastfmSessionToken,
    );

    if (!lastfmUser) {
      return null;
    }

    return {
      id,
      scrobblesOn: user.scrobblesOn,
    };
  }

  async getLastfmUsername(id: string) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.lastfmUsername) {
      return null;
    }

    return user.lastfmUsername;
  }

  async getTopArtists(id: string, period: LastfmTopListenedPeriod) {
    const username = await this.getLastfmUsername(id);

    if (!username) {
      throw new Error('User not found');
    }

    const profileName = (await this.lastfmService.getUserInfo(username))
      .realname;

    const topArtists = await this.lastfmService.getTopArtists(username, period);

    const artists = [];

    for (const artist of topArtists) {
      if (artists.length >= 10) {
        break;
      }
      const spotifyArtist = await this.spotifyService.searchArtist(artist.name);

      if (!spotifyArtist) {
        continue;
      }

      if (!spotifyArtist.coverArtUrl) {
        continue;
      }

      artists.push({
        name: artist.name,
        coverArtUrl: spotifyArtist.coverArtUrl,
      });
    }

    return { artists, profileName };
  }

  async getTopAlbums(id: string, period: LastfmTopListenedPeriod) {
    const username = await this.getLastfmUsername(id);

    if (!username) {
      throw new Error('User not found');
    }

    const profileName = (await this.lastfmService.getUserInfo(username))
      .realname;

    const topAlbums = await this.lastfmService.getTopAlbums(username, period);

    const albums = [];

    for (const album of topAlbums) {
      if (albums.length >= 10) {
        break;
      }
      const spotifyAlbum = await this.spotifyService.searchAlbum(
        `${album.name} ${album.artist.name}`,
      );
      if (!spotifyAlbum) {
        continue;
      }

      if (!spotifyAlbum.coverArtUrl) {
        continue;
      }

      albums.push({
        name: album.name,
        coverArtUrl: spotifyAlbum.coverArtUrl,
      });
    }

    return { albums, profileName };
  }

  async getTopTracks(id: string, period: LastfmTopListenedPeriod) {
    const username = await this.getLastfmUsername(id);

    if (!username) {
      throw new Error('User not found');
    }

    const profileName = (await this.lastfmService.getUserInfo(username))
      .realname;

    const topTracks = await this.lastfmService.getTopTracks(username, period);

    const tracks = [];

    for (const track of topTracks) {
      if (tracks.length >= 10) {
        break;
      }
      const spotifyTrack = await this.spotifyService.searchTrack(
        `${track.name} ${track.artist.name}`,
      );
      if (!spotifyTrack) {
        continue;
      }

      if (!spotifyTrack.coverArtUrl) {
        continue;
      }

      tracks.push({
        name: track.name,
        coverArtUrl: spotifyTrack.coverArtUrl,
      });
    }

    return { tracks, profileName };
  }
}
