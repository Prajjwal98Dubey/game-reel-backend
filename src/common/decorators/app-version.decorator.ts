import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { valid } from 'semver';
import { AppException } from '../errors/app.exception';

export const APP_VERSION_HEADER = 'x-app-version';

/**
 * The app build's version from `X-App-Version`, used to hide games it cannot run.
 * Returns null when the header is absent (web tools, docs), which disables that filter.
 */
export const AppVersion = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const raw = ctx.switchToHttp().getRequest<FastifyRequest>().headers[APP_VERSION_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    const version = valid(value.trim());
    if (!version) throw AppException.invalidAppVersion(value);
    return version;
  },
);
