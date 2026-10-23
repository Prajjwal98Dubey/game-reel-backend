import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedPlayer } from '../auth/token.service';
import { AppException } from '../errors/app.exception';

declare module 'fastify' {
  interface FastifyRequest {
    player?: AuthenticatedPlayer;
  }
}

/** The player authenticated by JwtAuthGuard. */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPlayer => {
    const player = ctx.switchToHttp().getRequest<FastifyRequest>().player;
    if (!player) throw AppException.unauthorized();
    return player;
  },
);
