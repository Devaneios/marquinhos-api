import { verifyDiscordToken } from '../middlewares/userAuth';
import UserController from '../controllers/user.controller';
import express from 'express';
import { checkToken } from '../middlewares/botAuth';

const router = express.Router();
const userController = new UserController();

router.get(
  '/profile',
  verifyDiscordToken,
  userController.getProfile.bind(userController),
);
router.get(
  '/exists',
  verifyDiscordToken,
  userController.exists.bind(userController),
);
router.get(
  '/lastfm-status',
  verifyDiscordToken,
  userController.lastfmStatus.bind(userController),
);
router.post('/create', userController.create.bind(userController));
router.post(
  '/enable-lastfm',
  verifyDiscordToken,
  userController.enableLastfm.bind(userController),
);
router.delete(
  '/lastfm',
  verifyDiscordToken,
  userController.deleteLastfmData.bind(userController),
);
router.delete(
  '/',
  verifyDiscordToken,
  userController.deleteAllData.bind(userController),
);
router.patch(
  '/scrobble',
  verifyDiscordToken,
  userController.toggleScrobbles.bind(userController),
);
router.get(
  '/top-artists/:period/:id',
  checkToken,
  userController.getTopArtists.bind(userController),
);
router.get(
  '/top-albums/:period/:id',
  checkToken,
  userController.getTopAlbums.bind(userController),
);
router.get(
  '/top-tracks/:period/:id',
  checkToken,
  userController.getTopTracks.bind(userController),
);

export default router;
