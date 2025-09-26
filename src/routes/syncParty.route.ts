import { Router } from 'express';
import SyncPartyController from '../controllers/syncParty.controller';
import { checkToken } from '../middlewares/botAuth';

const router = Router();
const syncPartyController = new SyncPartyController();

router.post('/create', checkToken, syncPartyController.createParty.bind(syncPartyController));
router.post('/:partyId/join', checkToken, syncPartyController.joinParty.bind(syncPartyController));
router.post('/:partyId/track', checkToken, syncPartyController.addTrack.bind(syncPartyController));
router.post('/:partyId/vote', checkToken, syncPartyController.voteTrack.bind(syncPartyController));
router.post('/:partyId/next', checkToken, syncPartyController.playNext.bind(syncPartyController));
router.post('/:partyId/chat', checkToken, syncPartyController.addChatMessage.bind(syncPartyController));
router.post('/:partyId/end', checkToken, syncPartyController.endParty.bind(syncPartyController));
router.get('/:partyId/stats', checkToken, syncPartyController.getPartyStats.bind(syncPartyController));
router.get('/active/:guildId', checkToken, syncPartyController.getActiveParties.bind(syncPartyController));

export default router;
