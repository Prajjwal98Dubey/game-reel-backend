import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../../common/errors/app.exception';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { isValidEasSignature } from './eas-signature';

/** Rejects webhook calls not signed with EAS_WEBHOOK_SECRET. Runs before body validation. */
@Injectable()
export class EasSignatureGuard implements CanActivate {
  private readonly logger = new Logger(EasSignatureGuard.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.EAS_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        'The EAS webhook is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const request = context.switchToHttp().getRequest<RawBodyRequest<FastifyRequest>>();
    const header = request.headers['expo-signature'];
    const signature = typeof header === 'string' ? header : undefined;
    if (!request.rawBody || !isValidEasSignature(request.rawBody, signature, secret)) {
      this.logger.warn({ msg: 'rejected EAS webhook: bad signature', signed: !!signature });
      throw AppException.unauthorized('Invalid webhook signature.');
    }
    return true;
  }
}
