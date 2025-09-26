import { Router } from 'express';
import MusicalDNAController from '../controllers/musicalDNA.controller';
import { checkToken } from '../middlewares/botAuth';

const router = Router();
const musicalDNAController = new MusicalDNAController();

router.post('/generate', checkToken, musicalDNAController.generateDNA.bind(musicalDNAController));
router.post('/compatibility', checkToken, musicalDNAController.calculateCompatibility.bind(musicalDNAController));
router.get('/evolution/:userId/:guildId', checkToken, musicalDNAController.getMusicalEvolution.bind(musicalDNAController));
router.get('/profile/:userId/:guildId', checkToken, musicalDNAController.getDNAProfile.bind(musicalDNAController));

export default router;
