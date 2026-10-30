/**
 * Random playouts of the toy ruleset: soundness of legalActions, view-safety, invariants,
 * determinism, JSON round trips and arrival-order independence (docs/ENGINE.md §2, §6).
 */
import { describe, expect, it } from 'vitest';
import { checkInvariants } from './invariants';
import { Rng } from './rng';
import { act, newToyGame, toy } from './testing/helpers';
import type { ToyState } from './testing/toy';
import type { DraftAction, Pick } from './types';

interface Playout {
  final: ToyState;
  steps: number;
}

/** Random legal moves until game over, checking the contract at every step. */
function playout(seats: number, seed: number, check: boolean): Playout {
  const rng = new Rng(seed);
  let s = newToyGame(seats, { opening: seed % 2 === 0, rounds: 2 + (seed % 2) }, seed);
  let steps = 0;
  while (s.phase.kind !== 'gameOver') {
    if (++steps > 1000) throw new Error('playout does not end');
    const waiting = toy.waitingOn(s);
    expect(waiting.length).toBeGreaterThan(0);
    const legal = toy.legalActions(s);
    expect(legal.length).toBeGreaterThan(0);
    if (check) {
      for (const a of legal) {
        const r = toy.applyAction(s, a);
        expect(r.ok, `${JSON.stringify(a)}: ${r.ok ? '' : r.error}`).toBe(true);
      }
      for (const seat of s.seats.map((x) => x.id)) {
        const view = toy.viewFor(s, seat);
        expect(toy.legalActions(view, seat)).toEqual(toy.legalActions(s, seat));
        expect(toy.defaultAction(view, seat)).toEqual(toy.defaultAction(s, seat));
        expect(toy.waitingOn(view)).toEqual(waiting);
      }
      expect(checkInvariants(s)).toEqual([]);
    }
    // Mostly real moves; now and then a withdrawal, to churn picks.
    const moves = legal.filter((a) => a.type !== 'unpick' && waiting.includes(a.seat));
    const unpicks = legal.filter((a) => a.type === 'unpick');
    const a = unpicks.length > 0 && rng.int(8) === 0 ? rng.pick(unpicks) : rng.pick(moves);
    s = act(s, a);
  }
  return { final: s, steps };
}

describe('random playouts', () => {
  it('every legal action is accepted, views give the same moves, invariants hold', () => {
    for (let seats = 2; seats <= 5; seats++) {
      for (let seed = 1; seed <= 4; seed++) {
        const { final } = playout(seats, seed, true);
        expect(final.result?.scores).toHaveLength(seats);
        expect(checkInvariants(final)).toEqual([]);
      }
    }
  });

  it('many games end with a result and conserve every card', () => {
    for (let seed = 100; seed < 160; seed++) {
      const seats = 2 + (seed % 4);
      const { final } = playout(seats, seed, false);
      expect(final.phase.kind).toBe('gameOver');
      expect(final.result?.winners.length).toBeGreaterThan(0);
      expect(checkInvariants(final)).toEqual([]);
    }
  });

  it('is deterministic: the same seed and moves give the same game', () => {
    expect(playout(4, 9, false).final).toEqual(playout(4, 9, false).final);
  });

  it('a JSON round trip mid-game plays on identically', () => {
    const rng = new Rng(5);
    let s = newToyGame(4, { opening: true }, 'json');
    let copy = JSON.parse(JSON.stringify(s)) as ToyState;
    while (s.phase.kind !== 'gameOver') {
      const legal = toy.legalActions(s).filter((a) => a.type !== 'unpick');
      const a = rng.pick(legal);
      s = act(s, a);
      copy = act(JSON.parse(JSON.stringify(copy)) as ToyState, a);
      expect(copy).toEqual(s);
    }
  });
});

describe('arrival order', () => {
  function permutations<T>(xs: T[]): T[][] {
    if (xs.length <= 1) return [xs];
    return xs.flatMap((x, i) =>
      permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
    );
  }

  it('the state after the reveal is the same for every arrival order', () => {
    const start = newToyGame(4, undefined, 'order');
    const rng = new Rng(3);
    const picks = new Map<number, Pick>(
      start.seats.map((s) => [s.id, rng.pick(toy.legalPicks(start, s.id))]),
    );
    const results = permutations([0, 1, 2, 3]).map((order) =>
      order.reduce((s, seat) => act(s, { type: 'pick', seat, pick: picks.get(seat)! }), start),
    );
    for (const r of results) expect(r).toEqual(results[0]);
    expect(results[0]!.turn).toBe(1);
  });

  it('earlier re-picks and withdrawals change nothing but seq', () => {
    const start = newToyGame(3, undefined, 'churn');
    const final = (s: ToyState, seat: number): Pick => ({
      card: s.seats[seat]!.hand[0]!.id,
      use: 'sell',
    });
    const direct = [0, 1, 2].reduce(
      (s, seat) => act(s, { type: 'pick', seat, pick: final(start, seat) }),
      start,
    );
    const other: Pick = { card: start.seats[1]!.hand[1]!.id, use: 'stash' };
    const churn: DraftAction[] = [
      { type: 'pick', seat: 1, pick: other },
      { type: 'pick', seat: 0, pick: final(start, 0) },
      { type: 'unpick', seat: 1 },
      { type: 'pick', seat: 1, pick: other },
      { type: 'pick', seat: 1, pick: final(start, 1) },
      { type: 'pick', seat: 2, pick: final(start, 2) },
    ];
    const churned = churn.reduce(act, start);
    expect({ ...churned, seq: 0, log: churned.log.map((e) => ({ ...e, seq: 0 })) }).toEqual({
      ...direct,
      seq: 0,
      log: direct.log.map((e) => ({ ...e, seq: 0 })),
    });
  });
});
