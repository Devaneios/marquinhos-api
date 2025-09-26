import { Router } from 'express';
import VoiceAIController from '../controllers/voiceAI.controller';
import { checkToken } from '../middlewares/botAuth';

const router = Router();
const voiceAIController = new VoiceAIController();

router.post('/analyze', checkToken, voiceAIController.analyzeVoice.bind(voiceAIController));
router.get('/progress/:userId/:guildId', checkToken, voiceAIController.getVoiceProgress.bind(voiceAIController));
router.get('/exercises/:userId/:guildId', checkToken, voiceAIController.generateVocalExercises.bind(voiceAIController));

export default router;
