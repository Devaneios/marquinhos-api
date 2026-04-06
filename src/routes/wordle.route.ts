import express from 'express';
import WordleController from '../controllers/wordle.controller';
import { checkToken } from '../middlewares/botAuth';

const router = express.Router();
const wordle = new WordleController();

router.post('/guess', checkToken, wordle.submitGuess.bind(wordle));
router.get('/stats/:guildId', checkToken, wordle.getStats.bind(wordle));
router.get(
  '/session/:userId/:guildId',
  checkToken,
  wordle.getUserSession.bind(wordle),
);
router.post(
  '/admin/force-new-word',
  checkToken,
  wordle.forceNewWord.bind(wordle),
);
router.get(
  '/leaderboard/:guildId',
  checkToken,
  wordle.getLeaderboard.bind(wordle),
);
router.get('/validate/:guildId', checkToken, wordle.validateGuess.bind(wordle));
router.post('/config', checkToken, wordle.setConfig.bind(wordle));
router.get('/config/:guildId', checkToken, wordle.getConfig.bind(wordle));

export default router;
