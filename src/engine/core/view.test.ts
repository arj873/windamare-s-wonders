/** Hidden information: what viewFor shows and, above all, what it must not leak. */
import { describe, expect, it } from 'vitest';
import { createDraftEngine } from './engine';
import { Rng } from './rng';
import { act, newToyGame, pickAll, toy, toyConfig, withHand } from './testing/helpers';
import { toyRuleset, type ToySeat, type ToyState, type ToyTable } from './testing/toy';
import type { Card, Ruleset, Viewer } from './types';
import { HIDDEN_CARD, HIDDEN_SEED, isDraftView } from './view';

const clone = (s: ToyState) => JSON.parse(JSON.stringify(s)) as ToyState;

/** A mid-game state (round 0 or 1) with stashes and a discard, where seats 1 and 3 have picked. */
function busyState(seed: number): ToyState {
  const rng = new Rng(seed);
  let s = newToyGame(4, undefined, seed);
  const steps = 3 + rng.int(10);
  for (let i = 0; i < steps; i++) {
    s = act(s, rng.pick(toy.legalActions(s).filter((a) => a.type !== 'unpick')));
  }
  // Finish the turn (and any prompt) by default moves, to the start of a fresh turn.
  while (s.phase.kind !== 'pick' || toy.waitingOn(s).length < 4) {
    s = act(s, toy.defaultAction(s, toy.waitingOn(s)[0]!)!);
  }
  for (const seat of [1, 3]) {
    s = act(s, { type: 'pick', seat, pick: rng.pick(toy.legalPicks(s, seat)) });
  }
  return s;
}

/**
 * Change everything `viewer` must not know: shuffle the cards of every list hidden from it
 * (keeping each list's length), re-point hidden picks, change rng, seed and private log texts.
 */
function scrambleHidden(s: ToyState, viewer: Viewer, seed: number): ToyState {
  const out = clone(s);
  const rng = new Rng(seed);
  const own = (seat: number) => viewer === seat;
  const lists: Card[][] = [out.deck, out.box, out.discard];
  for (const seat of out.seats) {
    if (own(seat.id)) continue;
    lists.push(seat.hand, seat.zones.stash!);
  }
  const pool = rng.shuffle(lists.flat());
  let k = 0;
  for (const list of lists) for (let i = 0; i < list.length; i++) list[i] = pool[k++]!;
  for (const seat of out.seats) {
    if (!own(seat.id) && seat.pick)
      seat.pick = { card: seat.hand[seat.hand.length - 1]!.id, use: 'stash' };
  }
  out.rng = [1, 2, 3, 4];
  out.config = { ...out.config, seed: 'another' };
  out.log = out.log.map((e) =>
    e.to && !(typeof viewer === 'number' && e.to.includes(viewer)) ? { ...e, text: 'x' } : e,
  );
  return out;
}

describe('viewFor', () => {
  it('a view depends only on what the viewer may know (leak test)', () => {
    const cardsOf = (x: ToyState, viewer: Viewer) =>
      JSON.stringify(x.seats.filter((seat) => seat.id !== viewer).map((seat) => seat.hand));
    let scrambledHands = 0;
    let stashes = 0;
    let cases = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = busyState(seed);
      stashes += s.seats.filter((seat) => seat.zones.stash!.length > 0).length;
      for (const viewer of [0, 1, 2, 3, 'spectator'] as Viewer[]) {
        const scrambled = scrambleHidden(s, viewer, seed * 31);
        cases++;
        if (cardsOf(scrambled, viewer) !== cardsOf(s, viewer)) scrambledHands++;
        expect(toy.viewFor(scrambled, viewer)).toEqual(toy.viewFor(s, viewer));
      }
    }
    // The scramble really moved hidden cards, and the states really had stashes to hide.
    expect(scrambledHands).toBeGreaterThan(cases * 0.9);
    expect(stashes).toBeGreaterThan(5);
  });

  it('masks other hands, picks, deck, box, discard, rng and seed; keeps counts', () => {
    const s = busyState(3);
    const v = toy.viewFor(s, 0);
    expect(isDraftView(v)).toBe(true);
    expect(isDraftView(s)).toBe(false);
    expect(v.view.viewer).toBe(0);
    expect(v.seats[0]!.hand).toEqual(s.seats[0]!.hand);
    for (const seat of [1, 2, 3]) {
      expect(v.seats[seat]!.hand).toEqual(
        s.seats[seat]!.hand.map((_, i) => ({ id: -1 - i, def: HIDDEN_CARD })),
      );
      expect(v.seats[seat]!.pick).toBeNull();
    }
    expect(v.view.handCounts).toEqual(s.seats.map((x) => x.hand.length));
    expect(v.view.submitted).toEqual(s.seats.map((x) => x.pick !== null));
    expect(v.deck.every((c) => c.def === HIDDEN_CARD)).toBe(true);
    expect(v.discard.every((c) => c.def === HIDDEN_CARD)).toBe(true);
    expect(v.view.discardCount).toBe(s.discard.length);
    expect(v.view.deckCount).toBe(s.deck.length);
    expect(v.rng).toEqual([0, 0, 0, 0]);
    expect(v.config.seed).toBe(HIDDEN_SEED);
    expect(v.seats.map((x) => x.tableau)).toEqual(s.seats.map((x) => x.tableau));
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('a spectator sees no hand, pick or stash', () => {
    const s = busyState(4);
    const v = toy.viewFor(s, 'spectator');
    expect(v.view.viewer).toBeNull();
    for (const seat of v.seats) {
      expect(seat.hand.every((c) => c.def === HIDDEN_CARD)).toBe(true);
      expect(seat.zones.stash!.every((c) => c.def === HIDDEN_CARD)).toBe(true);
      expect(seat.pick).toBeNull();
    }
  });

  it('owner-only zones: the owner sees them, everyone sees them at game over', () => {
    const s0 = withHand(newToyGame(2, { rounds: 1 }), 0, ['toy-lamp']);
    const lamp = s0.seats[0]!.hand[0]!;
    let s = pickAll(s0, (st, seat) =>
      seat === 0
        ? { card: lamp.id, use: 'stash' }
        : { card: st.seats[seat]!.hand[0]!.id, use: 'sell' },
    );
    expect(toy.viewFor(s, 0).seats[0]!.zones.stash).toEqual([lamp]);
    expect(toy.viewFor(s, 1).seats[0]!.zones.stash).toEqual([{ id: -1, def: HIDDEN_CARD }]);
    while (s.phase.kind !== 'gameOver') s = pickAll(s);
    expect(toy.viewFor(s, 1).seats[0]!.zones.stash).toEqual([lamp]);
    expect(toy.viewFor(s, 1).deck.every((c) => c.def === HIDDEN_CARD)).toBe(true);
  });

  it('honours a public discard, ruleset masks and private log entries', () => {
    const rules: Ruleset<ToySeat, ToyTable> = {
      ...toyRuleset,
      discardVisibility: 'public',
      maskSeat: (data, viewer, owner) => (viewer === owner ? data : { ...data, coins: -1 }),
      maskTable: (table, viewer) => (viewer === 'spectator' ? { trace: [] } : table),
      onGameStart: (ctx) => ctx.log(0, 'secret', 'only seat 0 and 2', { to: [0, 2] }),
    };
    const e = createDraftEngine(rules);
    let s = e.createGame(toyConfig(3));
    for (const seat of [0, 1, 2]) {
      const r = e.applyAction(s, {
        type: 'pick',
        seat,
        pick: { card: s.seats[seat]!.hand[0]!.id, use: 'sell' },
      });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const v1 = e.viewFor(s, 1);
    expect(v1.discard).toEqual(s.discard);
    expect(v1.seats.map((x) => x.data.coins)).toEqual([-1, s.seats[1]!.data.coins, -1]);
    expect(e.viewFor(s, 'spectator').table).toEqual({ trace: [] });
    expect(v1.table).toEqual(s.table);
    const secret = (v: Viewer) => e.viewFor(s, v).log.filter((x) => x.kind === 'secret').length;
    expect([secret(0), secret(1), secret(2), secret('spectator')]).toEqual([1, 0, 1, 0]);
  });

  it('throws on a missing seat and on a view', () => {
    const s = newToyGame(3);
    expect(() => toy.viewFor(s, 3)).toThrow(/no seat/);
    expect(() => toy.viewFor(toy.viewFor(s, 0), 0)).toThrow(/already a view/);
  });

  it('does not mutate the state', () => {
    const s = busyState(5);
    const text = JSON.stringify(s);
    toy.viewFor(s, 2);
    toy.viewFor(s, 'spectator');
    expect(JSON.stringify(s)).toBe(text);
  });
});
