import cors from 'cors';
import dotenv from 'dotenv';
import express, { Express, Request } from 'express';
import rateLimit from 'express-rate-limit';
import http from 'http';
import morgan from 'morgan';
import './database/sqlite';
import * as auth from './routes/auth.route';
import evolutiveAchievementsRouter from './routes/evolutiveAchievements.route';
import mazeRouter from './routes/maze.route';
import gamificationRouter from './routes/gamification.route';
import wordleRouter from './routes/wordle.route';
import * as privacyPolicy from './routes/privacyPolicy.route';
import * as scrobble from './routes/scrobble.route';
import * as user from './routes/user.route';
import { GamificationService } from './services/gamification';
import { getValidationSet } from './services/wordle';

dotenv.config();

const app: Express = express();

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

// Rate limiting — global 100 req/15min, tighter limits on sensitive endpoints
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again later.' },
});

const wordleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many guesses, slow down.' },
});

app.use(globalLimiter);
// Specific limiters registered before the catch-all route mounts
app.use('/api/auth/login', authLimiter);
app.use('/api/wordle/guess', wordleLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', auth.default);
app.use('/api/user', user.default);
app.use('/api/scrobble', scrobble.default);
app.use('/api/privacy-policy', privacyPolicy.default);
app.use('/api/gamification', gamificationRouter);
app.use('/api/evolutive-achievements', evolutiveAchievementsRouter);
app.use('/api/games/maze', mazeRouter);
app.use('/api/wordle', wordleRouter);

// Startup initialisation — failures crash the process instead of silently
// serving with empty XP config or missing wordle word list.
try {
  new GamificationService().initializeDefaults();
} catch (err) {
  console.error('Fatal: gamification initialization failed', err);
  process.exit(1);
}

try {
  // Pre-warm the validation word set to avoid latency on first guess
  getValidationSet();
} catch (err) {
  console.error('Fatal: wordle validation set failed to load', err);
  process.exit(1);
}

const httpServer = http.createServer(app);
httpServer.listen(process.env.HTTP_PORT || 3000);
