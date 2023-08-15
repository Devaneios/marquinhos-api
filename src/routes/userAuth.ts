import { UserAuthService } from '../services/userAuth';
import { Request, Response } from 'express';

const express = require('express');
const router = express.Router();
const userAuthService = new UserAuthService();

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
    await userAuthService.create(req.body);
  } catch (error: any) {
    if (errorMessages.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  return res.status(200).json({ message: 'User created' });
});

router.delete('/', async (req: Request, res: Response) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Body is required' });
  }

  try {
    await userAuthService.delete(req.body.discordId, req.body.discordToken);
  } catch (error: any) {
    if (errorMessages.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  return res.status(200).json({ message: 'User deleted' });
});

router.post('/:discordId', async (req: Request, res: Response) => {
  if (!req.params.discordId) {
    return res.status(400).json({ message: 'Discord ID is required' });
  }

  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Body is required' });
  }

  try {
    await userAuthService.exists(req.params.discordId, req.body.discordToken);
  } catch (error: any) {
    if (errorMessages.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  return res.status(200).json({ message: 'User exists' });
});

export default router;
