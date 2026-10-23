import type { AppConfig } from '../../config/env';
import { FeedCursorCodec } from './feed-cursor.codec';

describe('FeedCursorCodec', () => {
  const codec = new FeedCursorCodec({ CURSOR_SECRET: 'x'.repeat(32) } as AppConfig);

  it('round-trips a cursor', () => {
    const token = codec.encode({ seed: 4_000_000_000, offset: 30 });
    expect(codec.decode(token)).toEqual({ seed: 4_000_000_000, offset: 30 });
  });

  it('treats a missing cursor as the start of a new feed', () => {
    expect(codec.decode(undefined)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const [, signature] = codec.encode({ seed: 1, offset: 10 }).split('.');
    const forged = Buffer.from(JSON.stringify({ seed: 1, offset: 0 })).toString('base64url');
    expect(() => codec.decode(`${forged}.${signature}`)).toThrow(
      expect.objectContaining({ code: 'INVALID_CURSOR' }),
    );
  });

  it('rejects a cursor signed with another secret', () => {
    const other = new FeedCursorCodec({ CURSOR_SECRET: 'y'.repeat(32) } as AppConfig);
    expect(() => codec.decode(other.encode({ seed: 1, offset: 0 }))).toThrow(
      expect.objectContaining({ code: 'INVALID_CURSOR' }),
    );
  });

  it.each(['garbage', 'a.b.c', '.', 'eyJ9.'])('rejects malformed cursor %p', (token) => {
    expect(() => codec.decode(token)).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
  });
});
