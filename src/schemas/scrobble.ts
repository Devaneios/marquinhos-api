import { Schema, model } from 'mongoose';
import { IScrobble, IUser } from '../types';

const ScrobbleSchema = new Schema<IScrobble>({
  track: {
    type: Object,
    required: true,
  },
  playbackData: {
    type: Object,
    required: true,
  },
});

const Scrobble = model('scrobbles-queue', ScrobbleSchema);

export default Scrobble;
