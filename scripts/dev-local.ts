/**
 * Runs the API locally against a throwaway MySQL: no Docker, no database install.
 *
 *   npm run dev:local
 *
 * Starts MySQL 8.4 (downloaded once from MySQL's CDN by mysql-memory-server, then cached),
 * applies migrations, seeds the games and starts the API in watch mode. The database is
 * fresh on every run; the app signs in again by itself when its old player is gone.
 * Ctrl+C stops both the API and MySQL. Not for production.
 *
 * When the frontend sits next to this folder (`../frontend`), its games are built and
 * served by the API at /cdn/games/, so the local app can play them (see LOCAL_GAMES_DIR).
 */
import 'dotenv/config';
import { createDB } from 'mysql-memory-server';
import { ChildProcess, execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const FRONTEND_DIR = resolve(ROOT, '../frontend');
const API_PORT = Number(process.env.PORT ?? 3000);
/** 0 picks a free port, so a leftover MySQL from a killed run never blocks the next one. */
const DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 0);
const DB_NAME = 'gamereels';
const MYSQL_VERSION = '8.4.x';

// Values from .env are kept, except DATABASE_URL, which must point at the local database.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'local-dev-jwt-secret-not-for-production-use',
  CURSOR_SECRET: process.env.CURSOR_SECRET || 'local-dev-cursor-secret-not-for-production',
  CDN_BASE_URL: process.env.CDN_BASE_URL || 'https://cdn.gamereels.app',
  // Expo web runs on another origin (e.g. :8081), and phones use the machine's LAN address.
  CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
};

const log = (message: string) => console.log(`[dev:local] ${message}`);

let db: Awaited<ReturnType<typeof createDB>> | undefined;
let api: ChildProcess | undefined;
let stopping = false;

async function shutdown(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (api && api.exitCode === null) api.kill();
  log('stopping MySQL…');
  await db?.stop().catch(() => undefined);
  process.exit(code);
}

function run(command: string): void {
  execSync(command, { cwd: ROOT, env, stdio: 'inherit' });
}

async function startDatabase(): Promise<void> {
  log(`starting MySQL ${MYSQL_VERSION} (the first run downloads it, which takes a while)…`);
  db = await createDB({
    version: MYSQL_VERSION,
    dbName: DB_NAME,
    port: DB_PORT,
    downloadBinaryOnce: true,
    logLevel: process.env.LOCAL_DB_VERBOSE === '1' ? 'LOG' : 'ERROR',
  });
  env.DATABASE_URL = `mysql://${db.username}@127.0.0.1:${db.port}/${db.dbName}`;
  log(`MySQL ${db.mysql.version} is up on port ${db.port}`);
}

/**
 * Finds the built games to serve: LOCAL_GAMES_DIR if set, otherwise the frontend's
 * games/dist, rebuilt first (as the frontend's mock API does). Null if none are available.
 */
function prepareGames(): string | null {
  if (process.env.LOCAL_GAMES_DIR) return resolve(process.env.LOCAL_GAMES_DIR);
  const buildScript = join(FRONTEND_DIR, 'scripts', 'build-games.mjs');
  const distDir = join(FRONTEND_DIR, 'games', 'dist');
  if (existsSync(buildScript)) {
    log('building the frontend games…');
    try {
      execFileSync(process.execPath, [buildScript], { cwd: FRONTEND_DIR, stdio: 'inherit' });
    } catch {
      log('warning: building the games failed; using the last build if there is one.');
    }
  }
  return existsSync(join(distDir, 'catalog.json')) ? distDir : null;
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}

async function main(): Promise<void> {
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));

  const gamesDir = prepareGames();
  if (gamesDir) {
    env.LOCAL_GAMES_DIR = gamesDir;
    env.CDN_BASE_URL = `http://localhost:${API_PORT}/cdn`;
    log(`serving games from ${gamesDir} at /cdn/games/`);
  } else {
    log(
      'warning: no built games found (../frontend/games/dist). The app can list games but not ' +
        'play them. Run "npm run games:build" in frontend/ or set LOCAL_GAMES_DIR.',
    );
  }

  await startDatabase();
  log('applying migrations…');
  run('npx prisma migrate deploy');
  log('seeding games…');
  run('npx prisma db seed');

  log(`starting the API → http://localhost:${API_PORT} (docs at /docs)`);
  const lan = lanAddresses().map((ip) => `http://${ip}:${API_PORT}`);
  if (lan.length) log(`on your network (phones): ${lan.join(', ')}`);
  api = spawn('npx nest start --watch', { cwd: ROOT, env, stdio: 'inherit', shell: true });
  api.on('exit', (code) => void shutdown(code ?? 0));
}

main().catch(async (error) => {
  console.error(`[dev:local] ${error instanceof Error ? error.message : String(error)}`);
  await shutdown(1);
});
