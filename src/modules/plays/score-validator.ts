import { Injectable } from '@nestjs/common';

export interface ScoreCheckInput {
  score: number;
  durationMs: number;
  /** The submitted game version's limits; null when that version does not exist. */
  version: { maxScorePerSec: number } | null;
}

export interface ScoreCheckResult {
  flagged: boolean;
  reasons: string[];
}

/** Decides whether a submitted score is trustworthy. Flagged plays are stored but never count as a best. */
export interface ScoreValidator {
  check(input: ScoreCheckInput): ScoreCheckResult;
}

export const SCORE_VALIDATOR = Symbol('SCORE_VALIDATOR');

export const MIN_DURATION_MS = 1_000;
export const MAX_DURATION_MS = 10 * 60 * 1_000;
/** Headroom above `maxScorePerSec × seconds` for bursty games and rounding. */
export const SCORE_ALLOWANCE = 5;

/** MVP validator: cheap plausibility checks, enough while there are no public leaderboards. */
@Injectable()
export class PlausibilityScoreValidator implements ScoreValidator {
  check({ score, durationMs, version }: ScoreCheckInput): ScoreCheckResult {
    const reasons: string[] = [];
    if (!version) reasons.push('unknown_version');
    if (durationMs < MIN_DURATION_MS) reasons.push('too_short');
    if (durationMs > MAX_DURATION_MS) reasons.push('too_long');
    if (version && score > version.maxScorePerSec * (durationMs / 1000) + SCORE_ALLOWANCE) {
      reasons.push('score_rate');
    }
    return { flagged: reasons.length > 0, reasons };
  }
}
