import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { APP_CONFIG, AppConfig } from '../../config/env';
import type { AppRelease } from '../../generated/prisma/client';
import { ReleasesRepository } from './releases.repository';

/** Served at `/apk/<file>` (see app.factory.ts). */
export const APK_PATH_PREFIX = '/apk/';
/** Local copies kept, newest first: enough to withdraw a bad build or two. */
const KEEP_MIRRORED = 3;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/**
 * Copies release APKs from EAS into APK_DIR, because EAS deletes build files after its
 * retention period. Copies run in the background, so the webhook answers EAS straight away;
 * until a copy is done, links point at EAS.
 */
@Injectable()
export class ApkMirror implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApkMirror.name);
  private readonly inFlight = new Set<string>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly releases: ReleasesRepository,
  ) {}

  /** Finishes a copy that a restart interrupted. */
  onApplicationBootstrap(): void {
    if (!this.config.APK_DIR) return;
    this.releases
      .findLatest('android')
      .then((release) => release && this.mirrorInBackground(release))
      .catch((err: unknown) => this.logger.error({ msg: 'APK mirror check failed', err }));
  }

  mirrorInBackground(release: AppRelease): void {
    const dir = this.config.APK_DIR;
    if (!dir || release.mirroredFile || this.inFlight.has(release.id)) return;
    this.inFlight.add(release.id);
    this.mirror(release, dir)
      .catch((err: unknown) =>
        this.logger.error({ msg: 'APK mirror failed', easBuildId: release.easBuildId, err }),
      )
      .finally(() => this.inFlight.delete(release.id));
  }

  /** The local file name for this release if its copy is on disk. */
  localFile(release: AppRelease): string | null {
    const dir = this.config.APK_DIR;
    const file = release.mirroredFile;
    return dir && file && existsSync(join(dir, file)) ? file : null;
  }

  private async mirror(release: AppRelease, dir: string): Promise<void> {
    const file = mirrorFileName(release);
    const target = join(dir, file);
    const partial = `${target}.part`;

    const response = await fetch(release.apkUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      throw new Error(`download failed with HTTP ${response.status}`);
    }
    await mkdir(dir, { recursive: true });
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(partial),
    );
    await rename(partial, target);
    await this.releases.setMirroredFile(release.id, file);
    this.logger.log({ msg: 'mirrored APK', easBuildId: release.easBuildId, file });
    await this.prune(dir);
  }

  private async prune(dir: string): Promise<void> {
    const mirrored = await this.releases.findMirrored();
    for (const { id, mirroredFile } of mirrored.slice(KEEP_MIRRORED)) {
      if (mirroredFile) await rm(join(dir, mirroredFile), { force: true });
      await this.releases.setMirroredFile(id, null);
    }
  }
}

/** `app-1.0.3-7-9f1c2b3a.apk`: readable, and unique even if a versionCode is reused. */
export function mirrorFileName(
  release: Pick<AppRelease, 'version' | 'buildNumber' | 'easBuildId'>,
): string {
  const safe = (value: string) => value.replace(/[^\w.-]/g, '_');
  return `app-${safe(release.version)}-${safe(release.buildNumber)}-${safe(release.easBuildId.slice(0, 8))}.apk`;
}
