import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { GamesService } from '../games/games.service';
import { FeedCursor, FeedStrategy, FeedStrategyItem } from './feed-strategy';
import { deriveSeed, mulberry32, shuffledIndices } from './seeded-random';

/**
 * MVP feed: an endless sequence made of back-to-back shuffles of every playable game.
 * The sequence is a pure function of (seed, game list), so the same cursor always
 * returns the same page and retries are safe.
 */
@Injectable()
export class ShuffledFeedStrategy implements FeedStrategy {
  constructor(private readonly games: GamesService) {}

  async next(input: {
    cursor: FeedCursor | null;
    limit: number;
    appVersion: string | null;
  }): Promise<{ items: FeedStrategyItem[]; nextCursor: FeedCursor }> {
    const games = await this.games.listPlayable(input.appVersion);
    const seed = input.cursor?.seed ?? randomInt(0, 2 ** 32);
    const offset = input.cursor?.offset ?? 0;
    if (games.length === 0) return { items: [], nextCursor: { seed, offset } };

    const items = shuffledSequence(seed, offset, input.limit, games.length).map(
      (i): FeedStrategyItem => ({ kind: 'game', game: games[i] }),
    );
    return { items, nextCursor: { seed, offset: offset + input.limit } };
  }
}

/**
 * Indices into a list of `n` games for positions [offset, offset + count) of the endless
 * sequence. Each cycle of `n` positions is a full shuffle; no index ever appears twice in a
 * row, including across cycle boundaries (impossible only when n = 1).
 */
export function shuffledSequence(seed: number, offset: number, count: number, n: number): number[] {
  const cycles = new Map<number, number[]>();
  const cycleAt = (c: number) => {
    let order = cycles.get(c);
    if (!order) cycles.set(c, (order = cycleOrder(seed, c, n)));
    return order;
  };
  const out: number[] = [];
  for (let p = offset; p < offset + count; p++) out.push(cycleAt(Math.floor(p / n))[p % n]);
  return out;
}

function rawCycle(seed: number, cycle: number, n: number): { order: number[]; rng: () => number } {
  const rng = mulberry32(deriveSeed(seed, cycle));
  return { order: shuffledIndices(n, rng), rng };
}

function cycleOrder(seed: number, cycle: number, n: number): number[] {
  // With two games the only valid sequence alternates, so every cycle repeats the first.
  if (n === 2) return rawCycle(seed, 0, n).order;
  const { order, rng } = rawCycle(seed, cycle, n);
  if (n < 3 || cycle === 0) return order;

  // Fix a repeat across the boundary by swapping the first item with one from the
  // middle. The last item is never moved, so a cycle's last item depends only on its
  // own raw shuffle and the previous cycle can be computed without recursion.
  const previousLast = rawCycle(seed, cycle - 1, n).order[n - 1];
  if (order[0] === previousLast) {
    const j = 1 + Math.floor(rng() * (n - 2));
    [order[0], order[j]] = [order[j], order[0]];
  }
  return order;
}
