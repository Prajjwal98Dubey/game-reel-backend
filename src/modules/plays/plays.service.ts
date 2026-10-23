import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { SubmitPlayRequest, SubmitPlayResponse } from '../../shared';
import { GamesService } from '../games/games.service';
import { ScoresService } from '../scores/scores.service';
import { PlaysRepository } from './plays.repository';
import { SCORE_VALIDATOR, ScoreValidator } from './score-validator';

@Injectable()
export class PlaysService {
  private readonly logger = new Logger(PlaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plays: PlaysRepository,
    private readonly games: GamesService,
    private readonly scores: ScoresService,
    @Inject(SCORE_VALIDATOR) private readonly validator: ScoreValidator,
  ) {}

  /** Stores a finished round. Flagged rounds are kept for review but never update the best. */
  async submit(playerId: string, play: SubmitPlayRequest): Promise<SubmitPlayResponse> {
    const { exists, version } = await this.games.findVersion(play.gameId, play.gameVersion);
    if (!exists) throw AppException.gameNotFound(play.gameId);

    const { flagged, reasons } = this.validator.check({ ...play, version });
    if (flagged) {
      this.logger.warn({
        msg: 'play flagged',
        playerId,
        gameId: play.gameId,
        score: play.score,
        reasons,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.plays.create(
        {
          playerId,
          gameId: play.gameId,
          gameVersion: play.gameVersion,
          score: play.score,
          durationMs: play.durationMs,
          seed: play.seed,
          flagged,
        },
        tx,
      );
      if (flagged) {
        const best = await this.scores.bestFor(playerId, play.gameId, tx);
        return { best: best ?? 0, isNewBest: false };
      }
      return this.scores.record(playerId, play.gameId, play.score, tx);
    });
  }
}
