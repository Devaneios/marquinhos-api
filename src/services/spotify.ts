import SpotifyWebApi from 'spotify-web-api-node';
import dotenv from 'dotenv';

dotenv.config();

export class SpotifyService {
  spotifyApi: SpotifyWebApi;

  constructor() {
    this.spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    });
  }

  async getTrack(trackId: string) {
    try {
      await this._getAccessToken();
      const track = await this.spotifyApi.getTrack(trackId);

      return {
        artist: track.body.artists[0].name,
        name: track.body.name,
        durationInMillis: track.body.duration_ms,
        album: track.body.album.name,
        coverArtUrl: track.body.album.images[0].url,
      };
    } catch (error) {
      console.log(error);

      throw new Error('SpotifyRequestUnknownError');
    }
  }

  async searchTracks(query: string) {
    try {
      await this._getAccessToken();
      const track = await this.spotifyApi.searchTracks(query);

      if (!track.body.tracks?.items.length) {
        throw new Error('SpotifyTrackNotFound');
      }

      return {
        artist: track.body.tracks.items[0].artists[0].name,
        name: track.body.tracks.items[0].name,
        durationInMillis: track.body.tracks.items[0].duration_ms,
        album: track.body.tracks.items[0].album.name,
        coverArtUrl: track.body.tracks.items[0].album.images[0].url,
      };
    } catch (error) {
      console.log(error);
      throw new Error('SpotifyRequestUnknownError');
    }
  }

  private async _getAccessToken() {
    const data = await this.spotifyApi.clientCredentialsGrant();
    this.spotifyApi.setAccessToken(data.body.access_token);
  }
}
