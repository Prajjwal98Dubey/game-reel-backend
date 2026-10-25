import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AppReleaseResponseSchema } from '../../shared';

/**
 * The fields we use from an EAS BUILD webhook (https://docs.expo.dev/eas/webhooks/). Everything
 * past id/status/platform is optional here: failed and cancelled builds omit most of it, and
 * finished release builds are checked for what they need in ReleasesService.
 */
export const EasBuildWebhookSchema = z.object({
  id: z.string().min(1).max(191),
  status: z.string(),
  platform: z.string(),
  metadata: z
    .object({
      buildProfile: z.string().nullish(),
      appVersion: z.string().max(64).nullish(),
      appBuildVersion: z.union([z.string(), z.number()]).transform(String).nullish(),
      gitCommitHash: z.string().max(191).nullish(),
    })
    .nullish(),
  artifacts: z.object({ buildUrl: z.url().max(1024).nullish() }).nullish(),
  buildDetailsPageUrl: z.url().max(512).nullish(),
  completedAt: z.iso.datetime({ offset: true }).nullish(),
});
export type EasBuildWebhook = z.infer<typeof EasBuildWebhookSchema>;

export type EasWebhookResponse = { ignored: true } | { saved: true; version: string };

export class EasBuildWebhookDto extends createZodDto(EasBuildWebhookSchema) {}
export class AppReleaseResponseDto extends createZodDto(AppReleaseResponseSchema) {}
