import express from 'express';
import RecommendationsController from '../controllers/recommendations.controller';
import { checkToken } from '../middlewares/botAuth';

const router = express.Router();
const recommendationsController = new RecommendationsController();

// Recommendation routes
router.get('/personalized/:userId/:guildId', checkToken, recommendationsController.getPersonalizedRecommendations.bind(recommendationsController));
router.get('/genre/:genre/:guildId', checkToken, recommendationsController.getRecommendationsByGenre.bind(recommendationsController));
router.get('/time/:userId/:guildId/:timeOfDay', checkToken, recommendationsController.getRecommendationsByTime.bind(recommendationsController));
router.get('/collaborative/:userId/:guildId', checkToken, recommendationsController.getCollaborativeRecommendations.bind(recommendationsController));

// User profile update
router.post('/profile/:userId/:guildId', checkToken, recommendationsController.updateUserProfile.bind(recommendationsController));

export default router;
