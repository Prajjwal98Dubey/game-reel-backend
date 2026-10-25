import { z } from 'zod';

/** `GET /v1/app/latest`: the newest installable build, for the download website. */
export const AppReleaseResponseSchema = z.object({
  platform: z.literal('android'),
  version: z.string(),
  /** Android versionCode. */
  buildNumber: z.string(),
  /** Stable link that always redirects to the newest APK; safe to put in a QR code. */
  downloadUrl: z.url(),
  /** Direct link to this release's APK. */
  apkUrl: z.url(),
  builtAt: z.iso.datetime(),
});
export type AppReleaseResponse = z.infer<typeof AppReleaseResponseSchema>;
