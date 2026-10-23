import { Module } from '@nestjs/common';
import { ScoresRepository } from './scores.repository';
import { ScoresService } from './scores.service';

/** Owns `BestScore`. Shared by games, feed and plays without them depending on each other. */
@Module({
  providers: [ScoresService, ScoresRepository],
  exports: [ScoresService],
})
export class ScoresModule {}
