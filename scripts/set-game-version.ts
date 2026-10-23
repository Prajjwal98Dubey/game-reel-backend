/**
 * Points a game at one of its registered versions and publishes it. Used to promote a
 * version uploaded without --promote, and to roll back. Old bundles stay on the CDN,
 * so apps mid-session never break.
 *
 *   npm run set-game-version -- <gameId> <version>
 */
import 'dotenv/config';
import { createDbAdapter } from '../src/prisma/create-adapter';
import { PrismaClient } from '../src/generated/prisma/client';

async function main(): Promise<void> {
  const [gameId, version] = process.argv.slice(2);
  if (!gameId || !version) throw new Error('Usage: set-game-version <gameId> <version>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({
    adapter: createDbAdapter(process.env.DATABASE_URL),
  });
  try {
    const target = await prisma.gameVersion.findUnique({
      where: { gameId_version: { gameId, version } },
      select: { id: true },
    });
    if (!target) throw new Error(`${gameId}@${version} is not registered.`);
    await prisma.game.update({
      where: { id: gameId },
      data: { currentVersionId: target.id, status: 'PUBLISHED' },
    });
    console.log(`${gameId} now serves ${version}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
