import express from 'express';
import GamificationController from '../controllers/gamification.controller';
import { checkToken } from '../middlewares/botAuth';

const router = express.Router();
const gamificationController = new GamificationController();

// XP and Level routes
router.post('/xp', checkToken, gamificationController.addXP.bind(gamificationController));
router.get('/level/:userId/:guildId', checkToken, gamificationController.getUserLevel.bind(gamificationController));
router.get('/leaderboard/:guildId', checkToken, gamificationController.getLeaderboard.bind(gamificationController));

// Achievement routes
router.post('/achievement/unlock', checkToken, gamificationController.unlockAchievement.bind(gamificationController));
router.get('/achievements/:userId/:guildId', checkToken, gamificationController.getUserAchievements.bind(gamificationController));
router.get('/achievements', gamificationController.getAllAchievements.bind(gamificationController));
router.post('/achievements', checkToken, gamificationController.createAchievement.bind(gamificationController));
router.post('/achievements/initialize', checkToken, gamificationController.initializeAchievements.bind(gamificationController));

export default router;
