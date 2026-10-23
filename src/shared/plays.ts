import { z } from 'zod';
import { GameIdSchema, SemverSchema } from './games';

export const SubmitPlayRequestSchema = z.object({
  gameId: GameIdSchema,
  gameVersion: SemverSchema,
  score: z.int().min(0).max(1_000_000_000),
  durationMs: z
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000),
  seed: z.int().optional(),
});
export type SubmitPlayRequest = z.infer<typeof SubmitPlayRequestSchema>;

export const SubmitPlayResponseSchema = z.object({
  /** Player's best for this game after this play; 0 if they have no accepted play yet. */
  best: z.int(),
  isNewBest: z.boolean(),
});
export type SubmitPlayResponse = z.infer<typeof SubmitPlayResponseSchema>;
