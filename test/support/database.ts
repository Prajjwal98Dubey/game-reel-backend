import { PrismaPg } from '@prisma/adapter-pg';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '../../src/generated/prisma/client';

export interface TestDatabase {
  url: string;
  prisma: PrismaClient;
  stop(): Promise<void>;
}

/**
 * A migrated, empty Postgres for e2e tests.
 * Uses TEST_DATABASE_URL when set (the schema is wiped first!), otherwise starts a
 * throwaway container with Testcontainers (requires Docker).
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  let url = process.env.TEST_DATABASE_URL;
  let stopContainer = async () => {};

  if (!url) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:17-alpine').start();
    url = container.getConnectionUri();
    stopContainer = async () => {
      await container.stop();
    };
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
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
