/**
 * Publishes a built game bundle: size check → upload to object storage → register the version.
 *
 *   npm run publish-game -- <gameDir> [--promote] [--dry-run]
 *
 * <gameDir> contains `game.json` and the built bundle in `dist/` (index.html + thumb.webp).
 * --promote  makes this version the game's current version and publishes the game.
 * --dry-run  validates and reports sizes without uploading or writing to the database.
 */
import 'dotenv/config';
import { lookup } from 'mime-types';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { S3StorageProvider } from '../src/common/storage/storage.provider';
import { PrismaClient } from '../src/generated/prisma/client';
import { createDbAdapter } from '../src/prisma/create-adapter';
import { GameControlSchema, GameIdSchema, SemverSchema } from '../src/shared';

const SIZE_LIMIT_BYTES = 500 * 1024;
const SIZE_TARGET_BYTES = 300 * 1024;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const THUMBNAIL = 'thumb.webp';

const GameJsonSchema = z.object({
  id: GameIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  controls: z.array(GameControlSchema).min(1),
  version: SemverSchema,
  avgRoundSeconds: z.int().positive(),
  maxScorePerSec: z.number().positive(),
  sdkVersion: z.int().positive().default(1),
  minAppVersion: SemverSchema.default('1.0.0'),
});

const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  CDN_BASE_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
});

const StorageEnvSchema = z.object({
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
});

interface BundleFile {
  path: string; // relative, forward slashes
  body: Buffer;
  gzippedBytes: number;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function readBundle(distDir: string): BundleFile[] {
  return listFiles(distDir).map((full) => {
    const body = readFileSync(full);
    return {
      path: relative(distDir, full).split(sep).join('/'),
      body,
      gzippedBytes: gzipSync(body, { level: 9 }).length,
    };
  });
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const gameDir = args.find((a) => !a.startsWith('--'));
  const promote = args.includes('--promote');
  const dryRun = args.includes('--dry-run');
  if (!gameDir) throw new Error('Usage: publish-game <gameDir> [--promote] [--dry-run]');

  const root = resolve(gameDir);
  const game = GameJsonSchema.parse(JSON.parse(readFileSync(join(root, 'game.json'), 'utf8')));
  const distDir = join(root, 'dist');
  for (const required of ['index.html', THUMBNAIL]) {
    if (!existsSync(join(distDir, required)))
      throw new Error(`Missing dist/${required} in ${root}`);
  }

  const files = readBundle(distDir);
  const totalGzipped = files.reduce((sum, f) => sum + f.gzippedBytes, 0);
  console.log(`${game.id}@${game.version}: ${files.length} files, ${kb(totalGzipped)} gzipped`);
  if (totalGzipped > SIZE_LIMIT_BYTES) {
    throw new Error(`Bundle is ${kb(totalGzipped)} gzipped; the limit is ${kb(SIZE_LIMIT_BYTES)}.`);
  }
  if (totalGzipped > SIZE_TARGET_BYTES) {
    console.warn(`Warning: over the ${kb(SIZE_TARGET_BYTES)} target.`);
  }
  if (dryRun) {
    console.log('Dry run: nothing uploaded or registered.');
    return;
  }

  const env = EnvSchema.parse(process.env);
  const storageEnv = StorageEnvSchema.parse(process.env);
  const storage = new S3StorageProvider({
    bucket: storageEnv.STORAGE_BUCKET,
    endpoint: storageEnv.STORAGE_ENDPOINT,
    accessKeyId: storageEnv.STORAGE_ACCESS_KEY,
    secretAccessKey: storageEnv.STORAGE_SECRET_KEY,
  });
  const prisma = new PrismaClient({
    adapter: createDbAdapter(env.DATABASE_URL),
  });

  try {
    const existing = await prisma.gameVersion.findUnique({
      where: { gameId_version: { gameId: game.id, version: game.version } },
    });
    if (existing) {
      throw new Error(
        `${game.id}@${game.version} is already registered. Versions are immutable; bump the version.`,
      );
    }

    const prefix = `games/${game.id}/${game.version}`;
    for (const file of files) {
      await storage.put(`${prefix}/${file.path}`, file.body, {
        contentType: lookup(file.path) || 'application/octet-stream',
        cacheControl: IMMUTABLE,
      });
      console.log(`  uploaded ${prefix}/${file.path}`);
    }

    const base = `${env.CDN_BASE_URL}/${prefix}`;
    const metadata = {
      name: game.name,
      description: game.description,
      tags: game.tags,
      controls: game.controls,
      avgRoundSeconds: game.avgRoundSeconds,
    };
    await prisma.$transaction(async (tx) => {
      // Metadata of an already-live game changes only when its new version is promoted.
      await tx.game.upsert({
        where: { id: game.id },
        create: { id: game.id, ...metadata },
        update: promote ? metadata : {},
      });
      const version = await tx.gameVersion.create({
        data: {
          gameId: game.id,
          version: game.version,
          bundleUrl: `${base}/index.html`,
          thumbnailUrl: `${base}/${THUMBNAIL}`,
          sizeBytes: totalGzipped,
          sdkVersion: game.sdkVersion,
          minAppVersion: game.minAppVersion,
          maxScorePerSec: game.maxScorePerSec,
        },
      });
      if (promote) {
        await tx.game.update({
          where: { id: game.id },
          data: { currentVersionId: version.id, status: 'PUBLISHED' },
        });
      }
    });
    console.log(
      promote
        ? `Registered and promoted ${game.id}@${game.version}.`
        : `Registered ${game.id}@${game.version}. Promote with: npm run set-game-version -- ${game.id} ${game.version}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
