import { ScrobblerService } from '../services/scrobbler';
import { Request, Response } from 'express';

const express = require('express');
const router = express.Router();
const scrobblerService = new ScrobblerService();

const errorMessages = [
  'Missing keys',
  'Missing values',
  'User already exists',
  'Wrong credentials',
  'Missing data',
  'User not found',
];

router.post('/', async (req: Request, res: Response) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Body is required' });
  }

  try {
    await scrobblerService.createScrobble(req.body);
  } catch (error: any) {
    if (errorMessages.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  return res.status(200).json({ message: 'User created' });
});

export default router;
