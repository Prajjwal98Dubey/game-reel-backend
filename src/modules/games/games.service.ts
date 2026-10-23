import { Injectable } from '@nestjs/common';
import { gte } from 'semver';
import { AppException } from '../../common/errors/app.exception';
import type { GameControl, GameManifest, ListGamesQuery, ListGamesResponse } from '../../shared';
import { ScoresService } from '../scores/scores.service';
import { decodeCatalogueCursor, encodeCatalogueCursor } from './catalogue-cursor';
import { GamesRepository, GameWithVersion } from './games.repository';

/** A manifest before the player's best score is attached. */
export type PlayableGame = Omit<GameManifest, 'best'>;

@Injectable()
export class GamesService {
  constructor(
    private readonly games: GamesRepository,
    private readonly scores: ScoresService,
  ) {}

  /**
   * Published games this app build can run, ordered by id.
   * `appVersion` null (header absent) means no version filtering.
   */
  async listPlayable(appVersion: string | null): Promise<PlayableGame[]> {
    const rows = await this.games.findPublished();
    return rows.map(toPlayable).filter((g) => !appVersion || gte(appVersion, g.minAppVersion));
  }

  async listCatalogue(
    playerId: string,
    query: ListGamesQuery,
    appVersion: string | null,
  ): Promise<ListGamesResponse> {
    const offset = decodeCatalogueCursor(query.cursor);
    const all = (await this.listPlayable(appVersion))
      .filter((g) => !query.tag || g.tags.includes(query.tag))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    const page = all.slice(offset, offset + query.limit);
    const end = offset + page.length;
    return {
      items: await this.withBests(playerId, page),
      nextCursor: end < all.length ? encodeCatalogueCursor(end) : null,
    };
  }

  /** One published game's manifest, regardless of app version (the app checks `minAppVersion`). */
  async getManifest(playerId: string, id: string): Promise<GameManifest> {
    const row = await this.games.findPublishedById(id);
    if (!row) throw AppException.gameNotFound(id);
    const [manifest] = await this.withBests(playerId, [toPlayable(row)]);
    return manifest;
  }

  /** Attaches this player's best score to each game. */
  async withBests(playerId: string, games: PlayableGame[]): Promise<GameManifest[]> {
    const bests = await this.scores.bestsFor(
      playerId,
      games.map((g) => g.id),
    );
    return games.map((g) => ({ ...g, best: bests.get(g.id) ?? null }));
  }

  /**
   * Looks up a game (any status) and one of its versions, for score validation.
   * `exists` is false for unknown game ids; `version` is null for unknown versions.
   */
  async findVersion(
    gameId: string,
    version: string,
  ): Promise<{ exists: boolean; version: { maxScorePerSec: number } | null }> {
    const game = await this.games.findWithVersion(gameId, version);
    return { exists: !!game, version: game?.versions[0] ?? null };
  }
}

function toPlayable(row: GameWithVersion): PlayableGame {
  const v = row.currentVersion;
  return {
    id: row.id,
    name: row.name,
    version: v.version,
    bundleUrl: v.bundleUrl,
    thumbnailUrl: v.thumbnailUrl,
    description: row.description,
    tags: row.tags,
    controls: row.controls as GameControl[],
    avgRoundSeconds: row.avgRoundSeconds,
    minAppVersion: v.minAppVersion,
    sdkVersion: v.sdkVersion,
  };
}
