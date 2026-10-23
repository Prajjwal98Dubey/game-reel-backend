import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { loadCatalog, seed } from '../prisma/seed';
import { createApp } from '../src/app.factory';
import { loadConfig } from '../src/config/env';
import { FeedResponseSchema, GuestResponseSchema, ListGamesResponseSchema } from '../src/shared';
import { startTestDatabase, TestDatabase } from './support/database';

/** Local development: the API serves the frontend's built games and points manifests at them. */
describe('Local games CDN (e2e)', () => {
  const LOCAL_CDN = 'http://localhost:3000/cdn';
  let gamesDir: string;
  let db: TestDatabase;
  let app: NestFastifyApplication;
  let http: ReturnType<typeof request>;
  let auth: string;

  beforeAll(async () => {
    // The layout the frontend's `npm run games:build` produces.
    gamesDir = mkdtempSync(join(tmpdir(), 'games-dist-'));
    mkdirSync(join(gamesDir, 'bullseye', '1.0.0'), { recursive: true });
    writeFileSync(
      join(gamesDir, 'bullseye', '1.0.0', 'index.html'),
      '<!doctype html><canvas></canvas>',
    );
    writeFileSync(
      join(gamesDir, 'bullseye', '1.0.0', 'thumb.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    writeFileSync(
      join(gamesDir, 'catalog.json'),
      JSON.stringify([
        {
          id: 'bullseye',
          name: 'Bullseye',
          version: '1.0.0',
          description: 'Stop the needle inside the zone.',
          tags: ['timing'],
          controls: ['tap'],
          avgRoundSeconds: 15,
          minAppVersion: '1.0.0',
          sdkVersion: 1,
          maxScorePerSec: 4,
          theme: { top: '#000', bottom: '#111', accent: '#222' },
        },
      ]),
    );

    db = await startTestDatabase();
    // Default games first, so the catalog seed has stale games to disable.
    await seed(db.prisma, 'https://cdn.gamereels.app');
    await seed(db.prisma, LOCAL_CDN, loadCatalog(gamesDir), { exclusive: true });

    app = await createApp(
      loadConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: db.url,
        JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123',
        CURSOR_SECRET: 'test-cursor-secret-0123456789abcdef01',
        CDN_BASE_URL: LOCAL_CDN,
        CORS_ORIGINS: '*',
        LOCAL_GAMES_DIR: gamesDir,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    http = request(app.getHttpServer());

    const guest = await http.post('/v1/players/guest').send({ deviceId: 'local-cdn-device-01' });
    auth = `Bearer ${GuestResponseSchema.parse(guest.body).token}`;
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    rmSync(gamesDir, { recursive: true, force: true });
  });

  it('publishes exactly the catalog games, with their thumbnails', async () => {
    const res = await http.get('/v1/games').set('Authorization', auth).expect(200);
    const body = ListGamesResponseSchema.parse(res.body);
    expect(body.items.map((g) => g.id)).toEqual(['bullseye']);
    expect(body.items[0].thumbnailUrl).toMatch(/\/cdn\/games\/bullseye\/1\.0\.0\/thumb\.svg$/);
  });

  it('points bundle URLs at the host the request came in on', async () => {
    const games = await http
      .get('/v1/games')
      .set('Authorization', auth)
      .set('Host', '192.168.1.50:3000')
      .expect(200);
    expect(games.body.items[0].bundleUrl).toBe(
      'http://192.168.1.50:3000/cdn/games/bullseye/1.0.0/index.html',
    );

    const feed = await http
      .get('/v1/feed?limit=2')
      .set('Authorization', auth)
      .set('Host', '10.0.2.2:3000')
      .expect(200);
    for (const item of FeedResponseSchema.parse(feed.body).items) {
      expect(item.game.bundleUrl).toBe('http://10.0.2.2:3000/cdn/games/bullseye/1.0.0/index.html');
    }
  });

  it('serves the game files without auth', async () => {
    const res = await http.get('/cdn/games/bullseye/1.0.0/index.html').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<canvas>');
    await http.get('/cdn/games/bullseye/1.0.0/thumb.svg').expect(200);
    await http.get('/cdn/games/nope/1.0.0/index.html').expect(404);
  });

  it('allows browser requests from the Expo web dev server', async () => {
    const res = await http
      .options('/v1/feed')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-app-version')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });
});
