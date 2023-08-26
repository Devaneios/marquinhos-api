import { Schema, model } from 'mongoose';
import { IUser } from '../types';

const UserSchema = new Schema<IUser>({
  id: { required: true, type: String },
  lastfmSessionToken: { required: false, type: String },
  lastfmUsername: { required: false, type: String },
  scrobblesOn: { required: false, type: Boolean },
});

const User = model('users', UserSchema);

export default User;
