import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PlayerKind } from '../../generated/prisma/enums';

@Injectable()
export class PlayersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the player for this device, or touches `lastSeenAt` if it already exists. */
  upsertByDeviceId(deviceId: string): Promise<{ id: string; kind: PlayerKind }> {
    return this.prisma.player.upsert({
      where: { deviceId },
      create: { deviceId },
      update: { lastSeenAt: new Date() },
      select: { id: true, kind: true },
    });
  }
}
