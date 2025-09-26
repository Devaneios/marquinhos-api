import express from 'express';
import PlaylistController from '../controllers/playlist.controller';
import { checkToken } from '../middlewares/botAuth';

const router = express.Router();
const playlistController = new PlaylistController();

// Playlist CRUD
router.post('/', checkToken, playlistController.createPlaylist.bind(playlistController));
router.get('/:playlistId', checkToken, playlistController.getPlaylist.bind(playlistController));
router.delete('/:playlistId', checkToken, playlistController.deletePlaylist.bind(playlistController));

// User and Guild playlists
router.get('/user/:userId/:guildId', checkToken, playlistController.getUserPlaylists.bind(playlistController));
router.get('/guild/:guildId', checkToken, playlistController.getGuildPlaylists.bind(playlistController));

// Track management
router.post('/:playlistId/tracks', checkToken, playlistController.addTrack.bind(playlistController));
router.delete('/:playlistId/tracks/:trackIndex', checkToken, playlistController.removeTrack.bind(playlistController));
router.post('/:playlistId/tracks/:trackIndex/vote', checkToken, playlistController.voteTrack.bind(playlistController));

// Follow system
router.post('/:playlistId/follow', checkToken, playlistController.followPlaylist.bind(playlistController));
router.post('/:playlistId/unfollow', checkToken, playlistController.unfollowPlaylist.bind(playlistController));

// Analytics
router.get('/popular/:guildId', checkToken, playlistController.getPopularTracks.bind(playlistController));

export default router;
