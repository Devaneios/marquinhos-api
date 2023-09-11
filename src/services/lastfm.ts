/**
MIT License

Copyright (c) 2020 Erick Almeida (https://github.com/Erick2280)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

import axios from 'axios';
import md5 from 'crypto-js/md5';
import { getUnixTime, parseISO } from 'date-fns';
import User from '../schemas/user';
import {
  LastfmSessionResponse,
  LastfmTopListenedPeriod,
  PlaybackData,
  Track,
} from 'types';
import Scrobble from '../schemas/scrobble';

export class LastfmService {
  readonly apiRootUrl = 'https://ws.audioscrobbler.com/2.0';
  readonly userAgent = 'cordscrobbler/1.0.0';
  private scrobblesDB: typeof Scrobble;

  constructor() {
    this.scrobblesDB = Scrobble;
  }

  async getSession(token: string | undefined): Promise<LastfmSessionResponse> {
    if (!token) {
      throw new Error('LastfmTokenNotProvided');
    }

    const params = new URLSearchParams();
    params.set('method', 'auth.getsession');
    params.set('token', token);
    let request;
    try {
      request = await this._performRequest(params, 'get', true);
    } catch (error: any) {
      if (error?.response?.data?.error === 14) {
        throw new Error('LastfmTokenNotAuthorized');
      }
      if (
        error?.response?.data?.error === 11 &&
        error?.response?.data?.error === 16
      ) {
        throw new Error('LastfmServiceUnavailable');
      } else {
        console.error(error);
        throw new Error('LastfmRequestUnknownError');
      }
    }

    const userName = request?.data.session.name;
    const sessionKey = request?.data.session.key;

    return {
      sessionKey,
      userName,
    };
  }

  async scrobble(
    tracks: Track[],
    playbacksData: PlaybackData[],
    sessionKey: string | undefined,
  ) {
    const params = new URLSearchParams();

    params.set('method', 'track.scrobble');
    params.set('sk', sessionKey || '');

    for (const [i, track] of tracks.entries()) {
      params.set(`artist[${i}]`, track.artist);
      params.set(`track[${i}]`, track.name);
      params.set(
        `timestamp[${i}]`,
        getUnixTime(parseISO(playbacksData[i].timestamp.toString())).toString(),
      );
      if (track.album) {
        params.set(`album[${i}]`, track.album);
      }
    }

    try {
      await this._performRequest(params, 'post', true);
    } catch (error: any) {
      if (error?.response?.data?.error === 9) {
        throw new Error('LastfmInvalidSessionKey');
      } else {
        console.error(error);
        throw new Error('LastfmRequestUnknownError');
      }
    }
    // TODO: Check scrobble history/queue on fail
  }

  async getUserInfo(sessionKey: string | undefined) {
    const params = new URLSearchParams();

    params.set('method', 'user.getinfo');
    params.set('sk', sessionKey || '');

    try {
      const response = await this._performRequest(params, 'get', true);

      return response?.data.user;
    } catch (error: any) {
      if (error?.response?.data?.error === 9) {
        throw new Error('LastfmInvalidSessionKey');
      } else {
        console.error(error);
        throw new Error('LastfmRequestUnknownError');
      }
    }
  }

  async dispatchScrobbleFromQueue(scrobbleId: string) {
    const scrobble = await this.scrobblesDB.findById(scrobbleId);

    if (!scrobble) {
      throw new Error('ScrobbleNotFound');
    }

    await this.dispatchScrobble(scrobble.track, scrobble.playbackData);

    const deleted = await this.scrobblesDB.findByIdAndDelete(scrobbleId);

    return deleted?._id;
  }

  async addToScrobbleQueue(track: Track | null, playbackData: PlaybackData) {
    const thirtySecondsInMillis = 30000;
    const fourMinutesInMillis = 240000;
    const scrobblesOnUsers = [];

    if (!track || track.durationInMillis < thirtySecondsInMillis) {
      return;
    }

    const createdDocument = await this.scrobblesDB.create({
      track,
      playbackData,
    });

    for (const userId of playbackData.listeningUsersId) {
      const registeredUser = await User.findOne({
        id: userId,
      });

      if (registeredUser?.scrobblesOn) {
        this.updateNowPlaying(
          track,
          registeredUser.lastfmSessionToken,
          track.durationInMillis / 1000,
        );
        scrobblesOnUsers.push(userId);
      }
    }

    return {
      id: createdDocument._id,
      scrobblesOnUsers,
      track,
    };
  }

  async dispatchScrobble(track: Track, playbackData: PlaybackData) {
    const scrobblingRequestPromises: Promise<void>[] = [];

    for (const userId of playbackData.listeningUsersId) {
      const registeredUser = await User.findOne({
        id: userId,
      });

      if (registeredUser?.scrobblesOn) {
        const scrobblingRequestPromise = this.scrobble(
          [track],
          [playbackData],
          registeredUser.lastfmSessionToken,
        );
        scrobblingRequestPromises.push(scrobblingRequestPromise);
      }
    }

    await Promise.all(scrobblingRequestPromises);
  }

  async updateNowPlaying(
    track: Track,
    sessionKey: string | undefined,
    durationInSeconds?: number,
  ) {
    const params = new URLSearchParams();

    params.set('method', 'track.updatenowplaying');
    params.set('sk', sessionKey || '');

    params.set(`artist`, track.artist);
    params.set(`track`, track.name);
    if (track.album) {
      params.set(`album`, track.album);
    }
    if (durationInSeconds) {
      params.set(`duration`, durationInSeconds.toString());
    }

    try {
      await this._performRequest(params, 'post', true);
    } catch (error: any) {
      if (error?.response?.data?.error !== 9) {
        console.error(error);
      }
    }
  }

  async getTopArtists(
    userName: string | null,
    period: LastfmTopListenedPeriod,
  ) {
    const params = new URLSearchParams();

    params.set('method', 'user.gettopartists');
    params.set('user', userName || '');
    params.set('period', period);
    params.set('limit', '20');

    try {
      const response = await this._performRequest(params, 'get', false);

      const topArtists = response?.data.topartists;

      return topArtists.artist.map((artist: any) => {
        return {
          name: artist.name,
        };
      });
    } catch (error: any) {
      console.error(error);
      throw new Error('LastfmRequestUnknownError');
    }
  }

  async getTopAlbums(userName: string | null, period: LastfmTopListenedPeriod) {
    const params = new URLSearchParams();

    params.set('method', 'user.gettopalbums');
    params.set('user', userName || '');
    params.set('period', period);
    params.set('limit', '20');

    try {
      const response = await this._performRequest(params, 'get', false);

      const topAlbums = response?.data.topalbums;

      return topAlbums.album.map((album: any) => {
        return {
          name: album.name,
          artist: album.artist.name,
        };
      });
    } catch (error: any) {
      console.error(error);
      throw new Error('LastfmRequestUnknownError');
    }
  }

  async getTopTracks(userName: string | null, period: LastfmTopListenedPeriod) {
    const params = new URLSearchParams();

    params.set('method', 'user.gettoptracks');
    params.set('user', userName || '');
    params.set('period', period);
    params.set('limit', '20');

    try {
      const response = await this._performRequest(params, 'get', false);

      const topTracks = response?.data.toptracks;

      return topTracks.track.map((track: any) => {
        return {
          name: track.name,
          artist: track.artist.name,
        };
      });
    } catch (error: any) {
      console.error(error);
      throw new Error('LastfmRequestUnknownError');
    }
  }

  private _performRequest(
    params: URLSearchParams,
    type: 'get' | 'post',
    signed: boolean,
  ) {
    params.set('api_key', process.env.LASTFM_API_KEY || '');
    params.set('format', 'json');

    if (signed) {
      if (type === 'post' && !params.has('sk')) {
        throw new Error('SessionKeyNotProvidedOnRequest');
      }
      params.set('api_sig', this._getCallSignature(params));
    }
    const url = `${this.apiRootUrl}/?${params.toString()}`;

    if (type === 'get') {
      return axios.get(url, { headers: { 'User-Agent': this.userAgent } });
    }

    if (type === 'post') {
      return axios.post(url, null, {
        headers: { 'User-Agent': this.userAgent },
      });
    }
  }

  private _getCallSignature(params: URLSearchParams) {
    // Based on the implementation of https://github.com/jammus/lastfm-node/blob/master/lib/lastfm/lastfm-request.js
    let signatureString = '';

    params.sort();

    for (const [key, value] of params) {
      if (key !== 'format') {
        const copiedValue =
          typeof value !== 'undefined' && value !== null ? value : '';
        signatureString += key + copiedValue;
      }
    }

    signatureString += process.env.LASTFM_SHARED_SECRET;
    return md5(signatureString).toString();
  }

  getAuthorizationUrl = () => {
    return `https://www.last.fm/api/auth/?api_key=${process.env.LASTFM_API_KEY}&cb=${process.env.LASTFM_REDIRECT_URI}`;
  };
}
