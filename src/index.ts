import express from 'express';
import { Express, Request, Response } from 'express';
import dotevn from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import * as auth from './routes/auth.route';
import * as user from './routes/user.route';
import * as scrobble from './routes/scrobble.route';
import * as privacyPolicy from './routes/privacyPolicy.route';
import { mongoConnection } from './database/mongo';
import http from 'http';
import https from 'https';
import fs from 'fs';

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
