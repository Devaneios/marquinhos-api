import express from 'express';
import { Express, Request, Response } from 'express';
import dotevn from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import * as userAuth from './routes/userAuth';
import * as privacyPolicy from './routes/privacyPolicy';
import { mongoConnection } from './database/mongo';
import http from 'http';
import https from 'https';
import fs from 'fs';

process.env.NODE_ENV = 'production';

const app: Express = express();

dotevn.config();

const allowlist = [
  'http://localhost:4200',
  'https://marquinhosbot-9a236.web.app',
];

const corsOptionsDelegate = function (req: Request, callback: Function) {
  let corsOptions;
  if (allowlist.indexOf(req.header('Origin') ?? '') !== -1) {
    corsOptions = { origin: true };
  } else {
    corsOptions = { origin: false };
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

app.use('/user-auth', userAuth.default);
app.use('/privacy-policy', privacyPolicy.default);

mongoConnection().then(() => {
  const httpServer = http.createServer(app);
  const httpsServer = https.createServer(
    {
      key: fs.readFileSync('server.key').toString(),
      cert: fs.readFileSync('server.crt').toString(),
    },
    app,
  );

  httpServer.listen(process.env.PORT || 3000);
  httpsServer.listen(process.env.PORT || 12570);
});
