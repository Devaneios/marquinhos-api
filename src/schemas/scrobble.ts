import { Schema, model } from 'mongoose';
import { IScrobble, IUser } from '../types';
import { PlaybackData, Track } from '../types';

const ScrobbleSchema = new Schema<IScrobble>(
  {
    track: {
      type: Object as unknown as Track,
    },
    playbackData: {
      type: Object as unknown as PlaybackData,
    },
  },
  {
    expireAfterSeconds: 600,
    collection: 'scrobbles-queue',
  },
);

const Scrobble = model('scrobbles-queue', ScrobbleSchema);

export default Scrobble;
