import { Router } from 'express';
import MusicTherapistController from '../controllers/musicTherapist.controller';
import { checkToken } from '../middlewares/botAuth';

const router = Router();
const musicTherapistController = new MusicTherapistController();

router.post('/session/start', checkToken, musicTherapistController.startSession.bind(musicTherapistController));
router.put('/session/:sessionId/progress', checkToken, musicTherapistController.updateProgress.bind(musicTherapistController));
router.put('/session/:sessionId/end', checkToken, musicTherapistController.endSession.bind(musicTherapistController));
router.get('/insights/:userId/:guildId', checkToken, musicTherapistController.getInsights.bind(musicTherapistController));

export default router;
