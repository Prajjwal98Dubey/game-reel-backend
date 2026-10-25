import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => v || undefined);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .url()
    .refine((v) => v.startsWith('mysql://'), 'DATABASE_URL must be a mysql:// URL'),
  /** Optional in the MVP; rate limits fall back to in-memory storage. */
  REDIS_URL: optionalString.pipe(z.url().optional()),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CURSOR_SECRET: z.string().min(32, 'CURSOR_SECRET must be at least 32 characters'),
  CDN_BASE_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
  /** Storage credentials are only used by scripts/publish-game.ts, which checks them itself. */
  STORAGE_BUCKET: optionalString,
  STORAGE_ENDPOINT: optionalString,
  STORAGE_ACCESS_KEY: optionalString,
  STORAGE_SECRET_KEY: optionalString,
  /** Comma-separated origins; `*` allows any origin (local development only). */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  /**
   * A built games directory (the frontend's `games/dist`) served at `/cdn/games/`, standing in
   * for the CDN. Set CDN_BASE_URL to this API's `/cdn`: `http://localhost:<PORT>/cdn` locally,
   * or e.g. `https://api.example.com/cdn` on a server without a separate CDN.
   */
  LOCAL_GAMES_DIR: optionalString,
  /** Shared secret for EAS build webhooks (`POST /v1/webhooks/eas`). Unset disables the webhook. */
  EAS_WEBHOOK_SECRET: optionalString.pipe(
    z.string().min(32, 'EAS_WEBHOOK_SECRET must be at least 32 characters').optional(),
  ),
  /** The EAS build profile whose finished Android builds become public releases. */
  APP_RELEASE_PROFILE: z.string().default('staging'),
  /** This API's public origin, used in release links. Defaults to the request's own host. */
  PUBLIC_API_URL: optionalString.pipe(
    z
      .url()
      .transform((v) => v.replace(/\/+$/, ''))
      .optional(),
  ),
  /**
   * Directory where release APKs are copied and served at `/apk/`, so download links keep
   * working after EAS deletes old build files. Unset: links point at EAS directly.
   */
  APK_DIR: optionalString,
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Parses the environment; throws a readable error listing every bad variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
