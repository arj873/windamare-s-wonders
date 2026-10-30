/** Whole games on the test fixture: random legal picks, from the deal to the final score. */
import { describe, expect, it } from 'vitest';
import { checkInvariants, Rng, type DraftAction } from '../core';
import { fxEngine as e, newGame } from './testing/helpers';
import type { WwState } from './types';

/** Play to the end with random legal picks; check soundness and view-safety on the way. */
function playout(
  seats: number,
  seed: number,
  checkViews: boolean,
): { end: WwState; actions: number } {
  const rng = new Rng(seed * 7919 + seats);
  let s = newGame(seats, seed);
  let actions = 0;
  while (s.phase.kind !== 'gameOver') {
    const waiting = e.waitingOn(s);
    expect(waiting.length).toBeGreaterThan(0);
    const seat = rng.pick(waiting);
    const legal = e.legalActions(s, seat).filter((a) => a.type !== 'unpick');
    expect(legal.length).toBeGreaterThan(0); // R17.2: a Spend is always legal
    if (checkViews) {
      const view = e.viewFor(s, seat);
      expect(e.legalActions(view, seat)).toEqual(e.legalActions(s, seat));
      expect(e.defaultAction(view, seat)).toEqual(e.defaultAction(s, seat));
    }
    const action: DraftAction = rng.pick(legal);
    const r = e.applyAction(s, action);
    if (!r.ok) throw new Error(`legal action rejected: ${r.error} ${JSON.stringify(action)}`);
    s = r.state;
    actions++;
    expect(checkInvariants(s)).toEqual([]);
  }
  return { end: s, actions };
}

describe('playouts (R3, R4, R12)', () => {
  for (const seats of [2, 3, 4, 5, 6, 7]) {
    it(`${seats} towns play 4 Seasons of 5 turns to a scored end`, () => {
      const { end, actions } = playout(seats, seats, seats <= 4);
      expect(actions).toBe(4 * 5 * seats);
      expect(end.result?.scores).toHaveLength(seats);
      expect(end.result?.ranking.flat().sort()).toEqual(end.seats.map((x) => x.id));
      for (const town of end.seats) {
        expect(town.hand).toEqual([]);
        expect(town.data.coins).toBeGreaterThanOrEqual(0);
        expect(Object.values(town.data.store).every((n) => n >= 0)).toBe(true);
      }
      expect(end.table.raids.every((r) => r.revealed)).toBe(true);
    });
  }

  it('random games use the whole turn: builds, purchases, gleans, tolls, upgrades', () => {
    const kinds = new Map<string, number>();
    let upgrades = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { end } = playout(4, 100 + seed, false);
      for (const l of end.log) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
      upgrades += end.seats.reduce((n, s) => n + s.data.covers.length, 0);
    }
    expect(kinds.get('glean')).toBe(8 * 4 * 4); // one a town each Season (R3.5)
    for (const k of ['spend', 'build', 'sale', 'toll', 'raidHeld', 'raidPlundered']) {
      expect(kinds.get(k) ?? 0, k).toBeGreaterThan(0);
    }
    expect(upgrades).toBeGreaterThan(0);
  });

  it('the same seed and picks give the same game; a game survives a JSON round trip', () => {
    const a = playout(4, 11, false).end;
    const b = playout(4, 11, false).end;
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});
