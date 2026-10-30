import { describe, expect, it } from 'vitest';
import { viewFor } from '../core/view';
import { honourScore, honourStandings } from './honours';
import { build, fx, fxRuleset, newWwGame, setGreatWork, townData } from './testing/helpers';
import { measure } from './town';
import { MEASURES, type WwState } from './types';

/** Seat 0: 2 Halls; seat 1: 1 Hall and 1 Watch; seat 2: nothing. All 5 coins. */
function town3(): WwState {
  const s = newWwGame(3);
  s.table.honours = ['th-halls', 'th-coins', 'th-kinds'];
  build(s, 0, 'tf-shrine');
  build(s, 0, 'tf-shrine');
  build(s, 1, 'tf-shrine');
  build(s, 1, 'tf-fence');
  return s;
}

describe('Honours (R11)', () => {
  it('R11.1 each revealed Honour names a measure of a town', () => {
    const s = newWwGame(3);
    for (const id of s.table.honours) expect(MEASURES).toContain(fx.honour(id).measure);
    expect(honourStandings(fx, s).map((h) => h.honour)).toEqual(s.table.honours);
  });

  it('R11.2 the highest measure gains 5; tied leaders gain 2 each', () => {
    const s = town3();
    expect(honourStandings(fx, s)).toEqual([
      { honour: 'th-halls', best: 2, leaders: [0] },
      { honour: 'th-coins', best: 5, leaders: [0, 1, 2] },
      { honour: 'th-kinds', best: 2, leaders: [1] },
    ]);
    expect([0, 1, 2].map((seat) => honourScore(fx, s, seat))).toEqual([5 + 2, 2 + 5, 2]);
  });

  it('R11.2 a measure of 0 never wins', () => {
    const s = newWwGame(3);
    s.table.honours = ['th-halls'];
    expect(honourStandings(fx, s)).toEqual([{ honour: 'th-halls', best: 0, leaders: [] }]);
    expect(honourScore(fx, s, 0)).toBe(0);
  });

  it('R11.3 the leaders are known all game, from public information (any view)', () => {
    const s = town3();
    for (const viewer of [0, 2, 'spectator'] as const) {
      expect(honourStandings(fx, viewFor(fxRuleset, s, viewer))).toEqual(honourStandings(fx, s));
    }
  });

  it('R11.4 and R11.5 the measures', () => {
    const s = newWwGame(3);
    for (const def of [
      'tf-hut',
      'tf-hut',
      'tf-shrine',
      'tf-stall',
      'tf-fence',
      'tf-lore-1',
      'tf-lore-2',
      'tf-lore-4',
      'tf-mark-halls',
    ]) {
      build(s, 0, def);
    }
    setGreatWork(s, 0, 'tg-crown'); // Perk guard 1
    townData(s, 0).tiers = 1;
    townData(s, 0).valour = [1, 3];
    const values = Object.fromEntries(MEASURES.map((m) => [m, measure(fx, s, 0, m)]));
    expect(values).toEqual({
      guard: 2,
      holdings: 2,
      halls: 1,
      markets: 1,
      watches: 1,
      lore: 3,
      landmarks: 1,
      loreRun: 2,
      tiers: 1,
      coins: 5 + 3, // the Stall paid 3
      kinds: 6,
      valour: 2, // tokens, not their values
    });
  });
});
