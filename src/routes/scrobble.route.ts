import ScrobbleController from '../controllers/scroblle.controller';
import { Request, Response } from 'express';

const express = require('express');
const router = express.Router();
const scrobbleController = new ScrobbleController();

router.post(
  '/queue',
  scrobbleController.addScrobbleToQueue.bind(scrobbleController),
);

router.post(
  '/:id',
  scrobbleController.dispatchScrobble.bind(scrobbleController),
);

export default router;
