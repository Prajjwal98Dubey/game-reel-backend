import type { GamesService, PlayableGame } from '../games/games.service';
import { ShuffledFeedStrategy, shuffledSequence } from './shuffled-feed.strategy';

function game(id: string): PlayableGame {
  return {
    id,
    name: id,
    version: '1.0.0',
    bundleUrl: `https://cdn.test/games/${id}/1.0.0/index.html`,
    thumbnailUrl: `https://cdn.test/games/${id}/1.0.0/thumb.webp`,
    description: '',
    tags: [],
    controls: ['tap'],
    avgRoundSeconds: 20,
    minAppVersion: '1.0.0',
    sdkVersion: 1,
  };
}

describe('shuffledSequence', () => {
  it('is deterministic for a seed', () => {
    expect(shuffledSequence(42, 0, 50, 7)).toEqual(shuffledSequence(42, 0, 50, 7));
    expect(shuffledSequence(42, 0, 50, 7)).not.toEqual(shuffledSequence(43, 0, 50, 7));
  });

  it('returns the same items for a page whether fetched alone or as part of a longer read', () => {
    const whole = shuffledSequence(7, 0, 40, 5);
    expect(shuffledSequence(7, 10, 10, 5)).toEqual(whole.slice(10, 20));
    expect(shuffledSequence(7, 33, 7, 5)).toEqual(whole.slice(33, 40));
  });

  it('contains every game exactly once per cycle', () => {
    const n = 6;
    const seq = shuffledSequence(1234, 0, n * 20, n);
    for (let c = 0; c < 20; c++) {
      expect([...seq.slice(c * n, (c + 1) * n)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it.each([2, 3, 4, 5, 10])('never repeats a game back to back (n=%i)', (n) => {
    for (let seed = 0; seed < 200; seed++) {
      const seq = shuffledSequence(seed, 0, n * 30, n);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });

  it('repeats the only game when there is just one', () => {
    expect(shuffledSequence(9, 0, 4, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe('ShuffledFeedStrategy', () => {
  const games = ['catch', 'hop', 'pop', 'stack', 'zone'].map(game);
  const gamesService = { listPlayable: jest.fn().mockResolvedValue(games) };
  const strategy = new ShuffledFeedStrategy(gamesService as unknown as GamesService);
  const input = { playerId: 'p1', limit: 4, appVersion: '1.0.0' };

  it('starts a new random seed without a cursor and advances the offset', async () => {
    const { items, nextCursor } = await strategy.next({ ...input, cursor: null });
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.kind === 'game')).toBe(true);
    expect(nextCursor.offset).toBe(4);
    expect(gamesService.listPlayable).toHaveBeenCalledWith('1.0.0');
  });

  it('returns the same page for the same cursor', async () => {
    const cursor = { seed: 99, offset: 8 };
    const a = await strategy.next({ ...input, cursor });
    const b = await strategy.next({ ...input, cursor });
    expect(a).toEqual(b);
    expect(a.nextCursor).toEqual({ seed: 99, offset: 12 });
  });

  it('returns no items and keeps the cursor when nothing is playable', async () => {
    gamesService.listPlayable.mockResolvedValueOnce([]);
    const result = await strategy.next({ ...input, cursor: { seed: 1, offset: 3 } });
    expect(result).toEqual({ items: [], nextCursor: { seed: 1, offset: 3 } });
  });
});
