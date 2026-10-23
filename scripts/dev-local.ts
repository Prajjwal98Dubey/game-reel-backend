/**
 * Runs the API locally against an embedded Postgres: no Docker, no database install.
 *
 *   npm run dev:local
 *
 * Starts Postgres from npm-shipped binaries, applies migrations, seeds the games and
 * starts the API in watch mode. Data persists in `.local-db/` (delete it to start fresh).
 * Ctrl+C stops both the API and Postgres. Not for production.
 *
 * When the frontend sits next to this folder (`../frontend`), its games are built and
 * served by the API at /cdn/games/, so the local app can play them (see LOCAL_GAMES_DIR).
 */
import 'dotenv/config';
import type EmbeddedPostgres from 'embedded-postgres' with { 'resolution-mode': 'import' };
import { ChildProcess, execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const DATA_DIR = join(ROOT, '.local-db');
const FRONTEND_DIR = resolve(ROOT, '../frontend');
const API_PORT = Number(process.env.PORT ?? 3000);
const DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);
const DB_NAME = 'gamereels';
const DB_USER = 'gamereels';
const DB_PASSWORD = 'gamereels';
const VERBOSE = process.env.LOCAL_DB_VERBOSE === '1';

// Values from .env are kept, except DATABASE_URL, which must point at the embedded database.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}`,
  JWT_SECRET: process.env.JWT_SECRET || 'local-dev-jwt-secret-not-for-production-use',
  CURSOR_SECRET: process.env.CURSOR_SECRET || 'local-dev-cursor-secret-not-for-production',
  CDN_BASE_URL: process.env.CDN_BASE_URL || 'https://cdn.gamereels.app',
  // Expo web runs on another origin (e.g. :8081), and phones use the machine's LAN address.
  CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
};

const log = (message: string) => console.log(`[dev:local] ${message}`);
const quietOrVerbose = (message: unknown) => {
  if (VERBOSE) console.log('[postgres]', message);
};

// embedded-postgres is ESM-only, so it is loaded with import() from this CommonJS script.
let pg: EmbeddedPostgres | undefined;
let api: ChildProcess | undefined;
let stopping = false;

async function shutdown(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (api && api.exitCode === null) api.kill();
  log('stopping Postgres…');
  await pg?.stop().catch(() => undefined);
  process.exit(code);
}

function run(command: string): void {
  execSync(command, { cwd: ROOT, env, stdio: 'inherit' });
}

const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

/**
 * PIDs of postgres processes running from this project's own embedded-postgres binaries.
 * Matching on the binary path means nothing else on the machine can ever be selected.
 */
function embeddedPostgresPids(): number[] {
  const binDir = normalizePath(join(ROOT, 'node_modules', '@embedded-postgres'));
  try {
    const listing =
      process.platform === 'win32'
        ? execFileSync(
            'powershell',
            [
              '-NoProfile',
              '-Command',
              `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }`,
            ],
            { encoding: 'utf8' },
          )
        : execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
    return listing
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m && normalizePath(m[2]).includes(binDir))
      .map((m) => Number(m[1]))
      .filter((pid) => pid !== process.pid);
  } catch {
    return [];
  }
}

/**
 * A run that was killed instead of stopped with Ctrl+C can leave Postgres (or, on Windows,
 * orphaned worker processes still holding the port) running, which blocks the next start.
 * Postgres recovers from this on the next start like from a crash.
 */
async function stopLeftoverPostgres(): Promise<void> {
  let pids = embeddedPostgresPids();
  if (pids.length === 0) return;
  log(`stopping ${pids.length} Postgres process(es) left running by a previous run…`);
  for (const signal of ['SIGINT', 'SIGKILL'] as const) {
    for (const pid of pids) {
      try {
        process.kill(pid, signal);
      } catch {
        // already gone
      }
    }
    for (let i = 0; i < 25 && pids.length > 0; i++) {
      await sleep(200);
      pids = embeddedPostgresPids();
    }
    if (pids.length === 0) return;
  }
}

async function startDatabase(): Promise<void> {
  const { default: Postgres } = await import('embedded-postgres');
  const db = (pg = new Postgres({
    databaseDir: DATA_DIR,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    persistent: true,
    onLog: quietOrVerbose,
    onError: quietOrVerbose,
  }));

  await stopLeftoverPostgres();
  if (!existsSync(join(DATA_DIR, 'PG_VERSION'))) {
    log(`creating a new database cluster in ${DATA_DIR} (first run only)…`);
    await db.initialise();
  }
  log(`starting Postgres on port ${DB_PORT}…`);
  try {
    await db.start();
  } catch (error) {
    throw new Error(
      `Postgres did not start. Another process may be using port ${DB_PORT} (set LOCAL_DB_PORT), ` +
        `or delete .local-db/postmaster.pid if no Postgres is running.\n${String(error)}`,
    );
  }
  try {
    await db.createDatabase(DB_NAME);
  } catch (error) {
    if (!String(error).includes('already exists')) throw error;
  }
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
