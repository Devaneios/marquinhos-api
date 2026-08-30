import express from 'express';
import rateLimit from 'express-rate-limit';
import ActivityController from '../controllers/activity.controller';
import { validateRequest } from '../middlewares/validateRequest';
import {
  activityCreateRoomSchema,
  activityTokenExchangeSchema,
  activityWsSessionSchema,
} from '../schemas/activity.schema';

const router = express.Router();
const activity = new ActivityController();

// Called directly by the untrusted iframe client before any session exists,
// so it can't use checkToken (bot key or already-authenticated user token).
const activityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

router.post(
  '/token',
  activityLimiter,
  validateRequest(activityTokenExchangeSchema),
  activity.exchangeToken,
);
router.post(
  '/ws-session',
  activityLimiter,
  validateRequest(activityWsSessionSchema),
  activity.getWsSessionToken,
);
router.post(
  '/rooms',
  activityLimiter,
  validateRequest(activityCreateRoomSchema),
  activity.createRoom,
);

export default router;
