import { ApiResponse } from '../types';
import { UserService } from '../services/user';
import { Request, Response } from 'express';
import { DiscordService } from '../services/discord';

class UserController {
  userService: UserService;
  discordService: DiscordService;

  constructor() {
    this.userService = new UserService();
    this.discordService = new DiscordService();
  }

  public async create(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<void>>> {
    try {
      const cookies = req.cookies;
      const discordUser = await this.discordService.getDiscordUser(
        cookies.access_token,
      );
      await this.userService.create(discordUser.id);
    } catch (error: any) {
      console.log(error);

      if (error.message === 'User already exists') {
        return res.status(409).json({ message: error.message });
      }
      return res.status(500).json({ message: 'Unknown Error' });
    }

    return res.status(200).json(req.user);
  }

  public async enableLastfm(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<void>>> {
    if (!req.user) {
      return res.status(500).json({ message: 'Internal Server error' });
    }

    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Missing credentials' });
    }

    try {
      await this.userService.enableLastfm(req.user.id, token);
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }

    return res.status(200).json({ message: 'Lastfm enabled' });
  }

  public async getProfile(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<void>>> {
    if (!req.user) {
      return res.status(500).json({ message: 'Internal Server error' });
    }

    try {
      return res.status(200).json(req.user);
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  public async toggleScrobbles(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    if (!req.user) {
      return res.status(500).json({ message: 'Internal Server error' });
    }

    try {
      return res
        .status(200)
        .json(await this.userService.toggleScrobbles(req.user.id));
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  public async deleteLastfmData(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<string>>> {
    if (!req.user) {
      return res.status(500).json({ message: 'Internal Server error' });
    }

    try {
      await this.userService.deleteLastfmData(req.user.id);
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }

    return res.status(200).json({ message: 'User deleted' });
  }

  public async deleteAllData(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<string>>> {
    if (!req.user) {
      return res.status(500).json({ message: 'Internal Server error' });
    }

    try {
      await this.userService.deleteAllData(req.user.id);
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }

    res.cookie('access_token', '', { maxAge: 0 });
    res.cookie('refresh_token', '', { maxAge: 0 });

    return res.status(200).json({ message: 'User deleted' });
  }

  public async exists(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    if (!req.user) {
      return res.status(500).json({ message: 'Internal Server error' });
    }

    try {
      return res.status(200).json(await this.userService.exists(req.params.id));
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  public async lastfmStatus(
    req: Request,
    res: Response,
  ): Promise<Response<ApiResponse<boolean>>> {
    if (!req.user) {
      return res.status(500).json({ message: 'Internal Server error' });
    }

    try {
      const lastfmStatus = await this.userService.hasValidLastfmSessionToken(
        req.user.id,
      );

      if (lastfmStatus) {
        return res.status(200).json(lastfmStatus);
      } else {
        return res.status(404).json({ message: 'Lastfm token not found' });
      }
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default UserController;
