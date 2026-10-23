import { z } from 'zod';
import { GameManifestSchema, optionalCursor } from './games';

/**
 * `kind` leaves room for sponsored items and daily challenges without a breaking change.
 * Clients must skip kinds they do not know.
 */
export const FeedItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('game'), game: GameManifestSchema }),
]);
export type FeedItem = z.infer<typeof FeedItemSchema>;

export const FeedQuerySchema = z.object({
  cursor: optionalCursor,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FeedResponseSchema = z.object({
  items: z.array(FeedItemSchema),
  /** Opaque to the app. Always present: the feed is endless. */
  nextCursor: z.string(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;
