import { Injectable } from '@nestjs/common';
import { Db, ScoresRepository } from './scores.repository';

/**
 * Per-player best scores (the denormalized `BestScore` table), so the catalogue,
 * feed and result screen never scan `Play`.
 */
@Injectable()
export class ScoresService {
  constructor(private readonly scores: ScoresRepository) {}

  bestsFor(playerId: string, gameIds: string[]): Promise<Map<string, number>> {
    return this.scores.findMany(playerId, [...new Set(gameIds)]);
  }

  bestFor(playerId: string, gameId: string, db?: Db): Promise<number | null> {
    return this.scores.findOne(playerId, gameId, db);
  }

  /** Records an accepted score. Pass `db` to run inside the caller's transaction. */
  async record(
    playerId: string,
    gameId: string,
    score: number,
    db?: Db,
  ): Promise<{ best: number; isNewBest: boolean }> {
    const isNewBest = await this.scores.upsertIfHigher(playerId, gameId, score, db);
    if (isNewBest) return { best: score, isNewBest };
    // Nothing written means an equal or higher best already exists.
    const best = await this.scores.findOne(playerId, gameId, db);
    return { best: best ?? score, isNewBest };
  }
}
