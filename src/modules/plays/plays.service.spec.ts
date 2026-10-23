import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GamesService } from '../games/games.service';
import type { ScoresService } from '../scores/scores.service';
import type { PlaysRepository } from './plays.repository';
import { PlausibilityScoreValidator } from './score-validator';
import { PlaysService } from './plays.service';

describe('PlaysService', () => {
  const tx = { tx: true };
  const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
  const plays = { create: jest.fn() };
  const games = { findVersion: jest.fn() };
  const scores = { record: jest.fn(), bestFor: jest.fn() };
  const service = new PlaysService(
    prisma as unknown as PrismaService,
    plays as unknown as PlaysRepository,
    games as unknown as GamesService,
    scores as unknown as ScoresService,
    new PlausibilityScoreValidator(),
  );
  const play = {
    gameId: 'stack',
    gameVersion: '1.0.0',
    score: 42,
    durationMs: 31_800,
    seed: 918273,
  };

  beforeAll(() => Logger.overrideLogger(false));
  beforeEach(() => jest.clearAllMocks());

  it('stores an accepted play and records the best in the same transaction', async () => {
    games.findVersion.mockResolvedValue({ exists: true, version: { maxScorePerSec: 3 } });
    scores.record.mockResolvedValue({ best: 42, isNewBest: true });

    await expect(service.submit('p1', play)).resolves.toEqual({ best: 42, isNewBest: true });
    expect(plays.create).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p1', gameId: 'stack', score: 42, flagged: false }),
      tx,
    );
    expect(scores.record).toHaveBeenCalledWith('p1', 'stack', 42, tx);
  });

  it('stores a flagged play without touching the best', async () => {
    games.findVersion.mockResolvedValue({ exists: true, version: { maxScorePerSec: 0.1 } });
    scores.bestFor.mockResolvedValue(7);

    await expect(service.submit('p1', play)).resolves.toEqual({ best: 7, isNewBest: false });
    expect(plays.create).toHaveBeenCalledWith(expect.objectContaining({ flagged: true }), tx);
    expect(scores.record).not.toHaveBeenCalled();
  });

  it('flags plays for an unknown version of a known game', async () => {
    games.findVersion.mockResolvedValue({ exists: true, version: null });
    scores.bestFor.mockResolvedValue(null);

    await expect(service.submit('p1', play)).resolves.toEqual({ best: 0, isNewBest: false });
    expect(plays.create).toHaveBeenCalledWith(expect.objectContaining({ flagged: true }), tx);
  });

  it('rejects plays for a game that does not exist', async () => {
    games.findVersion.mockResolvedValue({ exists: false, version: null });

    await expect(service.submit('p1', play)).rejects.toMatchObject({ code: 'GAME_NOT_FOUND' });
    expect(plays.create).not.toHaveBeenCalled();
  });
});
