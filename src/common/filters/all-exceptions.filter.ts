import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import type { ErrorCode, ErrorIssue, ErrorResponse } from '../../shared';
import { AppException } from '../errors/app.exception';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Renders every error as `{ error: { code, message, requestId, details? } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const { status, body } = this.toResponse(exception);
    const payload: ErrorResponse = { error: { ...body, requestId: String(request.id) } };

    if (status >= 500) {
      this.logger.error({ msg: 'unhandled error', err: exception });
    }
    void reply.status(status).send(payload);
  }

  private toResponse(exception: unknown): {
    status: number;
    body: Omit<ErrorResponse['error'], 'requestId'>;
  } {
    if (exception instanceof ZodValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: toIssues(exception.getZodError()),
        },
      };
    }
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: { code: exception.code, message: exception.message },
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: { code: codeFor(status), message: exception.message } };
    }
    // Errors raised by Fastify itself (malformed JSON, body too large, bad content type).
    const fastifyStatus = (exception as { statusCode?: unknown } | null)?.statusCode;
    if (typeof fastifyStatus === 'number' && fastifyStatus >= 400 && fastifyStatus < 500) {
      return {
        status: fastifyStatus,
        body: { code: codeFor(fastifyStatus), message: (exception as Error).message },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    };
  }
}

function codeFor(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
}

function toIssues(error: unknown): ErrorIssue[] {
  // Duck-typed: nestjs-zod may surface errors from a different zod build than ours.
  const issues = (error as Partial<ZodError> | null)?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }));
}
