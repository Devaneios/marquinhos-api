import cors from 'cors';
import dotevn from 'dotenv';
import express, { Express, Request } from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import morgan from 'morgan';
import { mongoConnection } from './database/mongo';
import * as auth from './routes/auth.route';
import * as empathySystem from './routes/empathySystem.route';
import * as evolutiveAchievements from './routes/evolutiveAchievements.route';
import * as gamification from './routes/gamification.route';
import * as karaoke from './routes/karaoke.route';
import * as musicalDNA from './routes/musicalDNA.route';
import * as musicTherapist from './routes/musicTherapist.route';
import * as playlist from './routes/playlist.route';
import * as privacyPolicy from './routes/privacyPolicy.route';
import * as recommendations from './routes/recommendations.route';
import * as scrobble from './routes/scrobble.route';
import * as syncParty from './routes/syncParty.route';
import * as user from './routes/user.route';
import * as voiceAI from './routes/voiceAI.route';

const app: Express = express();

dotevn.config();

const allowlist = ['http://localhost:4200', 'https://marquinhos-74154.web.app'];

const corsOptionsDelegate = function (req: Request, callback: Function) {
  let corsOptions;
  if (allowlist.indexOf(req.header('Origin') ?? '') !== -1) {
    corsOptions = {
      origin: true,
      credentials: true,
    };
  } else {
    corsOptions = {
      origin: false,
      credentials: true,
    };
  }
  callback(null, corsOptions);
};

app.use(
  morgan(
    ':remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms',
  ),
);

app.use(express.json());
app.use(cors(corsOptionsDelegate));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', auth.default);
app.use('/api/user', user.default);
app.use('/api/scrobble', scrobble.default);
app.use('/api/privacy-policy', privacyPolicy.default);
app.use('/api/gamification', gamification.default);
app.use('/api/playlist', playlist.default);
app.use('/api/recommendations', recommendations.default);
app.use('/api/karaoke', karaoke.default);
app.use('/api/voice-ai', voiceAI.default);
app.use('/api/musical-dna', musicalDNA.default);
app.use('/api/sync-party', syncParty.default);
app.use('/api/music-therapist', musicTherapist.default);
app.use('/api/evolutive-achievements', evolutiveAchievements.default);
app.use('/api/empathy-system', empathySystem.default);

mongoConnection().then(() => {
  if (process.env.NODE_ENV === 'production') {
    const httpsServer = https.createServer(
      {
        key: fs.readFileSync('dvns-private.key').toString(),
        cert: fs.readFileSync('dvns-certificate.crt').toString(),
      },
      app,
    );

    httpsServer.listen(process.env.HTTPS_PORT || 3106);
  } else {
    const httpServer = http.createServer(app);
    httpServer.listen(process.env.HTTP_PORT || 3000);
  }
});
