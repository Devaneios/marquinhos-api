import { Request, Response, NextFunction } from 'express';
import { DiscordService } from '../services/discord';
import { UserService } from '../services/user';
import { decryptToken } from '../utils/crypto';

const discordService = new DiscordService();
const userService = new UserService();

export async function verifyDiscordToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers['authorization'] as string;
  const access_token = authorization && authorization.split(' ')[1];

  if (!access_token) {
    return res.status(401).json({ message: 'Token not provided' });
  }

  const decryptedToken = decryptToken(access_token);

  if (!decryptedToken) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }

  try {
    const discordUser = await discordService.getDiscordUser(decryptedToken);

    const highestRole = await discordService.getDiscordGuildUserHighestRole(
      decryptedToken,
    );

    discordUser.highestRole = highestRole;

    if (!discordUser) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const user = await userService.userDB.findOne({
      id: discordUser.id,
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    Object.defineProperty(req, 'user', {
      value: discordUser,
    });
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
