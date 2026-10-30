/** The lookahead API (docs/ENGINE.md §16) on the toy ruleset. */
import { describe, expect, it } from 'vitest';
import { createLookahead } from './lookahead';
import { Rng } from './rng';
import { act, deepFreeze, newToyGame, toy, toyConfig } from './testing/helpers';
import { toyRuleset, type ToyState } from './testing/toy';
import type { Pick } from './types';

const la = createLookahead(toyRuleset);

/** What a lookahead keeps: everything but the log and the action counter. */
const comparable = (s: ToyState) => ({ ...s, log: [], seq: 0 });

/** One random legal pick per seat that holds cards (null for the others). */
function randomPicks(s: ToyState, rng: Rng): (Pick | null)[] {
  return s.seats.map((x) => (x.hand.length > 0 ? rng.pick(toy.legalPicks(s, x.id)) : null));
}

/** The same turn through applyAction: the picks, then every prompt's default answer. */
function engineTurn(s: ToyState, picks: (Pick | null)[]): { state: ToyState; prompts: number } {
  let state = s;
  let prompts = 0;
  for (const [seat, pick] of picks.entries())
    if (pick) state = act(state, { type: 'pick', seat, pick });
  while (state.phase.kind === 'prompt') {
    const seat = toy.waitingOn(state)[0];
    const action = seat === undefined ? null : toy.defaultAction(state, seat);
    if (!action) throw new Error('stuck in a prompt');
    state = act(state, action);
    prompts += 1;
  }
  return { state, prompts };
}

describe('lookahead (docs/ENGINE.md §16)', () => {
  it('playTurn on a fork resolves a turn exactly as applyAction does, prompts included', () => {
    let prompts = 0;
    for (const seats of [2, 3, 5]) {
      for (let seed = 1; seed <= 6; seed++) {
        const rng = new Rng(seed * 31 + seats);
        let s = toy.createGame(toyConfig(seats, { rounds: 3 }, seed));
        while (s.phase.kind === 'pick') {
          const picks = randomPicks(s, rng);
          const sim = la.playTurn(la.fork(s), picks);
          const real = engineTurn(s, picks);
          expect(comparable(sim)).toEqual(comparable(real.state));
          prompts += real.prompts;
          s = real.state;
        }
        expect(s.phase.kind).toBe('gameOver');
      }
    }
    expect(prompts).toBeGreaterThan(0); // the salvage prompt came up and was settled
  });

  it('fork copies: playing on the fork never touches the original', () => {
    const s = deepFreeze(newToyGame(4));
    const f = la.fork(s);
    expect(() => la.playOut(f, 'game')).not.toThrow(); // a frozen original would throw
    expect(f.phase.kind).toBe('gameOver');
    expect(s.phase.kind).toBe('pick');
  });

  it('playOut stops after one turn, at the end of the round, or at the end of the game', () => {
    const s = newToyGame(3);
    expect(la.playOut(la.fork(s), 'turn').turn).toBe(1);
    const round = la.playOut(la.fork(s), 'round');
    expect([round.round, round.turn, round.phase.kind]).toEqual([1, 0, 'pick']);
    const end = la.playOut(la.fork(s), 'game');
    expect(end.phase.kind).toBe('gameOver');
    expect(end.result?.scores).toHaveLength(3);
    expect(end.log).toEqual([]); // a lookahead writes no log
  });

  it('playTurn fills a pick without args with the ruleset defaults and a null with its default pick', () => {
    const s = newToyGame(3);
    const first = (seat: number) => s.seats[seat]?.hand[0]?.id ?? -1;
    const sim = la.playTurn(la.fork(s), [null, { card: first(1), use: 'sell' }, null]);
    const real = engineTurn(
      s,
      [0, 1, 2].map((seat) => toy.defaultPick(s, seat)),
    );
    expect(comparable(sim)).toEqual(comparable(real.state));
  });

  it('determinize needs one seat view in the pick phase', () => {
    const s = newToyGame(3);
    const rng = new Rng(1);
    expect(() => la.determinize(s as never, rng)).toThrow('needs a seat view');
    expect(() => la.determinize(toy.viewFor(s, 'spectator'), rng)).toThrow('spectator');
    const opening = toy.createGame(toyConfig(3, { opening: true }));
    expect(() => la.determinize(toy.viewFor(opening, 0), rng)).toThrow('pick phase');
    expect(() => la.fork(toy.viewFor(s, 0))).toThrow('got a view');
    expect(() => la.playTurn(toy.viewFor(s, 0), [])).toThrow('got a view');
  });

  it('determinize keeps what the seat sees and deals the hidden hands from the unseen cards', () => {
    let s = newToyGame(4);
    s = engineTurn(
      s,
      [0, 1, 2, 3].map((seat) => toy.defaultPick(s, seat)),
    ).state;
    const view = toy.viewFor(s, 2);
    const d = la.determinize(view, new Rng(9));
    expect('view' in d).toBe(false);
    expect(d.seats[2]?.hand).toEqual(s.seats[2]?.hand);
    expect(d.seats.map((x) => x.hand.length)).toEqual(s.seats.map((x) => x.hand.length));
    expect(d.seats.map((x) => x.tableau)).toEqual(s.seats.map((x) => x.tableau));
    expect(d.seats.map((x) => x.data)).toEqual(s.seats.map((x) => x.data));
    // Fresh ids for the sampled cards, all unique.
    const ids = d.seats.flatMap((x) => [...x.hand, ...x.tableau, ...Object.values(x.zones).flat()]);
    expect(new Set(ids.map((c) => c.id)).size).toBe(ids.length);
    expect(ids.every((c) => c.id >= 0 && c.id < d.nextCardId)).toBe(true);
    // The sampled hands come from the round's cards less the revealed picks.
    const deck = toyRuleset.roundSpec(s, 0).deck;
    const shown = s.lastReveal?.picks.map((p) => p.card.def) ?? [];
    const dealt = d.seats.flatMap((x) => x.hand.map((c) => c.def));
    for (const def of new Set(dealt)) {
      const left = deck.filter((x) => x === def).length - shown.filter((x) => x === def).length;
      expect(dealt.filter((x) => x === def).length).toBeLessThanOrEqual(left);
    }
    // Same view and rng, same sample; and the sample plays to the end.
    expect(la.determinize(view, new Rng(9))).toEqual(d);
    expect(la.playOut(d, 'game').phase.kind).toBe('gameOver');
  });
});
