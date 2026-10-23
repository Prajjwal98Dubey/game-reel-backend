import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type GameRow = Prisma.GameGetPayload<{ include: { currentVersion: true } }>;

/** A published game; its current version is guaranteed by the `published` filter. */
export type GameWithVersion = GameRow & { currentVersion: NonNullable<GameRow['currentVersion']> };

const published = {
  status: 'PUBLISHED',
  currentVersionId: { not: null },
} satisfies Prisma.GameWhereInput;

@Injectable()
export class GamesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All published games with their current version, ordered by id. */
  findPublished(): Promise<GameWithVersion[]> {
    return this.prisma.game.findMany({
      where: published,
      include: { currentVersion: true },
      orderBy: { id: 'asc' },
    }) as Promise<GameWithVersion[]>;
  }

  findPublishedById(id: string): Promise<GameWithVersion | null> {
    return this.prisma.game.findFirst({
      where: { ...published, id },
      include: { currentVersion: true },
    }) as Promise<GameWithVersion | null>;
  }

  /** The game (any status) and, if it exists, the requested version's scoring limits. */
  findWithVersion(
    gameId: string,
    version: string,
  ): Promise<{ versions: { maxScorePerSec: number }[] } | null> {
    return this.prisma.game.findUnique({
      where: { id: gameId },
      select: { versions: { where: { version }, select: { maxScorePerSec: true } } },
    });
  }
}
