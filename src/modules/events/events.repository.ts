import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(data: Prisma.EventCreateManyInput[]): Promise<number> {
    const { count } = await this.prisma.event.createMany({ data });
    return count;
  }
}
