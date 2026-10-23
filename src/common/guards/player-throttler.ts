import { ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

const THROTTLE_BY_BODY_FIELD = 'throttleByBodyField';

/** Narrows a route's rate limit to one bucket per value of a body field (e.g. per game). */
export const ThrottleByBodyField = (field: string) => SetMetadata(THROTTLE_BY_BODY_FIELD, field);

/**
 * Rate-limit tracker: the authenticated player, falling back to the client IP for public routes.
 * JwtAuthGuard is registered before the throttler guard, so `request.player` is already set.
 */
export function playerTracker(req: Record<string, unknown>, context: ExecutionContext): string {
  const request = req as unknown as FastifyRequest;
  const base = request.player ? `player:${request.player.id}` : `ip:${request.ip}`;
  const field = Reflect.getMetadata(THROTTLE_BY_BODY_FIELD, context.getHandler()) as
    string | undefined;
  if (!field) return base;
  const value = (request.body as Record<string, unknown> | undefined)?.[field];
  return `${base}:${field}:${typeof value === 'string' ? value : ''}`;
}
