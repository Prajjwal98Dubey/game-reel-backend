import fastifyStatic from '@fastify/static';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { LOCAL_CDN_GAMES_PREFIX } from './common/local-cdn/local-cdn';
import { AppConfig } from './config/env';
import { APK_PATH_PREFIX } from './modules/releases/apk-mirror';

const REQUEST_ID_HEADER = 'x-request-id';

/** Honors a sane incoming X-Request-ID (from a proxy) or generates one. */
function genReqId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  return typeof incoming === 'string' && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
}

/** Builds the fully configured app. Shared by main.ts and the e2e tests. */
export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ genReqId, trustProxy: true, bodyLimit: 256 * 1024 });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config), adapter, {
    bufferLogs: true,
    // The EAS webhook signature is checked against the body bytes exactly as received.
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
  if (config.CORS_ORIGINS.length > 0) {
    app.enableCors({ origin: config.CORS_ORIGINS.includes('*') ? true : config.CORS_ORIGINS });
  }

  // No separate CDN: serve built game bundles from this API (see LOCAL_GAMES_DIR).
  if (config.LOCAL_GAMES_DIR) {
    await app.register(fastifyStatic, {
      root: config.LOCAL_GAMES_DIR,
      prefix: LOCAL_CDN_GAMES_PREFIX,
      decorateReply: false,
    });
  }

  // Release APKs copied from EAS (see APK_DIR). File names are unique per build.
  if (config.APK_DIR) {
    mkdirSync(config.APK_DIR, { recursive: true });
    await app.register(fastifyStatic, {
      root: config.APK_DIR,
      prefix: APK_PATH_PREFIX,
      decorateReply: false,
      maxAge: '365d',
      immutable: true,
    });
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (request, reply) => {
      void reply.header(REQUEST_ID_HEADER, request.id);
    });

  const openApi = new DocumentBuilder()
    .setTitle('Game Reels API')
    .setDescription('Catalogue, Reels feed, plays and events for the Game Reels app.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(SwaggerModule.createDocument(app, openApi)));

  return app;
}
