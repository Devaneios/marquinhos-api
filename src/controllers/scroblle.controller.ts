import { id } from 'date-fns/locale';
import { ScrobblerService } from '../services/scrobbler';
import { Request, Response } from 'express';

class ScrobbleController {
  scrobblerService: ScrobblerService;

  constructor() {
    this.scrobblerService = new ScrobblerService();
  }

  async addScrobbleToQueue(req: Request, res: Response) {
    try {
      const data = await this.scrobblerService.addScrobbleToQueue(
        req.body.playbackData,
      );
      return res.status(200).json({ data, message: 'Scrobble added to queue' });
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async dispatchScrobble(req: Request, res: Response) {
    try {
      const id = await this.scrobblerService.dispatchScrobble(req.params.id);
      return res.status(200).json({ data: id, message: 'Scrobbled' });
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }

  async removeUserFromScrobble(req: Request, res: Response) {
    try {
      const id = await this.scrobblerService.removeUserFromScrobble(
        req.params.scrobbleId,
        req.params.userId,
      );
      return res.status(200).json({ data: id, message: 'User removed' });
    } catch (error: any) {
      console.log(error);
      return res.status(500).json({ message: 'Unknown Error' });
    }
  }
}

export default ScrobbleController;
