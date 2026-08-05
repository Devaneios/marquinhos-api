import { z } from 'zod';

export const activityTokenExchangeSchema = z.object({
  body: z.object({
    code: z.string().min(1),
  }),
});

export const activityWsSessionSchema = z.object({
  body: z.object({
    accessToken: z.string().min(1),
    instanceId: z.string().min(1),
    guildId: z.string().min(1),
    mode: z.enum(['single', 'multi', 'local']),
    game: z.enum(['pong', 'wordle']),
    difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    winningScore: z.number().int().min(1).max(99).optional(),
  }),
});
