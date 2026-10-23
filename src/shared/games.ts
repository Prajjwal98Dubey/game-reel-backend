import { z } from 'zod';

export const GameIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Lowercase letters, digits and dashes only');

export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Expected a semantic version like "1.2.0"');

export const GameControlSchema = z.enum(['tap', 'drag-x']);
export type GameControl = z.infer<typeof GameControlSchema>;

export const GameManifestSchema = z.object({
  id: GameIdSchema,
  name: z.string(),
  version: SemverSchema,
  bundleUrl: z.url(),
  thumbnailUrl: z.url(),
  description: z.string(),
  tags: z.array(z.string()),
  controls: z.array(GameControlSchema),
  avgRoundSeconds: z.int().positive(),
  minAppVersion: SemverSchema,
  sdkVersion: z.int().positive(),
  /** This player's best score, null if never played. */
  best: z.int().nullable(),
});
export type GameManifest = z.infer<typeof GameManifestSchema>;

/** Empty query values (`?cursor=`) mean "not set". */
export const optionalCursor = z
  .string()
  .max(512)
  .optional()
  .transform((v) => v || undefined);

export const ListGamesQuerySchema = z.object({
  tag: z
    .string()
    .max(32)
    .optional()
    .transform((v) => v || undefined),
  cursor: optionalCursor,
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type ListGamesQuery = z.infer<typeof ListGamesQuerySchema>;

export const ListGamesResponseSchema = z.object({
  items: z.array(GameManifestSchema),
  nextCursor: z.string().nullable(),
});
export type ListGamesResponse = z.infer<typeof ListGamesResponseSchema>;
