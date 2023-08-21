import UserAuthModel from '../schemas/userAuth';
import { IUserAuth } from 'types';
import { DiscordService } from './discord';

export class UserAuthService {
  userAuthModel: typeof UserAuthModel;
  discordService: DiscordService;

  constructor() {
    this.userAuthModel = UserAuthModel;
    this.discordService = new DiscordService();
  }

  async create(userAuth: { discordToken: string } & IUserAuth) {
    if (!this.containsOnlyAllowedKeys(userAuth)) {
      throw new Error('Missing keys');
    }

    if (this.containsNonEmptyValues(userAuth)) {
      throw new Error('Missing values');
    }

    if (await this.userAlreadyExists(userAuth.discordId)) {
      throw new Error('User already exists');
    }

    if (
      !(await this.idAndTokenMatch(userAuth.discordId, userAuth.discordToken))
    ) {
      throw new Error('Wrong credentials');
    }

    return await this.userAuthModel.create({
      discordId: userAuth.discordId,
      lastfmToken: userAuth.lastfmToken,
      scrobblesOn: userAuth.scrobblesOn,
    });
  }

  async deleteLastfmData(discordId: string, discordToken: string) {
    if (!discordId || !discordToken) {
      throw new Error('Missing data');
    }

    if (!(await this.userAlreadyExists(discordId))) {
      throw new Error('User not found');
    }

    if (!(await this.idAndTokenMatch(discordId, discordToken))) {
      throw new Error('Wrong credentials');
    }

    const userAuth = await this.userAuthModel.findOne({ discordId });

    userAuth?.set({
      lastfmToken: undefined,
    });

    await userAuth?.save();

    return {
      discordId: userAuth?.discordId,
    };
  }

  async deleteAllData(discordId: string, discordToken: string) {
    if (!discordId || !discordToken) {
      throw new Error('Missing data');
    }

    if (!(await this.userAlreadyExists(discordId))) {
      throw new Error('User not found');
    }

    if (!(await this.idAndTokenMatch(discordId, discordToken))) {
      throw new Error('Wrong credentials');
    }

    return await this.userAuthModel.deleteOne({ discordId });
  }

  async toggleScrobbles(discordId: string, discordToken: string) {
    if (!discordId || !discordToken) {
      throw new Error('Missing data');
    }

    if (!(await this.idAndTokenMatch(discordId, discordToken))) {
      throw new Error('Wrong credentials');
    }

    const userAuth = await this.userAuthModel.findOne({ discordId });

    if (!userAuth) {
      throw new Error('User not found');
    }

    userAuth.scrobblesOn = !userAuth.scrobblesOn;

    await userAuth.save();

    return {
      scrobblesOn: userAuth.scrobblesOn,
    };
  }

  async exists(discordId: string, discordToken: string) {
    if (!discordId || !discordToken) {
      throw new Error('Missing data');
    }

    if (!(await this.idAndTokenMatch(discordId, discordToken))) {
      throw new Error('Wrong credentials');
    }

    const userAuth = await this.userAuthModel.findOne({ discordId });

    if (!userAuth) {
      throw new Error('User not found');
    }

    return {
      discordId: userAuth.discordId,
      scrobblesOn: userAuth.scrobblesOn,
    };
  }

  async hasLastfmToken(discordId: string, discordToken: string) {
    if (!discordId || !discordToken) {
      throw new Error('Missing data');
    }

    if (!(await this.idAndTokenMatch(discordId, discordToken))) {
      throw new Error('Wrong credentials');
    }

    const userAuth = await this.userAuthModel.findOne({ discordId });

    if (!userAuth) {
      throw new Error('User not found');
    }

    return {
      discordId: userAuth.discordId,
      scrobblesOn: userAuth.scrobblesOn,
    };
  }

  private containsOnlyAllowedKeys(userAuth: IUserAuth) {
    const allowedKeys = [
      'discordId',
      'discordToken',
      'lastfmToken',
      'scrobblesOn',
    ];

    const keys = Object.keys(userAuth);

    const hasAllKeys = keys.every((item) => allowedKeys.includes(item));

    return hasAllKeys;
  }

  private containsNonEmptyValues(userAuth: IUserAuth) {
    const values = Object.values(userAuth);

    return values.some((item) => [null, undefined, ''].includes(item));
  }

  private async userAlreadyExists(discordId: string) {
    const user = await this.userAuthModel.findOne({
      discordId,
    });

    return !!user;
  }

  private async idAndTokenMatch(discordId: string, discordToken: string) {
    const discordUser = await this.discordService.getDiscordUser(discordToken);

    return discordUser.id === discordId;
  }
}
