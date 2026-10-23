import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlaysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.PlayUncheckedCreateInput,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.play.create({ data, select: { id: true } });
  }
}
