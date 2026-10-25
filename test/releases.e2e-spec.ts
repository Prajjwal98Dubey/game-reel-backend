import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { loadConfig } from '../src/config/env';
import { signEasBody } from '../src/modules/releases/eas-signature';
import { AppReleaseResponseSchema, ErrorResponseSchema } from '../src/shared';
import { startTestDatabase, TestDatabase } from './support/database';

/** EAS build webhook → AppRelease → /v1/app/latest and /v1/app/download, plus the APK copy. */
describe('App releases (e2e)', () => {
  const SECRET = 'eas-webhook-secret-0123456789abcdef0123';
  const API = 'https://api.test';
  const APK_BYTES = Buffer.from('PK\u0003\u0004 not really an apk');

  let db: TestDatabase;
  let app: NestFastifyApplication;
  let http: ReturnType<typeof request>;
  let apkDir: string;
  let easFiles: Server;
  let easBase: string;

  /** A BUILD webhook body as EAS sends it (only the fields we read, plus some we don't). */
  function build(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      accountName: 'someone',
      projectName: 'game-reels',
      status: 'finished',
      platform: 'android',
      buildDetailsPageUrl: `https://expo.dev/accounts/someone/projects/game-reels/builds/${id}`,
      metadata: {
        buildProfile: 'staging',
        appVersion: '1.0.3',
        appBuildVersion: '7',
        gitCommitHash: 'a1b2c3d',
      },
      artifacts: { buildUrl: `${easBase}/${id}.apk` },
      completedAt: '2026-10-25T16:40:00.000Z',
      ...overrides,
    };
  }

  function deliver(body: unknown, signature?: string) {
    const raw = JSON.stringify(body);
    return http
      .post('/v1/webhooks/eas')
      .set('Content-Type', 'application/json')
      .set('expo-signature', signature ?? signEasBody(raw, SECRET))
      .send(raw);
  }

  async function waitForMirror(easBuildId: string): Promise<string> {
    for (let i = 0; i < 100; i++) {
      const row = await db.prisma.appRelease.findUnique({ where: { easBuildId } });
      if (row?.mirroredFile) return row.mirroredFile;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`${easBuildId} was never mirrored`);
  }

  beforeAll(async () => {
    // Stands in for EAS's artifact storage.
    easFiles = createServer((req, res) => {
      if (req.url?.endsWith('.apk')) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(APK_BYTES);
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((r) => easFiles.listen(0, '127.0.0.1', r));
    easBase = `http://127.0.0.1:${(easFiles.address() as AddressInfo).port}/artifacts`;
    apkDir = mkdtempSync(join(tmpdir(), 'apk-'));

    db = await startTestDatabase();
    app = await createApp(
      loadConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: db.url,
        JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123',
        CURSOR_SECRET: 'test-cursor-secret-0123456789abcdef01',
        CDN_BASE_URL: 'https://cdn.test',
        EAS_WEBHOOK_SECRET: SECRET,
        PUBLIC_API_URL: API,
        APK_DIR: apkDir,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await new Promise((r) => easFiles?.close(r));
    rmSync(apkDir, { recursive: true, force: true });
  });

  it('answers 404 before any release exists', async () => {
    const latest = await http.get('/v1/app/latest').expect(404);
    expect(ErrorResponseSchema.parse(latest.body).error.code).toBe('NOT_FOUND');
    await http.get('/v1/app/download').expect(404);
  });

  it('rejects unsigned and wrongly signed calls without saving anything', async () => {
    const body = build('build-bad-sig');
    const raw = JSON.stringify(body);
    await deliver(body, 'sha1=0000').expect(401);
    await deliver(body, signEasBody(raw, 'wrong-secret-0123456789abcdef0123456')).expect(401);
    await http
      .post('/v1/webhooks/eas')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
    expect(await db.prisma.appRelease.count()).toBe(0);
  });

  it('ignores builds that are not finished Android builds of the release profile', async () => {
    const ignored = [
      build('build-ios', { platform: 'ios' }),
      build('build-errored', { status: 'errored', artifacts: null }),
      build('build-production', {
        metadata: { buildProfile: 'production', appVersion: '1.0.3', appBuildVersion: '7' },
      }),
      build('build-dev', {
        metadata: { buildProfile: 'development', appVersion: '1.0.3', appBuildVersion: '7' },
      }),
    ];
    for (const body of ignored) {
      await deliver(body).expect(200, { ignored: true });
    }
    expect(await db.prisma.appRelease.count()).toBe(0);
  });

  it('rejects a malformed body and a release build without an APK link', async () => {
    await deliver({ status: 'finished' }).expect(400);
    await deliver(build('build-no-apk', { artifacts: {} })).expect(400);
    expect(await db.prisma.appRelease.count()).toBe(0);
  });

  it('saves a release once even when EAS delivers it twice, and serves it', async () => {
    await deliver(build('build-0001')).expect(200, { saved: true, version: '1.0.3' });
    await deliver(build('build-0001')).expect(200, { saved: true, version: '1.0.3' });
    expect(await db.prisma.appRelease.count()).toBe(1);

    const res = await http.get('/v1/app/latest').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const latest = AppReleaseResponseSchema.parse(res.body);
    expect(latest).toMatchObject({
      platform: 'android',
      version: '1.0.3',
      buildNumber: '7',
      downloadUrl: `${API}/v1/app/download`,
      builtAt: '2026-10-25T16:40:00.000Z',
    });
  });

  it('copies the APK and redirects downloads to the copy', async () => {
    const file = await waitForMirror('build-0001');
    const download = await http.get('/v1/app/download').expect(302);
    expect(download.headers.location).toBe(`${API}/apk/${file}`);
    expect(download.headers['cache-control']).toBe('no-store');

    const apk = await http.get(`/apk/${file}`).responseType('blob').expect(200);
    expect(apk.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(Buffer.from(apk.body as Buffer).equals(APK_BYTES)).toBe(true);
  });

  it('serves the newest build by build time, even when it is delivered late', async () => {
    await deliver(
      build('build-0003', {
        metadata: { buildProfile: 'staging', appVersion: '1.0.5', appBuildVersion: '9' },
        completedAt: '2026-10-27T10:00:00.000Z',
      }),
    ).expect(200);
    await deliver(
      build('build-0002', {
        metadata: { buildProfile: 'staging', appVersion: '1.0.4', appBuildVersion: '8' },
        completedAt: '2026-10-26T10:00:00.000Z',
      }),
    ).expect(200);
    const res = await http.get('/v1/app/latest').expect(200);
    expect(res.body).toMatchObject({ version: '1.0.5', buildNumber: '9' });
  });

  it('falls back to the previous build when the latest is withdrawn', async () => {
    await db.prisma.appRelease.update({
      where: { easBuildId: 'build-0003' },
      data: { withdrawn: true },
    });
    const res = await http.get('/v1/app/latest').expect(200);
    expect(res.body).toMatchObject({ version: '1.0.4', buildNumber: '8' });

    const file = await waitForMirror('build-0002');
    const download = await http.get('/v1/app/download').expect(302);
    expect(download.headers.location).toBe(`${API}/apk/${file}`);
  });
});
