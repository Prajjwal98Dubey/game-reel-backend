import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { APP_CONFIG, AppConfig } from '../../config/env';
import type { AppRelease } from '../../generated/prisma/client';
import type { AppReleaseResponse } from '../../shared';
import { APK_PATH_PREFIX, ApkMirror } from './apk-mirror';
import type { EasBuildWebhook, EasWebhookResponse } from './releases.dto';
import { ReleasesRepository } from './releases.repository';

const PLATFORM = 'android';
export const DOWNLOAD_PATH = '/v1/app/download';

@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly releases: ReleasesRepository,
    private readonly mirror: ApkMirror,
  ) {}

  /**
   * Saves finished Android builds of the release profile. Anything else is acknowledged and
   * ignored: answering 200 stops EAS from retrying events we don't want.
   */
  async handleBuildEvent(build: EasBuildWebhook): Promise<EasWebhookResponse> {
    const profile = build.metadata?.buildProfile;
    if (
      build.status !== 'finished' ||
      build.platform !== PLATFORM ||
      profile !== this.config.APP_RELEASE_PROFILE
    ) {
      this.logger.log({
        msg: 'ignored EAS build',
        easBuildId: build.id,
        status: build.status,
        platform: build.platform,
        profile,
      });
      return { ignored: true };
    }

    const version = build.metadata?.appVersion;
    const buildNumber = build.metadata?.appBuildVersion;
    const apkUrl = build.artifacts?.buildUrl;
    if (!version || !buildNumber || !apkUrl) {
      throw new AppException(
        'BAD_REQUEST',
        'A finished build needs metadata.appVersion, metadata.appBuildVersion and artifacts.buildUrl.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const release = await this.releases.upsert({
      easBuildId: build.id,
      platform: PLATFORM,
      buildProfile: profile,
      version,
      buildNumber,
      apkUrl,
      buildPageUrl: build.buildDetailsPageUrl ?? null,
      gitCommit: build.metadata?.gitCommitHash ?? null,
      completedAt: build.completedAt ? new Date(build.completedAt) : new Date(),
    });
    this.logger.log({ msg: 'saved release', easBuildId: build.id, version, buildNumber });
    this.mirror.mirrorInBackground(release);
    return { saved: true, version };
  }

  /** `origin` is this API's public origin, e.g. `https://api.example.com`. */
  async latest(origin: string): Promise<AppReleaseResponse> {
    const release = await this.findLatest();
    return {
      platform: PLATFORM,
      version: release.version,
      buildNumber: release.buildNumber,
      downloadUrl: origin + DOWNLOAD_PATH,
      apkUrl: this.apkLink(release, origin),
      builtAt: release.completedAt.toISOString(),
    };
  }

  async latestApkUrl(origin: string): Promise<string> {
    return this.apkLink(await this.findLatest(), origin);
  }

  private async findLatest(): Promise<AppRelease> {
    const release = await this.releases.findLatest(PLATFORM);
    if (!release) throw AppException.noRelease();
    return release;
  }

  /** Our own copy when it is on disk, otherwise the EAS link. */
  private apkLink(release: AppRelease, origin: string): string {
    const file = this.mirror.localFile(release);
    return file ? `${origin}${APK_PATH_PREFIX}${encodeURIComponent(file)}` : release.apkUrl;
  }
}
