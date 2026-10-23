import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { FeedCursorCodec } from './feed-cursor.codec';
import { FEED_STRATEGY } from './feed-strategy';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { ShuffledFeedStrategy } from './shuffled-feed.strategy';

@Module({
  imports: [GamesModule],
  controllers: [FeedController],
  providers: [
    FeedService,
    FeedCursorCodec,
    // Swap the feed algorithm here (e.g. WeightedFeedStrategy), optionally behind a flag.
    { provide: FEED_STRATEGY, useClass: ShuffledFeedStrategy },
  ],
})
export class FeedModule {}
