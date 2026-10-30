import { describe, expect, it } from 'vitest';
import { HIDDEN_CARD } from '../core';
import { viewFor } from '../core/view';
import { currentRaid } from './raid';
import { FIXTURE } from './testing/fixture';
import { fx, fxRuleset, newWwGame, toSeason } from './testing/helpers';
import { SEASONS } from './types';

describe('setup (R2) and what is public (R1.11)', () => {
  it('R2.2 each town starts with 5 coins, no goods, 0 labour, no Great Work', () => {
    const s = newWwGame(4);
    for (const seat of s.seats) {
      expect(seat.data).toEqual({
        coins: 5,
        store: { flint: 0, slate: 0, honey: 0 },
        labour: 0,
        greatWork: null,
        tiers: 0,
        valour: [],
        covers: [],
      });
    }
  });

  it('R2.3 three Honours of the pool are revealed, from the seeded RNG', () => {
    const pool = FIXTURE.honours.map((h) => h.id);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { honours } = newWwGame(3, seed).table;
      expect(honours).toHaveLength(3);
      expect(new Set(honours).size).toBe(3);
      for (const h of honours) expect(pool).toContain(h);
      honours.forEach((h) => seen.add(h));
      expect(newWwGame(3, seed).table.honours).toEqual(honours);
    }
    expect(seen.size).toBeGreaterThan(3);
    // Public: a spectator sees them.
    const s = newWwGame(3, 4);
    expect(viewFor(fxRuleset, s, 'spectator').table.honours).toEqual(s.table.honours);
  });

  it("R2.6 one Raid per Season, drawn from that Season; only Spring's is revealed", () => {
    const springIds = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { raids } = newWwGame(3, seed).table;
      expect(raids).toHaveLength(SEASONS.length);
      raids.forEach((r, season) => expect(fx.raid(r.id).season).toBe(SEASONS[season]));
      expect(raids.map((r) => r.revealed)).toEqual([true, false, false, false]);
      springIds.add(raids[0]!.id);
    }
    expect(springIds).toEqual(new Set(['tr-spring-a', 'tr-spring-b']));
  });

  it("R3.2 a Season's Raid is revealed at the start of that Season", () => {
    const s = newWwGame(3);
    toSeason(s, 2);
    expect(s.table.raids.map((r) => r.revealed)).toEqual([true, true, true, false]);
    expect(
      s.log.filter((e) => e.kind === 'raid').map((e) => (e.data as { season: number }).season),
    ).toEqual([0, 1, 2]);
  });

  it("R1.11 later Seasons' Raids are hidden from every viewer; revealed ones are public", () => {
    const s = newWwGame(3);
    toSeason(s, 1);
    for (const viewer of [0, 1, 2, 'spectator'] as const) {
      const raids = viewFor(fxRuleset, s, viewer).table.raids;
      expect(raids.slice(0, 2)).toEqual(s.table.raids.slice(0, 2));
      expect(raids.slice(2)).toEqual([
        { id: HIDDEN_CARD, revealed: false },
        { id: HIDDEN_CARD, revealed: false },
      ]);
    }
    // The leak check: which Raids lie face down does not change any view.
    const other = structuredClone(s);
    other.table.raids[3]!.id = other.table.raids[3]!.id === 'tr-winter' ? 'tr-autumn' : 'tr-winter';
    expect(viewFor(fxRuleset, other, 0)).toEqual(viewFor(fxRuleset, s, 0));
  });

  it("R9.1 the current Season's Raid strength is public from the Season's start", () => {
    const s = newWwGame(3);
    toSeason(s, 1);
    expect(currentRaid(fx, s)).toEqual(fx.raid('tr-summer'));
    expect(currentRaid(fx, viewFor(fxRuleset, s, 'spectator'))?.strength).toBe(3);
  });
});
