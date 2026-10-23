import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { TokenService } from '../auth/token.service';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';

/** Global guard: every route needs `Authorization: Bearer <token>` unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw AppException.unauthorized();

    const player = await this.tokens.verify(token);
    if (!player) throw AppException.unauthorized('Token is invalid or expired.');
    request.player = player;
    return true;
  }
}
