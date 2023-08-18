import { Schema, model } from 'mongoose';
import { IUserAuth } from '../types';

const UserAuthSchema = new Schema<IUserAuth>({
  discordId: { required: true, type: String },
  lastfmToken: { required: true, type: String },
  scrobblesOn: { required: true, type: Boolean },
});

const UserAuthModel = model('users_auth', UserAuthSchema);

export default UserAuthModel;
