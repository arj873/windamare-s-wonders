import { describe, expect, it } from 'vitest';
import { greatWorkCheck, nextThreshold } from './greatWork';
import { scoreTown, tiebreakOf } from './score';
import { ctxOf, fx, newWwGame, setGreatWork, townData } from './testing/helpers';
import { guardOf, loreRanks, measure } from './town';

function withLabour(gw: string, labour: number, seats = 3) {
  const s = newWwGame(seats);
  setGreatWork(s, 0, gw);
  townData(s, 0).labour = labour;
  return s;
}

describe('Great Works (R8)', () => {
  it('R8.1 the Perk is active from the moment the Great Work is revealed', () => {
    const s = newWwGame(3);
    expect(guardOf(fx, s, 0)).toBe(0);
    setGreatWork(s, 0, 'tg-crown');
    expect(guardOf(fx, s, 0)).toBe(1);
    expect(nextThreshold(fx, townData(s, 0))).toBe(3);
  });

  it('R8.3 a tier completes only once labour reaches its threshold', () => {
    const s = withLabour('tg-crown', 2);
    expect(greatWorkCheck(fx, ctxOf(s), 0)).toBe(0);
    expect(townData(s, 0).tiers).toBe(0);
    townData(s, 0).labour = 3;
    expect(greatWorkCheck(fx, ctxOf(s), 0)).toBe(1);
    expect(townData(s, 0).tiers).toBe(1);
  });

  it('R8.3 several tiers may complete in one check, in order', () => {
    const s = withLabour('tg-crown', 12);
    expect(greatWorkCheck(fx, ctxOf(s), 0)).toBe(3);
    expect(
      s.log.filter((e) => e.kind === 'tier').map((e) => (e.data as { tier: number }).tier),
    ).toEqual([1, 2, 3]);
  });

  it('R8.3 labour from a tier reward counts in the same check', () => {
    // tg-larder tier I (2 labour) gives 3 labour and 2 flint: 5 labour reaches tier II.
    const s = withLabour('tg-larder', 2);
    expect(greatWorkCheck(fx, ctxOf(s), 0)).toBe(2);
    expect(townData(s, 0).labour).toBe(5);
    expect(townData(s, 0).store.flint).toBe(2);
  });

  it('R8.4 a one-off reward pays once, when its tier completes', () => {
    const s = withLabour('tg-crown', 3);
    greatWorkCheck(fx, ctxOf(s), 0);
    expect(townData(s, 0).coins).toBe(9);
    townData(s, 0).labour = 6;
    greatWorkCheck(fx, ctxOf(s), 0);
    expect(townData(s, 0).coins).toBe(9);
  });

  it('R8.4 a lasting reward counts from the moment its tier completes', () => {
    const s = withLabour('tg-crown', 6);
    greatWorkCheck(fx, ctxOf(s), 0);
    expect(scoreTown(fx, s, 0).greatWork).toBe(0);
    expect(loreRanks(fx, s, 0)).toEqual([]);
    townData(s, 0).labour = 12;
    greatWorkCheck(fx, ctxOf(s), 0);
    expect(scoreTown(fx, s, 0).greatWork).toBe(3); // tier II renown 3
    expect(loreRanks(fx, s, 0)).toEqual([3]); // tier III lore 3
    townData(s, 0).labour = 18;
    greatWorkCheck(fx, ctxOf(s), 0);
    expect(guardOf(fx, s, 0)).toBe(2); // Perk 1 + tier IV 1
  });

  it('R8.5 labour beyond the tier IV threshold does nothing', () => {
    const s = withLabour('tg-crown', 100);
    expect(greatWorkCheck(fx, ctxOf(s), 0)).toBe(4);
    townData(s, 0).labour = 200;
    expect(greatWorkCheck(fx, ctxOf(s), 0)).toBe(0);
    expect(townData(s, 0).tiers).toBe(4);
    expect(nextThreshold(fx, townData(s, 0))).toBeNull();
  });

  it('R8.6 completed tiers count for the tie-break and the Master Builder measure', () => {
    const s = withLabour('tg-crown', 7);
    greatWorkCheck(fx, ctxOf(s), 0);
    expect(measure(fx, s, 0, 'tiers')).toBe(2);
    expect(tiebreakOf(s, 0)).toEqual([2, 9]);
  });

  it('a town without a Great Work has no track yet', () => {
    const s = newWwGame(3);
    townData(s, 0).labour = 50;
    expect(greatWorkCheck(fx, ctxOf(s), 0)).toBe(0);
    expect(nextThreshold(fx, townData(s, 0))).toBeNull();
  });
});
