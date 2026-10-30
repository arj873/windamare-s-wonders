/** The engine on the shipped content (design's src/content/windamere). */
import { describe, expect, it } from 'vitest';
import { checkInvariants, Rng } from '../core';
import { checkContent } from './content';
import { createWindamereEngine } from './engine';
import { windamereContent } from './shipped';
import type { WwState } from './types';

const engine = createWindamereEngine();

function playout(seats: number, seed: number): WwState {
  const rng = new Rng(seed);
  let s = engine.createGame({
    seed,
    seats: Array.from({ length: seats }, (_, i) => ({ name: `T${i}` })),
  });
  while (s.phase.kind !== 'gameOver') {
    const seat = rng.pick(engine.waitingOn(s));
    const legal = engine.legalActions(s, seat).filter((a) => a.type !== 'unpick');
    const view = engine.viewFor(s, seat);
    expect(engine.legalActions(view, seat)).toEqual(engine.legalActions(s, seat));
    const r = engine.applyAction(s, rng.pick(legal));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(checkInvariants(s)).toEqual([]);
  }
  return s;
}

describe('createWindamereEngine() on the shipped content', () => {
  it("the shipped content passes the engine's content check", () => {
    expect(checkContent(windamereContent())).toEqual([]);
  });

  it('starts with the Great Work choice and the real goods', () => {
    const s = engine.createGame({
      seed: 'x',
      seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    });
    expect(s.phase).toEqual({ kind: 'prompt', then: 'start' });
    expect(Object.keys(s.seats[0]!.data.store)).toEqual(['reed', 'peat', 'salt', 'wax', 'horn']);
  });

  for (const seats of [2, 3, 5, 7]) {
    it(`${seats} towns play a random game to a scored end`, () => {
      const end = playout(seats, seats * 31);
      expect(end.result?.scores).toHaveLength(seats);
      expect(end.seats.every((t) => t.data.greatWork !== null)).toBe(true);
    });
  }
});
