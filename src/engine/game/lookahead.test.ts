/** Lookahead on Windamere (docs/ENGINE.md §16): the fixture's game, sampled from one town's view. */
import { describe, expect, it } from 'vitest';
import { createLookahead, passTarget, Rng, type Pick, type SeatId } from '../core';
import { fxEngine as e, fx, newGame } from './testing/helpers';
import { SEASONS, type WwState } from './types';

const la = createLookahead(e.ruleset);

const comparable = (s: WwState) => ({ ...s, log: [], seq: 0 });
const faces = (cards: readonly { def: string }[]) => cards.map((c) => c.def).sort();

function randomPicks(s: WwState, rng: Rng): (Pick | null)[] {
  return s.seats.map((x) => (x.hand.length > 0 ? rng.pick(e.legalPicks(s, x.id)) : null));
}

function engineTurn(s: WwState, picks: (Pick | null)[]): WwState {
  let state = s;
  for (const [seat, pick] of picks.entries()) {
    if (!pick) continue;
    const r = e.applyAction(state, { type: 'pick', seat, pick });
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

/** Every pick-phase state of one game with random legal picks. */
function* game(seats: number, seed: number): Generator<WwState> {
  const rng = new Rng(seed * 101 + seats);
  let s = newGame(seats, seed);
  while (s.phase.kind === 'pick') {
    yield s;
    s = engineTurn(s, randomPicks(s, rng));
  }
}

/** The seat `k` passes along from `seat` this round. */
function along(s: WwState, seat: SeatId, k: number): SeatId {
  let at = seat;
  for (let i = 0; i < k; i++) at = passTarget(s, at);
  return at;
}

describe('lookahead on Windamere (docs/ENGINE.md §16)', () => {
  for (const seats of [2, 3, 5, 7]) {
    it(`${seats} towns: a lookahead turn is the engine's turn, Season ends and scoring included`, () => {
      const rng = new Rng(seats);
      let turns = 0;
      for (const s of game(seats, seats + 40)) {
        const picks = randomPicks(s, rng);
        expect(comparable(la.playTurn(la.fork(s), picks))).toEqual(
          comparable(engineTurn(s, picks)),
        );
        turns += 1;
      }
      expect(turns).toBe(4 * 5);
    });
  }

  it('R14.2 a 2-town pick without args gets the default Burn', () => {
    const s = newGame(2, 3);
    const picks = [0, 1].map((seat) => {
      const first = s.seats[seat]?.hand[0];
      return { card: first?.id ?? -1, use: 'spend' };
    });
    const sim = la.playTurn(la.fork(s), picks);
    expect(comparable(sim)).toEqual(comparable(engineTurn(s, picks)));
    expect(sim.seats.map((x) => x.hand.length)).toEqual([8, 8]); // picked one, burned one
  });

  for (const seats of [2, 3, 4, 7]) {
    it(`R15.8 ${seats} towns: hands the town passed on are exact, the rest come from unseen cards`, () => {
      let checked = 0;
      for (const s of game(seats, seats + 7)) {
        const me = (s.turn + s.round) % seats;
        const d = la.determinize(e.viewFor(s, me), new Rng(s.turn * 13 + s.round));
        expect([d.round, d.turn, d.phase.kind]).toEqual([s.round, s.turn, 'pick']);
        expect(d.seats[me]?.hand).toEqual(s.seats[me]?.hand);
        expect(d.seats.map((x) => x.hand.length)).toEqual(s.seats.map((x) => x.hand.length));
        expect(d.seats.map((x) => x.tableau)).toEqual(s.seats.map((x) => x.tableau));
        expect(d.seats.map((x) => x.data)).toEqual(s.seats.map((x) => x.data));
        expect(d.seats.every((x) => x.pick === null)).toBe(true);
        // The hand passed k turns ago is k seats along, less the picks since: known exactly.
        for (let k = 1; k <= Math.min(s.turn, seats - 1); k++) {
          const at = along(s, me, k);
          expect(faces(d.seats[at]?.hand ?? [])).toEqual(faces(s.seats[at]?.hand ?? []));
          checked += 1;
        }
        // Every card in a hand is a card of this Season the town has not seen leave.
        const deck = e.ruleset.roundSpec(s, s.round).deck;
        const gone = s.log
          .filter((l) => l.kind === 'reveal' && l.round === s.round)
          .flatMap((l) => (l.data as { card: string }[]).map((p) => p.card));
        const held = d.seats.flatMap((x) => x.hand.map((c) => c.def));
        for (const def of new Set(held)) {
          const left = deck.filter((x) => x === def).length - gone.filter((x) => x === def).length;
          expect(held.filter((x) => x === def).length).toBeLessThanOrEqual(left);
        }
        const ids = d.seats.flatMap((x) => [...x.hand, ...x.tableau, ...x.zones.covered!]);
        expect(new Set(ids.map((c) => c.id)).size).toBe(ids.length);
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it('R2.6 face-down Raids are drawn again from their Season; face-up ones stay', () => {
    const s = newGame(3, 5);
    for (let seed = 1; seed <= 20; seed++) {
      const d = la.determinize(e.viewFor(s, 0), new Rng(seed));
      d.table.raids.forEach((raid, season) => {
        const real = s.table.raids[season];
        expect(raid.revealed).toBe(real?.revealed);
        if (real?.revealed) expect(raid.id).toBe(real.id);
        else expect(fx.raid(raid.id).season).toBe(SEASONS[season]);
      });
    }
  });

  it('determinize reads only the view: other hidden cards and Raids give the same sample', () => {
    const s = newGame(4, 2);
    const other = structuredClone(s);
    const [a, b] = [other.seats[1]!.hand[0]!, other.seats[3]!.hand[2]!];
    [a.def, b.def] = [b.def, a.def];
    const winter = other.table.raids[3]!;
    winter.id = fx.content.raids.find((r) => r.id !== winter.id)!.id; // hidden: any id will do
    expect(e.viewFor(other, 0)).toEqual(e.viewFor(s, 0));
    expect(la.determinize(e.viewFor(other, 0), new Rng(3))).toEqual(
      la.determinize(e.viewFor(s, 0), new Rng(3)),
    );
    // A different rng deals the unseen hands differently.
    const hands = (seed: number) =>
      la.determinize(e.viewFor(s, 0), new Rng(seed)).seats.map((x) => faces(x.hand));
    expect(
      new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(hands(seed)))).size,
    ).toBeGreaterThan(1);
  });

  it('a sample plays on to a scored end, and to the end of its Season', () => {
    for (const seats of [2, 3, 5, 7]) {
      const s = newGame(seats, 11);
      const view = e.viewFor(s, 0);
      const season = la.playOut(la.determinize(view, new Rng(1)), 'round');
      expect([season.round, season.turn]).toEqual([1, 0]);
      expect(season.table.raids[1]?.revealed).toBe(true); // Summer began: its Raid is up
      const end = la.playOut(la.determinize(view, new Rng(2)), 'game');
      expect(end.result?.scores).toHaveLength(seats);
    }
  });
});
