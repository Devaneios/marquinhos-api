import User from '../schemas/user';
import { IUser } from 'types';
import { DiscordService } from './discord';
import dotenv from 'dotenv';
import { LastfmService } from './lastfm';

dotenv.config();

export class UserService {
  userDB: typeof User;
  discordService: DiscordService;
  lastfmService: LastfmService;

  constructor() {
    this.userDB = User;
    this.discordService = new DiscordService();
    this.lastfmService = new LastfmService();
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
}
