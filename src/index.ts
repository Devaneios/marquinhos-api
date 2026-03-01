import cors from 'cors';
import dotevn from 'dotenv';
import express, { Express, Request } from 'express';
import http from 'http';
import morgan from 'morgan';
import './database/sqlite';
import * as auth from './routes/auth.route';
import evolutiveAchievementsRouter from './routes/evolutiveAchievements.route';
import gamificationRouter from './routes/gamification.route';
import * as privacyPolicy from './routes/privacyPolicy.route';
import * as scrobble from './routes/scrobble.route';
import * as user from './routes/user.route';
import { GamificationService } from './services/gamification';

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

new GamificationService().initializeDefaults();

app.use('/api/auth', auth.default);
app.use('/api/user', user.default);
app.use('/api/scrobble', scrobble.default);
app.use('/api/privacy-policy', privacyPolicy.default);
app.use('/api/gamification', gamificationRouter);
app.use('/api/evolutive-achievements', evolutiveAchievementsRouter);

const httpServer = http.createServer(app);
httpServer.listen(process.env.HTTP_PORT || 3000);
