import express from 'express';
import AiChatController from '../controllers/aiChat.controller';
import { checkToken } from '../middlewares/botAuth';
import { validateRequest } from '../middlewares/validateRequest';
import { aiChatRespondSchema } from '../schemas/aiChat.schema';

const router = express.Router();
const aiChat = new AiChatController();

router.post(
  '/respond',
  checkToken,
  validateRequest(aiChatRespondSchema),
  aiChat.respond.bind(aiChat) as unknown as express.RequestHandler,
);

export default router;
