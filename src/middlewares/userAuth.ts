import { Request, Response, NextFunction } from 'express';
import { DiscordService } from '../services/discord';
import { UserService } from '../services/user';

const discordService = new DiscordService();
const userService = new UserService();

export async function verifyDiscordToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const cookies = req.cookies;

  if (!cookies.access_token) {
    return res.status(401).json({ message: 'Token not provided' });
  }

  try {
    const discordUser = await discordService.getDiscordUser(
      cookies.access_token,
    );

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
    console.log(error);
    try {
      const response = await discordService.refreshToken(cookies.refresh_token);

      const discordUser = await discordService.getDiscordUser(
        response.access_token,
      );

      const user = await userService.userDB.findOne({
        id: discordUser.id,
      });

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      Object.defineProperty(req, 'user', {
        value: discordUser,
      });

      res.cookie('access_token', response.access_token, {
        maxAge: response.expires_in,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
      });

      next();
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
