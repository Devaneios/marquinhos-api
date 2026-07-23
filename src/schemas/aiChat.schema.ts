import { z } from 'zod';

export const aiChatRespondSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    guildId: z.string().min(1),
    channelId: z.string().min(1),
    content: z.string().min(1),
    recentMessages: z
      .array(z.object({ author: z.string(), content: z.string() }))
      .max(20),
    repliedMessage: z
      .object({ author: z.string(), content: z.string() })
      .optional(),
  }),
});
