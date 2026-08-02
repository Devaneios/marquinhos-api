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
    mode: z.enum(['single', 'multi']),
  }),
});
