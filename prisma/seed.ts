/**
 * Seeds published games. Safe to re-run.
 *
 * - Default: the five prototype games at 1.0.0, with bundle URLs on the CDN layout used by
 *   scripts/publish-game.ts (`<CDN_BASE_URL>/games/<id>/<version>/`).
 * - With LOCAL_GAMES_DIR (local development): the games built by the frontend
 *   (`frontend/games/dist`), read from its catalog.json, so ids, versions and thumbnails
 *   match the bundles actually being served. Published games missing from it are disabled.
 */
import 'dotenv/config';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client';
import { createDbAdapter } from '../src/prisma/create-adapter';
import { GameControlSchema, GameIdSchema, SemverSchema } from '../src/shared';

export interface SeedGame {
  id: string;
  name: string;
  description: string;
  tags: string[];
  controls: z.infer<typeof GameControlSchema>[];
  avgRoundSeconds: number;
  version: string;
  minAppVersion: string;
  sdkVersion: number;
  maxScorePerSec: number;
  /** File name of the thumbnail inside the version folder. */
  thumbnailFile: string;
  /** Gzipped bundle size; 0 when unknown. */
  sizeBytes: number;
}

const prototype = (
  game: Pick<
    SeedGame,
    'id' | 'name' | 'description' | 'tags' | 'controls' | 'avgRoundSeconds' | 'maxScorePerSec'
  >,
): SeedGame => ({
  ...game,
  version: '1.0.0',
  minAppVersion: '1.0.0',
  sdkVersion: 1,
  thumbnailFile: 'thumb.webp',
  sizeBytes: 0,
});

export const DEFAULT_GAMES: SeedGame[] = [
  prototype({
    id: 'stack',
    name: 'Stack',
    description: 'Drop each block on the last one. Whatever hangs over the edge gets cut.',
    tags: ['timing', 'one-tap'],
    controls: ['tap'],
    avgRoundSeconds: 25,
    maxScorePerSec: 3,
  }),
  prototype({
    id: 'hop',
    name: 'Hop',
    description: 'Tap to flap through the gaps. One touch on a pillar ends the run.',
    tags: ['reflex', 'endless'],
    controls: ['tap'],
    avgRoundSeconds: 20,
    maxScorePerSec: 1,
  }),
  prototype({
    id: 'bullseye',
    name: 'Bullseye',
    description: 'Stop the needle inside the zone. The zone shrinks with every hit.',
    tags: ['timing', 'precision'],
    controls: ['tap'],
    avgRoundSeconds: 15,
    maxScorePerSec: 4,
  }),
  prototype({
    id: 'catch',
    name: 'Catch',
    description: 'Catch the fruit, dodge the bombs. Miss three fruit and the round ends.',
    tags: ['drag', 'arcade'],
    controls: ['drag-x'],
    avgRoundSeconds: 40,
    maxScorePerSec: 3,
  }),
  prototype({
    id: 'pop',
    name: 'Pop',
    description: 'Pop every bubble before its ring runs out. Three escapes end the round.',
    tags: ['reflex', 'tap'],
    controls: ['tap'],
    avgRoundSeconds: 35,
    maxScorePerSec: 3,
  }),
];

const CatalogSchema = z.array(
  z.object({
    id: GameIdSchema,
    name: z.string().min(1),
    description: z.string(),
    tags: z.array(z.string()),
    controls: z.array(GameControlSchema).min(1),
    version: SemverSchema,
    avgRoundSeconds: z.int().positive(),
    minAppVersion: SemverSchema.default('1.0.0'),
    sdkVersion: z.int().positive().default(1),
    maxScorePerSec: z.number().positive(),
  }),
);

const THUMBNAIL_FILES = ['thumb.webp', 'thumb.png', 'thumb.jpg', 'thumb.svg'];

/** Reads a built games directory: `catalog.json` plus `<id>/<version>/index.html` and a thumbnail. */
export function loadCatalog(gamesDir: string): SeedGame[] {
  const catalog = CatalogSchema.parse(
    JSON.parse(readFileSync(join(gamesDir, 'catalog.json'), 'utf8')),
  );
  return catalog.map((entry) => {
    const dir = join(gamesDir, entry.id, entry.version);
    if (!existsSync(join(dir, 'index.html'))) {
      throw new Error(`${entry.id}@${entry.version}: missing ${join(dir, 'index.html')}`);
    }
    const thumbnailFile = THUMBNAIL_FILES.find((file) => existsSync(join(dir, file)));
    if (!thumbnailFile) throw new Error(`${entry.id}@${entry.version}: no thumbnail in ${dir}`);
    const sizeBytes = readdirSync(dir)
      .map((file) => join(dir, file))
      .filter((file) => statSync(file).isFile())
      .reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
    return { ...entry, thumbnailFile, sizeBytes };
  });
}

/**
 * Upserts each game and makes `version` its published current version. A dev/seed tool:
 * re-running refreshes an existing version's URLs (published versions are otherwise immutable).
 * With `exclusive`, published games not in `games` are disabled.
 */
export async function seed(
  prisma: PrismaClient,
  cdnBaseUrl: string,
  games: SeedGame[] = DEFAULT_GAMES,
  { exclusive = false }: { exclusive?: boolean } = {},
): Promise<void> {
  const cdn = cdnBaseUrl.replace(/\/+$/, '');
  for (const g of games) {
    const base = `${cdn}/games/${g.id}/${g.version}`;
    const metadata = {
      name: g.name,
      description: g.description,
      tags: g.tags,
      controls: g.controls,
      avgRoundSeconds: g.avgRoundSeconds,
    };
    const versionData = {
      bundleUrl: `${base}/index.html`,
      thumbnailUrl: `${base}/${g.thumbnailFile}`,
      sizeBytes: g.sizeBytes,
      sdkVersion: g.sdkVersion,
      minAppVersion: g.minAppVersion,
      maxScorePerSec: g.maxScorePerSec,
    };
    await prisma.$transaction(async (tx) => {
      await tx.game.upsert({
        where: { id: g.id },
        create: { id: g.id, ...metadata },
        update: metadata,
      });
      const version = await tx.gameVersion.upsert({
        where: { gameId_version: { gameId: g.id, version: g.version } },
        create: { gameId: g.id, version: g.version, ...versionData },
        update: versionData,
      });
      await tx.game.update({
        where: { id: g.id },
        data: { currentVersionId: version.id, status: 'PUBLISHED' },
      });
    });
  }
  if (exclusive) {
    await prisma.game.updateMany({
      where: { id: { notIn: games.map((g) => g.id) }, status: 'PUBLISHED' },
      data: { status: 'DISABLED' },
    });
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const cdnBaseUrl = process.env.CDN_BASE_URL;
  if (!databaseUrl || !cdnBaseUrl) throw new Error('DATABASE_URL and CDN_BASE_URL are required');
  const gamesDir = process.env.LOCAL_GAMES_DIR;

  const games = gamesDir ? loadCatalog(gamesDir) : DEFAULT_GAMES;
  const prisma = new PrismaClient({ adapter: createDbAdapter(databaseUrl) });
  try {
    await seed(prisma, cdnBaseUrl, games, { exclusive: !!gamesDir });
    const source = gamesDir ? ` from ${gamesDir}` : '';
    console.log(`Seeded ${games.length} games${source}: ${games.map((g) => g.id).join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
