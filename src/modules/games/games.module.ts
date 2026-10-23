import { Module } from '@nestjs/common';
import { ScoresModule } from '../scores/scores.module';
import { GamesController } from './games.controller';
import { GamesRepository } from './games.repository';
import { GamesService } from './games.service';

@Module({
  imports: [ScoresModule],
  controllers: [GamesController],
  providers: [GamesService, GamesRepository],
  exports: [GamesService],
})
export class GamesModule {}
