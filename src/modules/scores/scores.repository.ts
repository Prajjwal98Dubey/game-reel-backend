import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ScoresRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(playerId: string, gameIds: string[]): Promise<Map<string, number>> {
    if (gameIds.length === 0) return new Map();
    const rows = await this.prisma.bestScore.findMany({
      where: { playerId, gameId: { in: gameIds } },
      select: { gameId: true, score: true },
    });
    return new Map(rows.map((r) => [r.gameId, r.score]));
  }

  async findOne(playerId: string, gameId: string, db: Db = this.prisma): Promise<number | null> {
    const row = await db.bestScore.findUnique({
      where: { playerId_gameId: { playerId, gameId } },
      select: { score: true },
    });
    return row?.score ?? null;
  }

  /**
   * Stores `score` if it beats the current best (or there is none), safely under concurrent
   * submissions. Returns true when it was written, i.e. this is a new best.
   *
   * Insert first, skipping duplicates: if two first plays race, exactly one insert wins and
   * the other falls through to the conditional update, which only matches a lower score.
   */
  async upsertIfHigher(
    playerId: string,
    gameId: string,
    score: number,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const inserted = await db.bestScore.createMany({
      data: [{ playerId, gameId, score }],
      skipDuplicates: true,
    });
    if (inserted.count > 0) return true;
    const updated = await db.bestScore.updateMany({
      where: { playerId, gameId, score: { lt: score } },
      data: { score },
    });
    return updated.count > 0;
  }
}
