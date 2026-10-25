import { createHmac } from 'node:crypto';
import { isValidEasSignature, signEasBody } from './eas-signature';

describe('EAS webhook signature', () => {
  const secret = 'eas-webhook-secret-0123456789abcdef0123';
  const body = Buffer.from('{"id":"build-1","status":"finished","platform":"android"}');

  it('matches the format EAS sends: sha1=<hex HMAC-SHA1 of the body>', () => {
    const hex = createHmac('sha1', secret).update(body).digest('hex');
    expect(signEasBody(body, secret)).toBe(`sha1=${hex}`);
  });

  it('accepts a valid signature', () => {
    expect(isValidEasSignature(body, signEasBody(body, secret), secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(body.toString().replace('finished', 'errored'));
    expect(isValidEasSignature(tampered, signEasBody(body, secret), secret)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const other = signEasBody(body, 'another-secret-0123456789abcdef0123456');
    expect(isValidEasSignature(body, other, secret)).toBe(false);
  });

  it('rejects a missing header and a wrong prefix', () => {
    const hex = signEasBody(body, secret).slice('sha1='.length);
    expect(isValidEasSignature(body, undefined, secret)).toBe(false);
    expect(isValidEasSignature(body, '', secret)).toBe(false);
    expect(isValidEasSignature(body, hex, secret)).toBe(false);
    expect(isValidEasSignature(body, `sha256=${hex}`, secret)).toBe(false);
  });
});
