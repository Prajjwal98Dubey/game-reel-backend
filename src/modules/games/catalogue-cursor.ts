import { AppException } from '../../common/errors/app.exception';

/**
 * Catalogue cursors are plain base64url `{"offset":N}`. They are not signed:
 * the catalogue is public data and any offset is a valid page.
 */
export function encodeCatalogueCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

export function decodeCatalogueCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const { offset } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      offset?: unknown;
    };
    if (typeof offset === 'number' && Number.isSafeInteger(offset) && offset >= 0) return offset;
  } catch {
    // fall through
  }
  throw AppException.invalidCursor();
}
