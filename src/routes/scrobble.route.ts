import { checkToken } from '../middlewares/botAuth';
import ScrobbleController from '../controllers/scroblle.controller';
import { Request, Response } from 'express';

const express = require('express');
const router = express.Router();
const scrobbleController = new ScrobbleController();

router.post(
  '/queue',
  checkToken,
  scrobbleController.addScrobbleToQueue.bind(scrobbleController),
);

router.post(
  '/:id',
  checkToken,
  scrobbleController.dispatchScrobble.bind(scrobbleController),
);

router.delete(
  '/:scrobbleId/:userId',
  checkToken,
  scrobbleController.removeUserFromScrobble.bind(scrobbleController),
);

router.post(
  '/:scrobbleId/:userId',
  checkToken,
  scrobbleController.addUserToScrobble.bind(scrobbleController),
);

export default router;
