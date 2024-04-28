import { Request, Response } from 'express';
import { DiscordService } from '../services/discord';
import { ApiResponse } from '../types';
import { LastfmService } from '../services/lastfm';
import { decryptToken, encryptToken } from '../utils/crypto';

class AuthController {
  private discordService: DiscordService;
  private lastfmService: LastfmService;

  constructor() {
    this.discordService = new DiscordService();
    this.lastfmService = new LastfmService();
  }

  public async login(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<void>>> {
    const code = req?.query?.code as string | null;

    if (!code) {
      return res.status(400).json({
        error: 'Code not provided',
      });
    }

    try {
      const response = await this.discordService.requestToken(code);
      const encryptedToken = encryptToken(response.access_token);
      const encryptedRefreshToken = encryptToken(response.refresh_token);

      if (!encryptedToken || !encryptedRefreshToken) {
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      res.set('Authorization', `Bearer ${encryptedToken}`);
      res.set('Refresh-Token', encryptedRefreshToken);

      return res.status(200).json({ message: 'Authenticated successfully' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public async refreshToken(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<void>>> {
    const refresh_token = req.headers['Refresh-Token'] as string;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token not found' });
    }
    const decryptedRefreshToken = decryptToken(refresh_token);

    if (!decryptedRefreshToken) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    try {
      const response = await this.discordService.refreshToken(
        decryptedRefreshToken,
      );

      const encryptedToken = encryptToken(response.access_token);

      res.set('Authorization', `Bearer ${encryptedToken}`);

      return res.status(200).json({ message: 'Token refreshed' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public discordLoginUrl(
    req: Request,
    res: Response,
  ): Response<ApiResponse<string>> {
    return res.status(200).json({
      data: this.discordService.getAuthorizationUrl(),
    });
  }

  public lastfmLoginUrl(
    req: Request,
    res: Response,
  ): Response<ApiResponse<string>> {
    return res.status(200).json({
      data: this.lastfmService.getAuthorizationUrl(),
    });
  }
}

export default AuthController;
