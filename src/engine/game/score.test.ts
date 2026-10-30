import { describe, expect, it } from 'vitest';
import { scoreGame } from '../core/flow';
import { CATEGORIES, scoreTown } from './score';
import { build, fx, fxRuleset, newWwGame, setGreatWork, townData } from './testing/helpers';
import type { WwState } from './types';

function bare(seats = 3): WwState {
  const s = newWwGame(seats);
  s.table.honours = [];
  return s;
}

describe('end scoring (R12)', () => {
  it('R12.2 a town scores the seven categories a to g', () => {
    const s = bare();
    build(s, 0, 'tf-shrine'); // a: 2
    build(s, 0, 'tf-strongbox'); // a: 1, +6 coins
    build(s, 0, 'tf-mark-halls'); // e: 2 per Hall = 2
    build(s, 0, 'tf-lore-1'); // d: 1
    townData(s, 0).valour = [1, 2]; // c: 3
    setGreatWork(s, 0, 'tg-crown');
    townData(s, 0).tiers = 2; // b: tier II renown 3
    s.table.honours = ['th-halls']; // f: sole leader, 5
    const score = scoreTown(fx, s, 0);
    expect(Object.keys(score)).toEqual([...CATEGORIES]);
    expect(score).toEqual({
      buildings: 3,
      greatWork: 3,
      valour: 3,
      lore: 1,
      landmarks: 2,
      honours: 5,
      treasury: 2, // g: 11 coins / 4
    });
  });

  it("R12.2b the Perk's and the tiers' scoring effects are Great Work Renown", () => {
    const s = bare();
    build(s, 0, 'tf-fence'); // guard 1 beats both neighbours (0)
    build(s, 0, 'tf-shrine');
    setGreatWork(s, 0, 'tg-bell');
    townData(s, 0).tiers = 2; // I renown 2, II 2 per Hall
    expect(scoreTown(fx, s, 0)).toMatchObject({
      greatWork: 2 * 2 + 2 + 2,
      buildings: 2,
      landmarks: 0,
    });
  });

  it('R7.7 and R12.2e each Landmark scores at game end by its condition', () => {
    const s = bare();
    const score = () => scoreTown(fx, s, 0).landmarks;
    build(s, 0, 'tf-mark-tiers');
    townData(s, 0).tiers = 3;
    expect(score()).toBe(6);
    build(s, 0, 'tf-mark-valour');
    townData(s, 0).valour = [1, 2, 3]; // per token, not per value
    expect(score()).toBe(6 + 3);
    build(s, 0, 'tf-mark-goods');
    Object.assign(townData(s, 0).store, { flint: 3, honey: 2 }); // 5 goods: 2 x 1
    expect(score()).toBe(6 + 3 + 2);
  });

  it('R12.2e scoreSets counts full sets of Holding, Hall, Market, Watch and Lore', () => {
    const s = bare();
    build(s, 0, 'tf-mark-sets');
    for (const def of ['tf-hut', 'tf-shrine', 'tf-stall', 'tf-fence']) build(s, 0, def);
    expect(scoreTown(fx, s, 0).landmarks).toBe(0);
    build(s, 0, 'tf-lore-1');
    expect(scoreTown(fx, s, 0).landmarks).toBe(3);
    build(s, 0, 'tf-shrine'); // a second Hall alone is no second set
    expect(scoreTown(fx, s, 0).landmarks).toBe(3);
  });

  it('R12.2e scoreBeat: per neighbour whose measure is strictly lower; with 2 towns, once (R14.5)', () => {
    const s = bare(3);
    build(s, 0, 'tf-mark-beat'); // 3 per neighbour beaten on Halls
    build(s, 0, 'tf-shrine');
    build(s, 0, 'tf-shrine');
    build(s, 1, 'tf-shrine');
    build(s, 2, 'tf-shrine');
    build(s, 2, 'tf-shrine'); // equal: not beaten
    expect(scoreTown(fx, s, 0).landmarks).toBe(3);
    const two = bare(2);
    build(two, 0, 'tf-mark-beat');
    build(two, 0, 'tf-shrine');
    expect(scoreTown(fx, two, 0).landmarks).toBe(3);
  });

  it('R12.2g 1 Renown per 4 coins, rounded down; goods score nothing', () => {
    const s = bare();
    townData(s, 0).coins = 11;
    Object.assign(townData(s, 0).store, { flint: 9, slate: 9 });
    expect(scoreTown(fx, s, 0)).toMatchObject({ treasury: 2, landmarks: 0 });
  });

  it('R12.3 the town with the most Renown wins', () => {
    const s = bare();
    build(s, 1, 'tf-shrine');
    expect(scoreGame(fxRuleset, s).winners).toEqual([1]);
  });

  it('R12.4 a tie goes to most completed tiers, then most coins, then is shared', () => {
    const s = bare(2);
    townData(s, 0).tiers = 1; // no Great Work: tiers only break the tie here
    expect(scoreGame(fxRuleset, s).winners).toEqual([0]);
    townData(s, 1).coins = 7; // 7 and 5 coins are both 1 Renown: tiers still come first
    expect(scoreGame(fxRuleset, s).winners).toEqual([0]);
    townData(s, 1).tiers = 1;
    expect(scoreGame(fxRuleset, s).winners).toEqual([1]);
    townData(s, 0).coins = 7;
    expect(scoreGame(fxRuleset, s).winners).toEqual([0, 1]);
    expect(scoreGame(fxRuleset, s).scores[0]!.tiebreak).toEqual([1, 7]);
  });

  it('R12.5 the full ranking uses the same order', () => {
    const s = bare(4);
    build(s, 2, 'tf-hall'); // 4
    build(s, 0, 'tf-shrine'); // 2
    build(s, 3, 'tf-shrine'); // 2, more coins
    townData(s, 3).coins = 6;
    expect(scoreGame(fxRuleset, s).ranking).toEqual([[2], [3], [0], [1]]);
  });
});
