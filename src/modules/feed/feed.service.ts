import { Inject, Injectable } from '@nestjs/common';
import type { FeedQuery, FeedResponse } from '../../shared';
import { GamesService } from '../games/games.service';
import { FeedCursorCodec } from './feed-cursor.codec';
import { FEED_STRATEGY, FeedStrategy } from './feed-strategy';

@Injectable()
export class FeedService {
  constructor(
    @Inject(FEED_STRATEGY) private readonly strategy: FeedStrategy,
    private readonly cursors: FeedCursorCodec,
    private readonly games: GamesService,
  ) {}

  async next(playerId: string, query: FeedQuery, appVersion: string | null): Promise<FeedResponse> {
    const { items, nextCursor } = await this.strategy.next({
      playerId,
      cursor: this.cursors.decode(query.cursor),
      limit: query.limit,
      appVersion,
    });
    const manifests = await this.games.withBests(
      playerId,
      items.map((item) => item.game),
    );
    return {
      items: items.map((item, i) => ({ kind: item.kind, game: manifests[i] })),
      nextCursor: this.cursors.encode(nextCursor),
    };
  }
}
