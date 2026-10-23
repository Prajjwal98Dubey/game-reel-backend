import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { ScoresModule } from '../scores/scores.module';
import { PlaysController } from './plays.controller';
import { PlaysRepository } from './plays.repository';
import { PlaysService } from './plays.service';
import { PlausibilityScoreValidator, SCORE_VALIDATOR } from './score-validator';

@Module({
  imports: [GamesModule, ScoresModule],
  controllers: [PlaysController],
  providers: [
    PlaysService,
    PlaysRepository,
    // Replace with replay verification once leaderboards ship (BACKEND.md §8.2).
    { provide: SCORE_VALIDATOR, useClass: PlausibilityScoreValidator },
  ],
})
export class PlaysModule {}
