import { Router } from 'express';
import EvolutiveAchievementsController from '../controllers/evolutiveAchievements.controller';
import { checkToken } from '../middlewares/botAuth';

const router = Router();
const evolutiveAchievementsController = new EvolutiveAchievementsController();

router.post('/initialize', checkToken, evolutiveAchievementsController.initializeAchievement.bind(evolutiveAchievementsController));
router.post('/evolve/:userId/:guildId', checkToken, evolutiveAchievementsController.checkEvolution.bind(evolutiveAchievementsController));
router.get('/timeline/:userId/:guildId', checkToken, evolutiveAchievementsController.getEvolutionTimeline.bind(evolutiveAchievementsController));
router.post('/discover/:achievementId', checkToken, evolutiveAchievementsController.discoverMystery.bind(evolutiveAchievementsController));
router.post('/collaborative', checkToken, evolutiveAchievementsController.createCollaborative.bind(evolutiveAchievementsController));

export default router;
