import { Request, Response } from 'express';
import { DiscordService } from '../services/discord';
import { ApiResponse } from '../types';
import { LastfmService } from '../services/lastfm';

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
        error: 'Code not found',
      });
    }

    try {
      const response = await this.discordService.requestToken(code);

      res.cookie('access_token', response.access_token, {
        maxAge: Date.now() + response.expires_in,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
      });

      res.cookie('refresh_token', response.refresh_token, {
        maxAge: Date.now() + 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
      });

      return res.status(200).json({ message: 'Authenticated successfully' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public async refreshToken(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<void>>> {
    const refresh_token = req.cookies.refresh_token;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token not found' });
    }

    try {
      const response = await this.discordService.refreshToken(refresh_token);

      res.cookie('access_token', response.access_token, {
        maxAge: response.expires_in,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
      });

      return res.status(200).json({ message: 'Token refreshed' });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public async logout(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<void>>> {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return res.status(200).json({ message: 'Logged out successfully' });
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
