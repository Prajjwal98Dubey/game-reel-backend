import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception';
import { APP_CONFIG, AppConfig } from '../../config/env';
import type { FeedCursor } from './feed-strategy';

const CursorSchema = z.object({
  seed: z
    .int()
    .min(0)
    .max(2 ** 32 - 1),
  offset: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
});

/** Feed cursors are `base64url(json).base64url(hmac)`: opaque to the app and tamper-proof. */
@Injectable()
export class FeedCursorCodec {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  encode(cursor: FeedCursor): string {
    const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns null for an absent cursor; throws INVALID_CURSOR for a bad or tampered one. */
  decode(token: string | undefined): FeedCursor | null {
    if (!token) return null;
    const [payload, signature, ...rest] = token.split('.');
    if (!payload || !signature || rest.length > 0) throw AppException.invalidCursor();

    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw AppException.invalidCursor();
    }
    try {
      return CursorSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    } catch {
      throw AppException.invalidCursor();
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.CURSOR_SECRET)
      .update(payload)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  }
}
