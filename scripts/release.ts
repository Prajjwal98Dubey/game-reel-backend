/**
 * Withdraws a bad app release, or restores it. `/v1/app/download` serves the newest release
 * that is not withdrawn, so withdrawing the latest one falls back to the previous build.
 *
 *   npm run release:withdraw -- <easBuildId>
 *   npm run release:restore -- <easBuildId>
 */
import 'dotenv/config';
import { createDbAdapter } from '../src/prisma/create-adapter';
import { PrismaClient } from '../src/generated/prisma/client';

async function main(): Promise<void> {
  const [action, easBuildId] = process.argv.slice(2);
  if ((action !== 'withdraw' && action !== 'restore') || !easBuildId) {
    throw new Error('Usage: release:withdraw <easBuildId> | release:restore <easBuildId>');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({
    adapter: createDbAdapter(process.env.DATABASE_URL),
  });
  try {
    const { count } = await prisma.appRelease.updateMany({
      where: { easBuildId },
      data: { withdrawn: action === 'withdraw' },
    });
    if (count === 0) throw new Error(`No release with EAS build id ${easBuildId}.`);
    const latest = await prisma.appRelease.findFirst({
      where: { platform: 'android', withdrawn: false },
      orderBy: { completedAt: 'desc' },
      select: { version: true, buildNumber: true, easBuildId: true },
    });
    console.log(`${easBuildId} ${action === 'withdraw' ? 'withdrawn' : 'restored'}.`);
    console.log(
      latest
        ? `Downloads now serve ${latest.version} (${latest.buildNumber}), build ${latest.easBuildId}.`
        : 'No release is available for download now.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
