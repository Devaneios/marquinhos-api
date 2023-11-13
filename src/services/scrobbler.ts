import { PlaybackData } from 'types';
import { DiscordService } from './discord';
import { LastfmService } from './lastfm';
import { ParserService } from './parser';

export class ScrobblerService {
  discordService: DiscordService;
  lastfmService: LastfmService;
  parserService: ParserService;

  constructor() {
    this.discordService = new DiscordService();
    this.lastfmService = new LastfmService();
    this.parserService = new ParserService();
  }

  async addScrobbleToQueue(playbackData: PlaybackData) {
    const track = await this.parserService.parseTrack(playbackData);

    return await this.lastfmService.addToScrobbleQueue(track, playbackData);
  }

  async dispatchScrobble(id: string) {
    return await this.lastfmService.dispatchScrobbleFromQueue(id);
  }

  async removeUserFromScrobble(scrobbleId: string, userId: string) {
    return await this.lastfmService.removeUserFromScrobble(scrobbleId, userId);
  }

  async addUserToScrobble(scrobbleId: string, userId: string) {
    return await this.lastfmService.addUserToScrobble(scrobbleId, userId);
  }
}
