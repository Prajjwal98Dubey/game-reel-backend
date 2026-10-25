import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '../../shared';

/** An error with a stable machine-readable code; rendered by AllExceptionsFilter. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
  ) {
    super(message, status);
  }

  static gameNotFound(id: string): AppException {
    return new AppException(
      'GAME_NOT_FOUND',
      `No published game with id '${id}'.`,
      HttpStatus.NOT_FOUND,
    );
  }

  static invalidCursor(): AppException {
    return new AppException(
      'INVALID_CURSOR',
      'The cursor is invalid or has been tampered with.',
      HttpStatus.BAD_REQUEST,
    );
  }

  static invalidAppVersion(value: string): AppException {
    return new AppException(
      'INVALID_APP_VERSION',
      `X-App-Version '${value}' is not a valid semantic version.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  static noRelease(): AppException {
    return new AppException(
      'NOT_FOUND',
      'No app release has been published yet.',
      HttpStatus.NOT_FOUND,
    );
  }

  static unauthorized(message = 'Missing or invalid bearer token.'): AppException {
    return new AppException('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }
}
