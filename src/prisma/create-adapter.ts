import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'node:fs';

/**
 * Builds Prisma's MySQL driver adapter (the `mariadb` driver, which also speaks to MySQL 8)
 * from a `mysql://user:password@host:3306/database` URL.
 *
 * TLS follows Prisma's own MySQL URL parameters, so the same URL works for the app and for
 * `prisma migrate`:
 *   (none)                         plain connection, e.g. a local database
 *   ?sslaccept=accept_invalid_certs  encrypted, certificate not verified
 *   ?sslaccept=strict&sslcert=/path/ca.pem   encrypted and verified against that CA bundle
 */
export function createDbAdapter(databaseUrl: string): PrismaMariaDb {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:') {
    throw new Error(`DATABASE_URL must start with mysql:// (got ${url.protocol}//)`);
  }
  const sslaccept = url.searchParams.get('sslaccept');
  const sslcert = url.searchParams.get('sslcert');
  const ssl =
    sslaccept === 'strict'
      ? { rejectUnauthorized: true, ...(sslcert ? { ca: readFileSync(sslcert, 'utf8') } : {}) }
      : sslaccept
        ? { rejectUnauthorized: false }
        : undefined;

  return new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: Number(url.searchParams.get('connection_limit') ?? 10),
    ssl,
    // MySQL 8's default auth (caching_sha2_password) needs the server's RSA key over plain
    // connections. Over TLS the password is sent inside the encrypted channel instead.
    allowPublicKeyRetrieval: !ssl,
  });
}
