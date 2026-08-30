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
    game: z.enum([
      'pong',
      'wordle',
      'cards',
      'tic-tac-toe',
      'connect-four',
      'hangman',
      'battleship',
      'checkers',
      'rock-paper-scissors',
      'wordle-race',
      'minesweeper-versus',
      'trivia-quiz',
      'dominoes-block',
      'word-search-race',
      'bingo-speed',
      'tower-unstable',
      'boggle-word-race',
      'word-chain',
      'snake-game',
    ]),
    difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    winningScore: z.number().int().min(1).max(99).optional(),
    roomId: z.string().min(1).optional(),
  }),
});

export const activityCreateRoomSchema = z.object({
  body: z.object({
    accessToken: z.string().min(1),
    instanceId: z.string().min(1),
    guildId: z.string().min(1),
    game: z.enum([
      'pong',
      'wordle',
      'cards',
      'tic-tac-toe',
      'connect-four',
      'hangman',
      'battleship',
      'checkers',
      'rock-paper-scissors',
      'wordle-race',
      'minesweeper-versus',
      'trivia-quiz',
      'dominoes-block',
      'word-search-race',
      'bingo-speed',
      'tower-unstable',
      'boggle-word-race',
      'word-chain',
      'snake-game',
    ]),
    queueEnabled: z.boolean(),
  }),
});
