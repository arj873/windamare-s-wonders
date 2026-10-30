import { describe, expect, it } from 'vitest';
import { scoreTown } from './score';
import { build, fx, fixtureWith, newWwGame, setGreatWork, townData } from './testing/helpers';
import { kindCounts, loreRanks, loreRuns, loreScore, measure } from './town';
import type { WwState } from './types';

function withLore(ranks: number[], s: WwState = newWwGame(3)): WwState {
  for (const r of ranks) build(s, 0, `tf-lore-${r}`);
  return s;
}

describe('Lore (R10)', () => {
  it('R10.1 ranks come from Lore cards and from completed tiers', () => {
    const s = withLore([1, 2]);
    setGreatWork(s, 0, 'tg-crown');
    townData(s, 0).tiers = 3; // tier III: lore 3
    expect(loreRanks(fx, s, 0)).toEqual([1, 2, 3]);
    // A tier's rank counts for R10 only: not as a card or a kind.
    expect(kindCounts(fx, s, 0).lore).toBe(2);
    expect(measure(fx, s, 0, 'kinds')).toBe(1);
  });

  it('R10.2 a run is a longest block of consecutive distinct ranks', () => {
    expect(loreRuns([1, 2, 4, 5, 6])).toEqual([2, 3]);
    expect(loreRuns([1, 3, 5])).toEqual([1, 1, 1]);
    expect(loreRuns([])).toEqual([]);
    expect(loreRuns([1, 2, 3, 4, 5, 6])).toEqual([6]);
  });

  it('R10.3 each run scores by its length: 1, 3, 6, 10, 14, 18', () => {
    for (let len = 1; len <= 6; len++) {
      const s = withLore(Array.from({ length: len }, (_, i) => i + 1));
      expect(loreScore(fx, s, 0)).toBe([1, 3, 6, 10, 14, 18][len - 1]);
    }
    const tuned = fixtureWith({ tunables: { loreRunScores: [2, 4, 6, 8, 10, 12] } });
    const s = newWwGame(3, 1, tuned);
    s.seats[0]!.tableau.push({ id: s.nextCardId++, def: 'tf-lore-1' });
    expect(loreScore(tuned, s, 0)).toBe(2);
  });

  it('R10.4 a second card of a rank the town has adds nothing', () => {
    expect(loreScore(fx, withLore([2, 3, 3]), 0)).toBe(3);
    expect(loreScore(fx, withLore([2, 3]), 0)).toBe(3);
  });

  it('R10.5 example: 1, 2, 4, 5, 6, 5 scores 3 + 6 = 9; adding a 3 makes one run of 6: 18', () => {
    const s = withLore([1, 2, 4, 5, 6, 5]);
    expect(scoreTown(fx, s, 0).lore).toBe(9);
    build(s, 0, 'tf-lore-3');
    expect(scoreTown(fx, s, 0).lore).toBe(18);
  });
});
