import { Injectable } from '@nestjs/common';
import type { AppRelease, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReleasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Saves a release; EAS may deliver the same build more than once. */
  upsert(data: Prisma.AppReleaseCreateInput): Promise<AppRelease> {
    const { easBuildId, ...fields } = data;
    return this.prisma.appRelease.upsert({
      where: { easBuildId },
      create: data,
      update: fields,
    });
  }

  /** The newest build that is not withdrawn, by build time (deliveries can arrive late). */
  findLatest(platform: string): Promise<AppRelease | null> {
    return this.prisma.appRelease.findFirst({
      where: { platform, withdrawn: false },
      orderBy: { completedAt: 'desc' },
    });
  }

  /** Releases with a local APK copy, newest first. */
  findMirrored(): Promise<{ id: string; mirroredFile: string | null }[]> {
    return this.prisma.appRelease.findMany({
      where: { mirroredFile: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { id: true, mirroredFile: true },
    });
  }

  async setMirroredFile(id: string, mirroredFile: string | null): Promise<void> {
    await this.prisma.appRelease.update({ where: { id }, data: { mirroredFile } });
  }
}
