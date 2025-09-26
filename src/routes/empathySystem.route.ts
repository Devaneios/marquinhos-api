import { Router } from 'express';
import EmpathySystemController from '../controllers/empathySystem.controller';
import { checkToken } from '../middlewares/botAuth';

const router = Router();
const empathySystemController = new EmpathySystemController();

router.post('/analyze/:guildId', checkToken, empathySystemController.analyzeGuild.bind(empathySystemController));
router.get('/interventions/:guildId', checkToken, empathySystemController.getInterventionRecommendations.bind(empathySystemController));
router.post('/intervention/:guildId', checkToken, empathySystemController.executeIntervention.bind(empathySystemController));
router.get('/insights/:guildId', checkToken, empathySystemController.getEmpathyInsights.bind(empathySystemController));

export default router;
