import { z } from 'zod';
import { GameIdSchema } from './games';

export const MAX_EVENTS_PER_BATCH = 100;

const clientTs = z.iso.datetime({ offset: true });

/** Props are typed per event; extra keys are kept so the app can add context without a release. */
function gameEvent<T extends string, S extends z.ZodRawShape>(type: T, props: S) {
  return z.object({
    type: z.literal(type),
    gameId: GameIdSchema,
    clientTs,
    // prefault: a missing `props` is parsed as {}, so required props still fail validation.
    props: z.looseObject(props).prefault({} as never),
  });
}

const nonNegInt = z.int().min(0);

export const AnalyticsEventSchema = z.discriminatedUnion('type', [
  gameEvent('game_view', {
    source: z.enum(['reels', 'catalogue']),
    position: nonNegInt.optional(),
  }),
  gameEvent('game_start', { round: z.int().min(1).optional() }),
  gameEvent('game_over', {
    score: nonNegInt,
    durationMs: nonNegInt,
    isNewBest: z.boolean().optional(),
  }),
  gameEvent('game_quit', { score: nonNegInt.optional(), durationMs: nonNegInt.optional() }),
  gameEvent('game_skip', { dwellMs: nonNegInt }),
  gameEvent('game_like', {}),
  gameEvent('game_unlike', {}),
  gameEvent('game_save', {}),
  gameEvent('game_unsave', {}),
  z.object({
    type: z.literal('tab_view'),
    clientTs,
    props: z.looseObject({ tab: z.string().min(1).max(32) }),
  }),
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventType = AnalyticsEvent['type'];

export const EventsBatchSchema = z.object({
  events: z.array(AnalyticsEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});
export type EventsBatch = z.infer<typeof EventsBatchSchema>;
