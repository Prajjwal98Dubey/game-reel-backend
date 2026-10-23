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
   * Atomically stores `score` if it beats the current best (or there is none).
   * Returns true when the row was written, i.e. this is a new best.
   */
  async upsertIfHigher(
    playerId: string,
    gameId: string,
    score: number,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const rows = await db.$queryRaw<{ score: number }[]>`
      INSERT INTO "BestScore" ("playerId", "gameId", "score", "updatedAt")
      VALUES (${playerId}, ${gameId}, ${score}, now())
      ON CONFLICT ("playerId", "gameId") DO UPDATE
        SET "score" = EXCLUDED."score", "updatedAt" = now()
        WHERE "BestScore"."score" < EXCLUDED."score"
      RETURNING "score"`;
    return rows.length > 0;
  }
}
