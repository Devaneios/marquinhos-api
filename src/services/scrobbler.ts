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

  async createScrobble(request: { playbackData: PlaybackData }) {
    const track = await this.parserService.parseTrack(request.playbackData);

    await this.lastfmService.addToScrobbleQueue(track, request.playbackData);
  }
}
