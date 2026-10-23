import { PlausibilityScoreValidator, SCORE_ALLOWANCE } from './score-validator';

describe('PlausibilityScoreValidator', () => {
  const validator = new PlausibilityScoreValidator();
  const version = { maxScorePerSec: 2 };

  it('accepts a plausible play', () => {
    expect(validator.check({ score: 40, durationMs: 30_000, version })).toEqual({
      flagged: false,
      reasons: [],
    });
  });

  it('allows a small allowance above the max rate', () => {
    const atLimit = 2 * 10 + SCORE_ALLOWANCE;
    expect(validator.check({ score: atLimit, durationMs: 10_000, version }).flagged).toBe(false);
    expect(validator.check({ score: atLimit + 1, durationMs: 10_000, version })).toEqual({
      flagged: true,
      reasons: ['score_rate'],
    });
  });

  it('flags rounds shorter than 1 s or longer than 10 min', () => {
    expect(validator.check({ score: 0, durationMs: 999, version }).reasons).toEqual(['too_short']);
    expect(validator.check({ score: 0, durationMs: 600_001, version }).reasons).toEqual([
      'too_long',
    ]);
    expect(validator.check({ score: 0, durationMs: 1_000, version }).flagged).toBe(false);
    expect(validator.check({ score: 0, durationMs: 600_000, version }).flagged).toBe(false);
  });

  it('flags plays for a version that does not exist', () => {
    expect(validator.check({ score: 1, durationMs: 5_000, version: null })).toEqual({
      flagged: true,
      reasons: ['unknown_version'],
    });
  });
});
