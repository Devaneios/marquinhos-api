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

router.delete('/lastfm-data', async (req: Request, res: Response) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Body is required' });
  }

  try {
    await userAuthService.deleteLastfmData(
      req.body.discordId,
      req.body.discordToken,
    );
  } catch (error: any) {
    console.log(error);
    if (errorMessages.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  return res.status(200).json({ message: 'User deleted' });
});

router.delete('/all-data', async (req: Request, res: Response) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Body is required' });
  }

  try {
    await userAuthService.deleteAllData(
      req.body.discordId,
      req.body.discordToken,
    );
  } catch (error: any) {
    if (errorMessages.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  return res.status(200).json({ message: 'User deleted' });
});

router.post('/exists/:discordId', async (req: Request, res: Response) => {
  if (!req.params) {
    return res.status(400).json({ message: 'Params are required' });
  }

  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Body is required' });
  }

  try {
    return res
      .status(200)
      .json(
        await userAuthService.exists(
          req.params.discordId,
          req.body.discordToken,
        ),
      );
  } catch (error: any) {
    if (errorMessages.includes(error.message)) {
      if (error.message === 'User not found') {
        return res.status(404).json({ message: error.message });
      } else {
        return res.status(400).json({ message: error.message });
      }
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
});

router.post(
  '/lastfm-status/:discordId',
  async (req: Request, res: Response) => {
    if (!req.params) {
      return res.status(400).json({ message: 'Params are required' });
    }

    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: 'Body is required' });
    }

    try {
      const lastfmTokenExists = await userAuthService.hasLastfmToken(
        req.params.discordId,
        req.body.discordToken,
      );

      if (lastfmTokenExists) {
        return res.status(200).json({ message: 'Lastfm token exists' });
      } else {
        return res.status(404).json({ message: 'Lastfm token not found' });
      }
    } catch (error: any) {
      if (errorMessages.includes(error.message)) {
        if (error.message === 'User not found') {
          return res.status(404).json({ message: error.message });
        } else {
          return res.status(400).json({ message: error.message });
        }
      } else {
        return res.status(500).json({ message: 'Unknown Error' });
      }
    }
  },
);

router.patch('/:discordId', async (req: Request, res: Response) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: 'Body is required' });
  }

  try {
    return res
      .status(200)
      .json(
        await userAuthService.toggleScrobbles(
          req.params.discordId,
          req.body.discordToken,
        ),
      );
  } catch (error: any) {
    if (errorMessages.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    } else {
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
});

export default router;
