import { Schema, model } from 'mongoose';
import { IUserAuth } from '../types';

const UserAuthSchema = new Schema<IUserAuth>({
  discordId: { required: true, type: String },
  discordToken: { required: true, type: String },
  discordTokenExpiresAt: { required: true, type: Date },
  lastfmToken: { required: true, type: String },
});

const UserAuthModel = model('users_auth', UserAuthSchema);

export default UserAuthModel;
