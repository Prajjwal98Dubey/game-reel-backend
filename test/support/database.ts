import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createDbAdapter } from '../../src/prisma/create-adapter';

export interface TestDatabase {
  url: string;
  prisma: PrismaClient;
  stop(): Promise<void>;
}

/**
 * A migrated, empty MySQL database for e2e tests.
 * Uses TEST_DATABASE_URL when set (every table in it is dropped first!), otherwise starts a
 * throwaway container with Testcontainers (requires Docker).
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  let url = process.env.TEST_DATABASE_URL;
  let stopContainer = async () => {};

  if (!url) {
    const { MySqlContainer } = await import('@testcontainers/mysql');
    const container = await new MySqlContainer('mysql:8.4').start();
    url = container.getConnectionUri();
    stopContainer = async () => {
      await container.stop();
    };
  }

  const prisma = new PrismaClient({ adapter: createDbAdapter(url) });
  await dropAllTables(prisma);
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  return {
    url,
    prisma,
    async stop() {
      await prisma.$disconnect();
      await stopContainer();
    },
  };
}

/** Drops every table in the current database. One transaction keeps it on one connection. */
async function dropAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    const tables = await tx.$queryRawUnsafe<{ name: string }[]>(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    for (const { name } of tables) {
      await tx.$executeRawUnsafe(`DROP TABLE \`${name.replace(/`/g, '``')}\``);
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  });
}
