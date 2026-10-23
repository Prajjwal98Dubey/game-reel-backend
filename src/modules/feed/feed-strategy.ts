import type { PlayableGame } from '../games/games.service';

export interface FeedCursor {
  seed: number;
  offset: number;
}

/** A feed item before the player's best scores are attached. */
export type FeedStrategyItem = { kind: 'game'; game: PlayableGame };

/**
 * Decides which games a player sees next. Bound to FEED_STRATEGY in FeedModule;
 * swapping algorithms (weighted, personalized) is a provider change there.
 */
export interface FeedStrategy {
  next(input: {
    playerId: string;
    cursor: FeedCursor | null;
    limit: number;
    appVersion: string | null;
  }): Promise<{ items: FeedStrategyItem[]; nextCursor: FeedCursor }>;
}

export const FEED_STRATEGY = Symbol('FEED_STRATEGY');
