import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { map, Observable } from 'rxjs';
import { APP_CONFIG, AppConfig } from '../../config/env';

/**
 * Local development stands in for the CDN: LOCAL_GAMES_DIR is served under this path, and
 * CDN_BASE_URL is `http://localhost:<PORT>/cdn`, so bundle URLs follow the CDN layout
 * `<CDN_BASE_URL>/games/<id>/<version>/index.html`.
 */
export const LOCAL_CDN_BASE_PATH = '/cdn';
export const LOCAL_CDN_GAMES_PREFIX = `${LOCAL_CDN_BASE_PATH}/games/`;

/**
 * Local development only. Manifests store absolute URLs under CDN_BASE_URL (localhost).
 * This rewrites them to the host the request came in on, so a phone on the LAN or the
 * Android emulator (10.0.2.2) loads bundles from this machine too.
 */
@Injectable()
export class LocalCdnUrlInterceptor implements NestInterceptor {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const from = this.config.CDN_BASE_URL;
    const to = `${request.protocol}://${request.host}${LOCAL_CDN_BASE_PATH}`;
    if (from === to) return next.handle();
    return next.handle().pipe(map((body: unknown) => rewriteUrls(body, from, to)));
  }
}

export function rewriteUrls(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') {
    return value.startsWith(`${from}/`) ? to + value.slice(from.length) : value;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteUrls(v, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteUrls(v, from, to)]));
  }
  return value;
}
