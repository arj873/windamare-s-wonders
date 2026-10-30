import { describe, expect, it } from 'vitest';
import { continueAfter } from '../core/flow';
import { resolveRaid } from './raid';
import { build, ctxOf, fx, newWwGame, setGreatWork, toSeason, townData } from './testing/helpers';
import { guardOf } from './town';
import type { WwState } from './types';

/** 3 towns in Summer (Raid strength 3, Valour 2). */
function summer(seats = 3): WwState {
  const s = newWwGame(seats);
  toSeason(s, 1);
  return s;
}

describe('Raids (R9)', () => {
  it('R7.5 and R9.2 Guard sums guard effects on uncovered cards (Watches), tiers and the Perk', () => {
    const s = summer();
    const fence = build(s, 0, 'tf-fence');
    build(s, 0, 'tf-fence');
    expect(guardOf(fx, s, 0)).toBe(2);
    build(s, 0, 'tf-tower', fence.id); // covers one fence: 1 + 2
    expect(guardOf(fx, s, 0)).toBe(3);
    setGreatWork(s, 0, 'tg-crown'); // Perk guard 1
    townData(s, 0).labour = 18;
    townData(s, 0).tiers = 4; // tier IV guard 1
    expect(guardOf(fx, s, 0)).toBe(5);
  });

  it("R9.4 a town that holds gains a Valour token worth the Season's value", () => {
    const s = summer();
    build(s, 0, 'tf-tower');
    build(s, 0, 'tf-fence');
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 0).valour).toEqual([2]);
  });

  it('R9.5 a plundered town loses 1 coin per point short, at most all its coins, and nothing else', () => {
    const s = summer();
    build(s, 1, 'tf-fence'); // short 2
    townData(s, 2).coins = 1; // short 3, has 1
    townData(s, 2).store.flint = 4;
    townData(s, 2).labour = 2;
    const out = resolveRaid(fx, ctxOf(s));
    expect(out).toEqual(['plundered', 'plundered', 'plundered']);
    expect(townData(s, 1).coins).toBe(3);
    expect(townData(s, 2).coins).toBe(0);
    expect(townData(s, 2).store.flint).toBe(4);
    expect(townData(s, 2).labour).toBe(2);
    expect(s.seats[1]!.tableau).toHaveLength(1);
    expect(townData(s, 1).valour).toEqual([]);
  });

  it('R9.6 after all plunder, each plundered neighbour pays a held town 1 coin', () => {
    const s = summer();
    build(s, 0, 'tf-fence');
    build(s, 0, 'tf-fence');
    build(s, 0, 'tf-fence'); // guard 3: holds
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 0).coins).toBe(5 + 2);
    expect(townData(s, 1).coins).toBe(5 - 3 - 1); // plunder, then the bounty to seat 0
    expect(townData(s, 2).coins).toBe(5 - 3 - 1);
  });

  it('R9.6 a plundered town pays from the coins it has left, its left neighbour first', () => {
    const s = summer(4);
    for (const seat of [0, 2, 3]) for (let i = 0; i < 3; i++) build(s, seat, 'tf-fence');
    townData(s, 1).coins = 4; // plundered for 3: 1 coin left, for its left neighbour (seat 2)
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 1).coins).toBe(0);
    expect(townData(s, 2).coins).toBe(6);
    expect(townData(s, 0).coins).toBe(5);
  });

  it('R9.6 with 2 towns the bounty is at most 1 (the neighbour counts once, R14.5)', () => {
    const s = summer(2);
    for (let i = 0; i < 3; i++) build(s, 0, 'tf-fence');
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 0).coins).toBe(6);
    expect(townData(s, 1).coins).toBe(1);
  });

  it("R9.3 every town compares at once: later seats' plunder still pays an earlier seat's bounty", () => {
    const s = summer(4);
    for (let i = 0; i < 3; i++) build(s, 0, 'tf-fence'); // seat 0 holds; neighbours 1 and 3
    for (let i = 0; i < 3; i++) build(s, 1, 'tf-fence'); // seat 1 holds
    const out = resolveRaid(fx, ctxOf(s));
    expect(out).toEqual(['held', 'held', 'plundered', 'plundered']);
    expect(townData(s, 0).coins).toBe(5 + 1); // from seat 3
    expect(townData(s, 1).coins).toBe(5 + 1); // from seat 2
    expect(townData(s, 2).coins).toBe(5 - 3 - 1);
    expect(townData(s, 3).coins).toBe(5 - 3 - 1);
  });

  it('R9.7 Guard above the strength gives nothing more and is not used up', () => {
    const s = summer();
    build(s, 0, 'tf-tower');
    build(s, 0, 'tf-tower');
    build(s, 0, 'tf-fence'); // guard 5 vs 3; each Tower's held bonus +1
    for (const seat of [1, 2]) for (let i = 0; i < 3; i++) build(s, seat, 'tf-fence');
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 0).valour).toEqual([2]);
    expect(townData(s, 0).coins).toBe(5 + 2);
    toSeason(s, 2); // Autumn, strength 5: the same Guard holds again
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 0).valour).toEqual([2, 3]);
  });

  it('R17.6 a town with 0 coins loses nothing, gains no Valour and pays no bounty', () => {
    const s = summer();
    for (let i = 0; i < 3; i++) build(s, 0, 'tf-fence'); // seat 0 holds
    townData(s, 1).coins = 0;
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 1).coins).toBe(0);
    expect(townData(s, 1).valour).toEqual([]);
    expect(townData(s, 0).coins).toBe(5 + 1); // only seat 2 could pay
  });

  it('R13 heldBonus pays after the bounty, each time the town holds, from cards and tiers', () => {
    const s = summer();
    build(s, 0, 'tf-tower'); // guard 2, held +1
    setGreatWork(s, 0, 'tg-bell');
    townData(s, 0).tiers = 3; // tier III held +2
    build(s, 0, 'tf-fence'); // guard 3
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 0).coins).toBe(5 + 2 + 1 + 2);
    townData(s, 1).coins = 5; // a second Raid: the bonus pays again (seat 2 has no coin left)
    resolveRaid(fx, ctxOf(s));
    expect(townData(s, 0).coins).toBe(10 + 1 + 1 + 2);
  });

  it('R3.6 and R12.1 Winter ends with the Raid, then Season-end effects, then the game', () => {
    const s = newWwGame(2);
    toSeason(s, 3); // Winter, strength 7
    s.turn = s.roundPicks - 1; // the Season's last turn has resolved
    build(s, 0, 'tf-cellar'); // season end: 1 flint, 2 coins
    townData(s, 0).coins = 0;
    continueAfter(ctxOf(s), 'turn');
    // Plundered with 0 coins first (nothing lost), then the Cellar pays: the coins survive.
    expect(townData(s, 0).coins).toBe(2);
    expect(townData(s, 0).store.flint).toBe(1);
    expect(s.phase).toEqual({ kind: 'gameOver' });
    expect(s.result?.scores.map((x) => x.seat)).toEqual([0, 1]);
    const kinds = s.log.map((e) => e.kind);
    expect(kinds.indexOf('raidPlundered')).toBeLessThan(kinds.indexOf('gameOver'));
  });
});
