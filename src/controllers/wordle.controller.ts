import { Request, Response } from 'express';
import { WordleService } from '../services/wordle';

const service = new WordleService();

export default class WordleController {
  submitGuess(req: Request, res: Response): void {
    const { userId, guildId, guess } = req.body as {
      userId?: string;
      guildId?: string;
      guess?: string;
    };

    if (!userId || !guildId || !guess) {
      res
        .status(400)
        .json({ message: 'userId, guildId e guess são obrigatórios.' });
      return;
    }

    try {
      const result = service.submitGuess(userId, guildId, guess);
      if ('error' in result) {
        res.status(400).json({ message: result.error });
        return;
      }
      res.json({ data: result });
    } catch (err) {
      console.error('WordleController.submitGuess error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  getStats(req: Request, res: Response): void {
    const { guildId } = req.params;
    if (!guildId) {
      res.status(400).json({ message: 'guildId é obrigatório.' });
      return;
    }

    try {
      const stats = service.getDailyStats(guildId);
      res.json({ data: stats });
    } catch (err) {
      console.error('WordleController.getStats error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  getUserSession(req: Request, res: Response): void {
    const { userId, guildId } = req.params;
    if (!userId || !guildId) {
      res.status(400).json({ message: 'userId e guildId são obrigatórios.' });
      return;
    }

    try {
      const session = service.getUserSession(userId, guildId);
      res.json({ data: session });
    } catch (err) {
      console.error('WordleController.getUserSession error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  getDayGuesses(req: Request, res: Response): void {
    const { guildId } = req.params;
    if (!guildId) {
      res.status(400).json({ message: 'guildId é obrigatório.' });
      return;
    }

    try {
      const data = service.getDayGuesses(guildId);
      res.json({ data });
    } catch (err) {
      console.error('WordleController.getDayGuesses error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  forceNewWord(req: Request, res: Response): void {
    const { guildId } = req.body as { guildId?: string };
    if (!guildId) {
      res.status(400).json({ message: 'guildId é obrigatório.' });
      return;
    }

    try {
      const result = service.forceNewWord(guildId);
      const stats = service.getDailyStats(guildId);
      res.json({ data: { ...result, stats } });
    } catch (err) {
      console.error('WordleController.forceNewWord error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  getLeaderboard(req: Request, res: Response): void {
    const { guildId } = req.params;
    if (!guildId) {
      res.status(400).json({ message: 'guildId é obrigatório.' });
      return;
    }

    try {
      const entries = service.getLeaderboard(guildId);
      res.json({ data: entries });
    } catch (err) {
      console.error('WordleController.getLeaderboard error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  setConfig(req: Request, res: Response): void {
    const { guildId, channelId } = req.body as {
      guildId?: string;
      channelId?: string;
    };
    if (!guildId || !channelId) {
      res
        .status(400)
        .json({ message: 'guildId e channelId são obrigatórios.' });
      return;
    }

    try {
      service.setConfig(guildId, channelId);
      res.json({ message: 'Configuração salva.' });
    } catch (err) {
      console.error('WordleController.setConfig error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  validateGuess(req: Request, res: Response): void {
    const { guildId } = req.params;
    const guess = req.query.guess as string | undefined;

    if (!guildId || !guess) {
      res.status(400).json({ message: 'guildId e guess são obrigatórios.' });
      return;
    }

    try {
      const result = service.validateGuess(guildId, guess);
      res.json({ data: result });
    } catch (err) {
      console.error('WordleController.validateGuess error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  getConfig(req: Request, res: Response): void {
    const { guildId } = req.params;
    if (!guildId) {
      res.status(400).json({ message: 'guildId é obrigatório.' });
      return;
    }

    try {
      const config = service.getConfig(guildId);
      res.json({ data: config });
    } catch (err) {
      console.error('WordleController.getConfig error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }

  getStreak(req: Request, res: Response): void {
    const { userId, guildId } = req.params;
    if (!userId || !guildId) {
      res.status(400).json({ message: 'userId e guildId são obrigatórios.' });
      return;
    }

    try {
      const streak = service.getStreak(userId, guildId);
      res.json({ data: streak });
    } catch (err) {
      console.error('WordleController.getStreak error:', err);
      res.status(500).json({ message: 'Erro interno.' });
    }
  }
}
