import { createHmac, timingSafeEqual } from 'node:crypto';

/** EAS signs webhook bodies as `expo-signature: sha1=<hex HMAC-SHA1 of the raw body>`. */
export function signEasBody(body: Buffer | string, secret: string): string {
  return `sha1=${createHmac('sha1', secret).update(body).digest('hex')}`;
}

/** Checks an `expo-signature` header against the body bytes exactly as received. */
export function isValidEasSignature(
  body: Buffer | string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = Buffer.from(signEasBody(body, secret));
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
