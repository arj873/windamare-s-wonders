import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../core';
import { viewFor } from '../core/view';
import { buildCost, checkBuildRules, COVERED } from './build';
import { scoreTown } from './score';
import { build, fx, fxRuleset, newWwGame, townData } from './testing/helpers';
import { countKind, coveredBy, guardOf, kindCounts, measure } from './town';

describe('Halls, upgrades and Landmarks (R7)', () => {
  it('R7.1 built cards stay in the town in build order', () => {
    const s = newWwGame(3);
    for (const def of ['tf-hut', 'tf-shrine', 'tf-fence', 'tf-shrine']) build(s, 0, def);
    expect(s.seats[0]!.tableau.map((c) => c.def)).toEqual([
      'tf-hut',
      'tf-shrine',
      'tf-fence',
      'tf-shrine',
    ]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('R7.3 a Hall is worth its printed Renown (Buildings, R12.2a)', () => {
    const s = newWwGame(3);
    build(s, 0, 'tf-shrine');
    build(s, 0, 'tf-hall');
    expect(scoreTown(fx, s, 0).buildings).toBe(6);
  });

  it('R7.8 at most one copy of each Landmark per town; other cards may repeat', () => {
    const s = newWwGame(3);
    build(s, 0, 'tf-mark-halls');
    expect(checkBuildRules(fx, s, 0, 'tf-mark-halls', null)).toBe(
      'tf-mark-halls is already in your town',
    );
    expect(checkBuildRules(fx, s, 1, 'tf-mark-halls', null)).toBeNull();
    build(s, 0, 'tf-shrine');
    expect(checkBuildRules(fx, s, 0, 'tf-shrine', null)).toBeNull();
  });

  it('R7.9 an upgrade covers the uncovered card it names, for its upgrade cost', () => {
    const s = newWwGame(3);
    const shrine = build(s, 0, 'tf-shrine');
    expect(buildCost(fx, 'tf-hall', shrine.id)).toEqual({ slate: 1 });
    expect(buildCost(fx, 'tf-hall', null)).toEqual({ reed: 2, slate: 1 });
    const hall = build(s, 0, 'tf-hall', shrine.id);
    const town = s.seats[0]!;
    expect(town.tableau).toEqual([hall]);
    expect(town.zones[COVERED]).toEqual([shrine]);
    expect(town.data.covers).toEqual([{ card: shrine.id, by: hall.id }]);
    expect(coveredBy(s, 0, shrine.id)).toBe(hall.id);
    // The covered card has no effects, no Renown and does not count.
    expect(scoreTown(fx, s, 0).buildings).toBe(4);
    expect(countKind(fx, s, 0, 'hall')).toBe(1);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('R7.9 an upgrade must name an uncovered card of its own town that it upgrades', () => {
    const s = newWwGame(3);
    const shrine = build(s, 0, 'tf-shrine');
    const fence = build(s, 0, 'tf-fence');
    const other = build(s, 1, 'tf-shrine');
    expect(checkBuildRules(fx, s, 0, 'tf-hall', fence.id)).toBe(
      'tf-hall does not upgrade tf-fence',
    );
    expect(checkBuildRules(fx, s, 0, 'tf-hall', other.id)).toBe(
      `card ${other.id} is not an uncovered card in your town`,
    );
    expect(checkBuildRules(fx, s, 0, 'tf-shrine', shrine.id)).toBe('tf-shrine upgrades nothing');
    build(s, 0, 'tf-hall', shrine.id);
    // A covered card cannot be covered again or uncovered.
    expect(checkBuildRules(fx, s, 0, 'tf-hall', shrine.id)).toBe(
      `card ${shrine.id} is not an uncovered card in your town`,
    );
    expect(() => build(s, 0, 'tf-hall', fence.id)).toThrow('does not upgrade');
  });

  it('R7.9 the upgrade card may instead be built at full cost, covering nothing', () => {
    const s = newWwGame(3);
    build(s, 0, 'tf-shrine');
    build(s, 0, 'tf-hall');
    expect(s.seats[0]!.zones[COVERED]).toEqual([]);
    expect(countKind(fx, s, 0, 'hall')).toBe(2);
  });

  it('R7.9 upgrade chains: each step covers the one before', () => {
    const s = newWwGame(3);
    const shrine = build(s, 0, 'tf-shrine');
    const hall = build(s, 0, 'tf-hall', shrine.id);
    const great = build(s, 0, 'tf-great-hall', hall.id);
    expect(s.seats[0]!.tableau).toEqual([great]);
    expect(s.seats[0]!.zones[COVERED]).toEqual([shrine, hall]);
    expect(scoreTown(fx, s, 0).buildings).toBe(7);
  });

  it('R7.10 every count of cards counts uncovered cards only', () => {
    const s = newWwGame(3);
    const shrine = build(s, 0, 'tf-shrine');
    build(s, 0, 'tf-fence');
    build(s, 0, 'tf-hall', shrine.id);
    expect(kindCounts(fx, s, 0)).toEqual({
      holding: 0,
      hall: 1,
      market: 0,
      watch: 1,
      lore: 0,
      landmark: 0,
    });
    expect(measure(fx, s, 0, 'halls')).toBe(1);
    expect(measure(fx, s, 0, 'kinds')).toBe(2);
  });

  it("R13.1 a covered card's effects stop acting", () => {
    const s = newWwGame(3);
    const fence = build(s, 0, 'tf-fence');
    expect(guardOf(fx, s, 0)).toBe(1);
    build(s, 0, 'tf-tower', fence.id);
    expect(guardOf(fx, s, 0)).toBe(2);
  });

  it('R17.7 covered cards still show in the town, to every viewer', () => {
    const s = newWwGame(3);
    const shrine = build(s, 0, 'tf-shrine');
    build(s, 0, 'tf-hall', shrine.id);
    for (const viewer of [1, 'spectator'] as const) {
      const town = viewFor(fxRuleset, s, viewer).seats[0]!;
      expect(town.zones[COVERED]).toEqual([shrine]);
      expect(town.data.covers).toEqual(s.seats[0]!.data.covers);
    }
  });

  it('R13 onBuild pays once, when the card is built', () => {
    const s = newWwGame(3);
    build(s, 0, 'tf-stall');
    expect(townData(s, 0).coins).toBe(8);
    build(s, 0, 'tf-shrine');
    expect(townData(s, 0).coins).toBe(8);
  });

  it("R17.8 onBuildPerKind counts the town's cards of the kind at that moment, itself included", () => {
    const s = newWwGame(3);
    build(s, 0, 'tf-stall'); // +3
    build(s, 0, 'tf-fair'); // 2 markets x 2 = +4
    expect(townData(s, 0).coins).toBe(5 + 3 + 4);
    build(s, 0, 'tf-strongbox'); // +6; the Fair does not pay again
    expect(townData(s, 0).coins).toBe(5 + 3 + 4 + 6);
  });
});
