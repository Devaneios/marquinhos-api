import express from 'express';
import KaraokeController from '../controllers/karaoke.controller';
import { checkToken } from '../middlewares/botAuth';

const router = express.Router();
const karaokeController = new KaraokeController();

// Session management
router.post('/session', checkToken, karaokeController.createSession.bind(karaokeController));
router.get('/session/:sessionId', checkToken, karaokeController.getSession.bind(karaokeController));
router.get('/active/:guildId/:channelId', checkToken, karaokeController.getActiveSession.bind(karaokeController));
router.delete('/session/:sessionId', checkToken, karaokeController.endSession.bind(karaokeController));

// Participant management
router.post('/session/:sessionId/join', checkToken, karaokeController.joinSession.bind(karaokeController));
router.post('/session/:sessionId/leave', checkToken, karaokeController.leaveSession.bind(karaokeController));

// Track and scoring
router.post('/session/:sessionId/track', checkToken, karaokeController.setCurrentTrack.bind(karaokeController));
router.post('/session/:sessionId/score', checkToken, karaokeController.updateScore.bind(karaokeController));
router.get('/session/:sessionId/leaderboard', checkToken, karaokeController.getLeaderboard.bind(karaokeController));

// Statistics
router.get('/stats/user/:userId/:guildId', checkToken, karaokeController.getUserStats.bind(karaokeController));
router.get('/stats/guild/:guildId', checkToken, karaokeController.getGuildStats.bind(karaokeController));

export default router;
