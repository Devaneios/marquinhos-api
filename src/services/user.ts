import dotenv from 'dotenv';
import { LastfmTopListenedPeriod, Track } from 'types';
import User from '../schemas/user';
import { DiscordService } from './discord';
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
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    const username = user.lastfmUsername ?? '';
    const sessionKey = user.lastfmSessionToken;

    const profileName = (
      await this.lastfmService.getUserInfo(sessionKey)
    ).realname.split(' ')[0];
    const topArtists = await this.lastfmService.getTopArtists(username, period);
    const artistsPromises: Promise<{
      name: string;
      coverArtUrl?: string;
    } | null>[] = [];

    for (const artist of topArtists) {
      const spotifyArtist = this.spotifyService.searchArtist(artist.name);
      artistsPromises.push(spotifyArtist);
    }

    const spotifyArtsits = await Promise.all(artistsPromises);

    const artists = spotifyArtsits
      .map((artist) => {
        if (!artist) {
          return;
        }

        if (!artist.coverArtUrl) {
          return;
        }

        return {
          name: artist.name,
          coverArtUrl: artist.coverArtUrl,
        };
      })
      .filter(
        (artist): artist is { name: string; coverArtUrl: string } =>
          artist !== null && artist !== undefined,
      )
      .slice(0, 10);
    // TODO: Return not found artists
    return { artists, profileName };
  }

  async getTopAlbums(id: string, period: LastfmTopListenedPeriod) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    const username = user.lastfmUsername ?? '';
    const sessionKey = user.lastfmSessionToken;

    const profileName = (
      await this.lastfmService.getUserInfo(sessionKey)
    ).realname.split(' ')[0];

    const topAlbums = await this.lastfmService.getTopAlbums(username, period);

    const albumsPromises: Promise<{ name: string; coverArtUrl?: string }>[] =
      [];

    for (const album of topAlbums) {
      const spotifyAlbum = this.spotifyService.searchAlbum(album.name);
      albumsPromises.push(spotifyAlbum);
    }

    const spotifyAlbums = await Promise.all(albumsPromises);

    const albums = spotifyAlbums
      .map((album) => {
        if (!album) {
          return;
        }

        if (!album.coverArtUrl) {
          return;
        }

        return {
          name: album.name,
          coverArtUrl: album.coverArtUrl,
        };
      })
      .filter(
        (album): album is { name: string; coverArtUrl: string } =>
          album !== null && album !== undefined,
      )
      .slice(0, 10);
    // TODO: Return not found albums
    return { albums, profileName };
  }

  async getTopTracks(id: string, period: LastfmTopListenedPeriod) {
    const user = await this.userDB.findOne({ id });

    if (!user) {
      throw new Error('User not found');
    }

    const username = user.lastfmUsername ?? '';
    const sessionKey = user.lastfmSessionToken;

    const profileName = (
      await this.lastfmService.getUserInfo(sessionKey)
    ).realname.split(' ')[0];

    const topTracks = await this.lastfmService.getTopTracks(username, period);

    const tracksPromises: Promise<Pick<Track, 'name' | 'coverArtUrl'>>[] = [];

    for (const track of topTracks) {
      const spotifyTrack = this.spotifyService.searchTrack(
        `${track.name} ${track.artist}`,
        'minimal',
      );
      tracksPromises.push(spotifyTrack);
    }

    const spotifyTracks = await Promise.all(tracksPromises);

    const tracks = spotifyTracks
      .map((track) => {
        if (!track) {
          return;
        }

        if (!track.coverArtUrl) {
          return;
        }

        return {
          name: track.name,
          coverArtUrl: track.coverArtUrl,
        };
      })
      .filter(
        (track): track is { name: string; coverArtUrl: string } =>
          track !== null && track !== undefined,
      )
      .slice(0, 10);

    // TODO: Return not found tracks
    return { tracks, profileName };
  }
}
