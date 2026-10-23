import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { seed } from '../prisma/seed';
import { createApp } from '../src/app.factory';
import { AppConfig, loadConfig } from '../src/config/env';
import {
  ErrorResponseSchema,
  FeedResponseSchema,
  GameManifestSchema,
  GuestResponseSchema,
  ListGamesResponseSchema,
  SubmitPlayResponseSchema,
} from '../src/shared';
import { startTestDatabase, TestDatabase } from './support/database';

/** Create guest → browse → fetch feed → submit plays → bests update, plus error contracts. */
describe('Game Reels API (e2e)', () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;
  let http: ReturnType<typeof request>;

  const CDN = 'https://cdn.test';
  const GAME_IDS = ['bullseye', 'catch', 'hop', 'pop', 'stack'];

  async function guest(deviceId: string): Promise<{ playerId: string; auth: string }> {
    const res = await http.post('/v1/players/guest').send({ deviceId }).expect(200);
    const body = GuestResponseSchema.parse(res.body);
    return { playerId: body.playerId, auth: `Bearer ${body.token}` };
  }

  function expectError(body: unknown, code: string) {
    const parsed = ErrorResponseSchema.parse(body);
    expect(parsed.error.code).toBe(code);
    expect(parsed.error.requestId).toBeTruthy();
    return parsed.error;
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    await seed(db.prisma, CDN);
    const config: AppConfig = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: db.url,
      JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123',
      CURSOR_SECRET: 'test-cursor-secret-0123456789abcdef01',
      CDN_BASE_URL: CDN,
    });
    app = await createApp(config);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
  });

  describe('health', () => {
    it('reports liveness and readiness without auth', async () => {
      await http.get('/health').expect(200, { status: 'ok' });
      await http.get('/health/ready').expect(200, { status: 'ok', database: 'up' });
    });
  });

  describe('players', () => {
    it('creates a guest and resumes it for the same device', async () => {
      const first = await guest('device-aaaa-0001');
      const again = await guest('device-aaaa-0001');
      const other = await guest('device-bbbb-0002');
      expect(again.playerId).toBe(first.playerId);
      expect(other.playerId).not.toBe(first.playerId);
    });

    it('validates the request body', async () => {
      const res = await http.post('/v1/players/guest').send({ deviceId: 'x' }).expect(400);
      const error = expectError(res.body, 'VALIDATION_FAILED');
      expect(error.details).toEqual([expect.objectContaining({ path: 'deviceId' })]);
    });
  });

  describe('auth', () => {
    it('rejects requests without a valid token', async () => {
      expectError((await http.get('/v1/feed').expect(401)).body, 'UNAUTHORIZED');
      expectError(
        (await http.get('/v1/feed').set('Authorization', 'Bearer not-a-jwt').expect(401)).body,
        'UNAUTHORIZED',
      );
    });
  });

  describe('catalogue', () => {
    let auth: string;
    beforeAll(async () => ({ auth } = await guest('device-catalogue-01')));

    it('lists every published game sorted by name, with no best yet', async () => {
      const res = await http.get('/v1/games').set('Authorization', auth).expect(200);
      const body = ListGamesResponseSchema.parse(res.body);
      expect(body.items.map((g) => g.name)).toEqual(['Bullseye', 'Catch', 'Hop', 'Pop', 'Stack']);
      expect(body.items.every((g) => g.best === null)).toBe(true);
      expect(body.nextCursor).toBeNull();
      expect(body.items.find((g) => g.id === 'stack')).toMatchObject({
        version: '1.0.0',
        bundleUrl: `${CDN}/games/stack/1.0.0/index.html`,
        thumbnailUrl: `${CDN}/games/stack/1.0.0/thumb.webp`,
        controls: ['tap'],
      });
    });

    it('filters by tag', async () => {
      const res = await http.get('/v1/games?tag=timing').set('Authorization', auth).expect(200);
      expect(res.body.items.map((g: { id: string }) => g.id)).toEqual(['bullseye', 'stack']);
    });

    it('paginates with an opaque cursor', async () => {
      const seen: string[] = [];
      let cursor: string | null = '';
      while (cursor !== null) {
        const res = await http
          .get(`/v1/games?limit=2&cursor=${cursor}`)
          .set('Authorization', auth)
          .expect(200);
        const body = ListGamesResponseSchema.parse(res.body);
        seen.push(...body.items.map((g) => g.id));
        cursor = body.nextCursor;
      }
      expect(seen).toEqual(['bullseye', 'catch', 'hop', 'pop', 'stack']);
    });

    it('rejects a bad cursor and a bad limit', async () => {
      expectError(
        (await http.get('/v1/games?cursor=nope').set('Authorization', auth).expect(400)).body,
        'INVALID_CURSOR',
      );
      expectError(
        (await http.get('/v1/games?limit=0').set('Authorization', auth).expect(400)).body,
        'VALIDATION_FAILED',
      );
    });

    it('returns one manifest, or GAME_NOT_FOUND', async () => {
      const res = await http.get('/v1/games/hop').set('Authorization', auth).expect(200);
      expect(GameManifestSchema.parse(res.body).name).toBe('Hop');

      const missing = await http.get('/v1/games/stak').set('Authorization', auth).expect(404);
      expect(expectError(missing.body, 'GAME_NOT_FOUND').message).toBe(
        "No published game with id 'stak'.",
      );
    });

    it('hides games the app version cannot run', async () => {
      await db.prisma.gameVersion.updateMany({
        where: { gameId: 'pop' },
        data: { minAppVersion: '2.0.0' },
      });
      try {
        const ids = async (version?: string) => {
          const req = http.get('/v1/games').set('Authorization', auth);
          if (version) void req.set('X-App-Version', version);
          return (await req.expect(200)).body.items.map((g: { id: string }) => g.id);
        };
        expect(await ids('1.5.0')).not.toContain('pop');
        expect(await ids('2.0.0')).toContain('pop');
        expect(await ids()).toContain('pop');

        const bad = await http
          .get('/v1/games')
          .set('Authorization', auth)
          .set('X-App-Version', 'v-one');
        expectError(bad.body, 'INVALID_APP_VERSION');
      } finally {
        await db.prisma.gameVersion.updateMany({
          where: { gameId: 'pop' },
          data: { minAppVersion: '1.0.0' },
        });
      }
    });

    it('does not list draft or disabled games', async () => {
      await db.prisma.game.update({ where: { id: 'hop' }, data: { status: 'DISABLED' } });
      try {
        const res = await http.get('/v1/games').set('Authorization', auth).expect(200);
        expect(res.body.items.map((g: { id: string }) => g.id)).not.toContain('hop');
        await http.get('/v1/games/hop').set('Authorization', auth).expect(404);
      } finally {
        await db.prisma.game.update({ where: { id: 'hop' }, data: { status: 'PUBLISHED' } });
      }
    });
  });

  describe('feed', () => {
    let auth: string;
    beforeAll(async () => ({ auth } = await guest('device-feed-0001')));

    async function page(cursor?: string, limit = 7) {
      const res = await http
        .get(`/v1/feed?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`)
        .set('Authorization', auth)
        .expect(200);
      return FeedResponseSchema.parse(res.body);
    }

    it('serves an endless feed with no game twice in a row, across pages', async () => {
      const ids: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 4; i++) {
        const body = await page(cursor);
        expect(body.items).toHaveLength(7);
        expect(body.items.every((item) => item.kind === 'game')).toBe(true);
        ids.push(...body.items.map((item) => item.game.id));
        cursor = body.nextCursor;
      }
      expect(new Set(ids)).toEqual(new Set(GAME_IDS));
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    });

    it('returns the same page for the same cursor', async () => {
      const first = await page();
      const a = await page(first.nextCursor);
      const b = await page(first.nextCursor);
      expect(b).toEqual(a);
    });

    it('rejects a tampered cursor', async () => {
      const { nextCursor } = await page();
      const [payload, signature] = nextCursor.split('.');
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...decoded, offset: 0 })).toString('base64url');
      const res = await http
        .get(`/v1/feed?cursor=${forged}.${signature}`)
        .set('Authorization', auth)
        .expect(400);
      expectError(res.body, 'INVALID_CURSOR');
    });
  });

  describe('plays', () => {
    let auth: string;
    let playerId: string;
    beforeAll(async () => ({ auth, playerId } = await guest('device-plays-0001')));

    const submit = (body: object) => http.post('/v1/plays').set('Authorization', auth).send(body);

    it('records a first play as a new best and shows it in the catalogue and feed', async () => {
      const res = await submit({
        gameId: 'stack',
        gameVersion: '1.0.0',
        score: 42,
        durationMs: 31_800,
        seed: 918273,
      }).expect(200);
      expect(SubmitPlayResponseSchema.parse(res.body)).toEqual({ best: 42, isNewBest: true });

      const manifest = await http.get('/v1/games/stack').set('Authorization', auth).expect(200);
      expect(manifest.body.best).toBe(42);

      const feed = FeedResponseSchema.parse(
        (await http.get('/v1/feed?limit=10').set('Authorization', auth).expect(200)).body,
      );
      for (const item of feed.items) {
        expect(item.game.best).toBe(item.game.id === 'stack' ? 42 : null);
      }
    });

    it('rate-limits repeated submissions for the same game', async () => {
      const res = await submit({
        gameId: 'stack',
        gameVersion: '1.0.0',
        score: 50,
        durationMs: 30_000,
      }).expect(429);
      expectError(res.body, 'RATE_LIMITED');
    });

    it('keeps the higher best when a later round scores lower', async () => {
      await submit({ gameId: 'catch', gameVersion: '1.0.0', score: 30, durationMs: 40_000 }).expect(
        200,
      );
      await new Promise((r) => setTimeout(r, 3_100));
      const res = await submit({
        gameId: 'catch',
        gameVersion: '1.0.0',
        score: 12,
        durationMs: 40_000,
      }).expect(200);
      expect(res.body).toEqual({ best: 30, isNewBest: false });
    });

    it('stores implausible plays as flagged without updating the best', async () => {
      const res = await submit({
        gameId: 'hop',
        gameVersion: '1.0.0',
        score: 5_000,
        durationMs: 10_000,
      }).expect(200);
      expect(res.body).toEqual({ best: 0, isNewBest: false });

      const unknownVersion = await submit({
        gameId: 'pop',
        gameVersion: '9.9.9',
        score: 3,
        durationMs: 10_000,
      }).expect(200);
      expect(unknownVersion.body).toEqual({ best: 0, isNewBest: false });

      const flagged = await db.prisma.play.findMany({ where: { playerId, flagged: true } });
      expect(flagged.map((p) => p.gameId).sort()).toEqual(['hop', 'pop']);
      expect(
        await db.prisma.bestScore.count({ where: { playerId, gameId: { in: ['hop', 'pop'] } } }),
      ).toBe(0);
    });

    it('rejects unknown games and invalid bodies', async () => {
      expectError(
        (
          await submit({
            gameId: 'nope',
            gameVersion: '1.0.0',
            score: 1,
            durationMs: 5_000,
          }).expect(404)
        ).body,
        'GAME_NOT_FOUND',
      );
      const invalid = await submit({ gameId: 'bullseye', gameVersion: '1', score: -1 }).expect(400);
      const details = expectError(invalid.body, 'VALIDATION_FAILED').details ?? [];
      expect(details.map((d) => d.path).sort()).toEqual(['durationMs', 'gameVersion', 'score']);
    });
  });

  describe('events', () => {
    let auth: string;
    let playerId: string;
    beforeAll(async () => ({ auth, playerId } = await guest('device-events-01')));

    it('stores a batch and answers 202', async () => {
      await http
        .post('/v1/events')
        .set('Authorization', auth)
        .send({
          events: [
            {
              type: 'game_view',
              gameId: 'hop',
              clientTs: '2026-10-22T10:15:03.120Z',
              props: { source: 'reels', position: 3 },
            },
            {
              type: 'game_skip',
              gameId: 'hop',
              clientTs: '2026-10-22T10:15:04.020Z',
              props: { dwellMs: 900 },
            },
            { type: 'tab_view', clientTs: '2026-10-22T10:15:05.000Z', props: { tab: 'catalogue' } },
          ],
        })
        .expect(202);

      const rows = await db.prisma.event.findMany({ where: { playerId }, orderBy: { id: 'asc' } });
      expect(rows.map((r) => [r.type, r.gameId])).toEqual([
        ['game_view', 'hop'],
        ['game_skip', 'hop'],
        ['tab_view', null],
      ]);
      expect(rows[0].props).toEqual({ source: 'reels', position: 3 });
      expect(rows[0].clientTs.toISOString()).toBe('2026-10-22T10:15:03.120Z');
    });

    it('rejects unknown event types and oversized batches', async () => {
      const event = { type: 'game_like', gameId: 'pop', clientTs: '2026-10-22T10:15:03.120Z' };
      const unknown = await http
        .post('/v1/events')
        .set('Authorization', auth)
        .send({ events: [{ ...event, type: 'game_teleport' }] })
        .expect(400);
      expectError(unknown.body, 'VALIDATION_FAILED');
      await http
        .post('/v1/events')
        .set('Authorization', auth)
        .send({ events: Array(101).fill(event) })
        .expect(400);
    });
  });

  describe('error contract', () => {
    it('uses the standard shape for unknown routes and malformed JSON', async () => {
      expectError((await http.get('/v1/nope').expect(404)).body, 'NOT_FOUND');
      const malformed = await http
        .post('/v1/players/guest')
        .set('Content-Type', 'application/json')
        .send('{"deviceId":')
        .expect(400);
      expectError(malformed.body, 'BAD_REQUEST');
    });

    it('echoes the request id in the header and the error body', async () => {
      const res = await http.get('/v1/feed').set('X-Request-ID', 'req-12345').expect(401);
      expect(res.headers['x-request-id']).toBe('req-12345');
      expect(res.body.error.requestId).toBe('req-12345');
    });
  });

  describe('docs', () => {
    it('serves the OpenAPI document', async () => {
      const res = await http.get('/docs-json').expect(200);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/v1/players/guest',
          '/v1/games',
          '/v1/games/{id}',
          '/v1/feed',
          '/v1/plays',
          '/v1/events',
          '/health',
        ]),
      );
    });
  });
});
