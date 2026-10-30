/**
 * D10b's effect types (RULES.md R13 "Pending"): onBuildNeighbourMin, scoreNeighbourMin,
 * scoreSales. Test cards with counts 0 join the fixture, so its decks and deals stay the same.
 */
import { describe, expect, it } from 'vitest';
import { Rng, type Card, type Pick, type SeatId } from '../core';
import { makeCtx } from '../core/ctx';
import { CARDS, PENDING_CARDS, PENDING_SWAPS } from '../../content/windamere';
import { placeBuild } from './build';
import { checkContent, compileContent } from './content';
import { createWindamereEngine } from './engine';
import { windamereRuleset } from './ruleset';
import { scoreTown } from './score';
import { windamereContent } from './shipped';
import { FIXTURE, FX_CARDS } from './testing/fixture';
import { build, newGame, newWwGame, setHand, townData } from './testing/helpers';
import type { WwCardDef, WwContent, WwState } from './types';

const extra = (id: string, kind: WwCardDef['kind'], more: Partial<WwCardDef>): WwCardDef => ({
  id,
  name: id,
  kind,
  season: 'summer',
  cost: {},
  spend: { coins: 1 },
  effects: [],
  counts: [0, 0, 0, 0, 0],
  ...more,
});
const EXTRA: WwCardDef[] = [
  extra('tx-fair', 'market', {
    effects: [{ type: 'onBuildNeighbourMin', kind: 'holding', gains: { coins: 2 } }],
  }),
  extra('tx-commons', 'landmark', {
    effects: [{ type: 'scoreNeighbourMin', measure: 'holdings', amount: 2 }],
  }),
  extra('tx-arcade', 'landmark', { effects: [{ type: 'scoreSales', per: 3, amount: 2 }] }),
  // A Watch that covers a Holding: an upgrade across kinds.
  extra('tx-watchhouse', 'watch', { upgrade: { of: ['tf-hut'], cost: {} } }),
];
const CONTENT: WwContent = { ...FIXTURE, cards: [...FX_CARDS, ...EXTRA] };
const rules = compileContent(CONTENT);
const e = createWindamereEngine(CONTENT);

/** 3 towns at their first pick, hands of free Stalls, empty stores, no Great Work. */
function table(seats = 3): WwState {
  const s = structuredClone(newGame(seats, 1));
  for (const t of s.seats) {
    setHand(s, t.id, Array(6).fill('tf-stall') as string[]);
    t.data.store = { flint: 0, slate: 0, honey: 0 };
    t.data.greatWork = null;
  }
  return s;
}

/** Every town picks (`picks[seat]`, else Spend its first card); the state after the reveal. */
function turn(s: WwState, picks: Partial<Record<SeatId, Pick>>): WwState {
  let state = s;
  for (const t of s.seats) {
    const first = t.hand[0]!;
    const pick = picks[t.id] ?? { card: first.id, use: 'spend' };
    const r = e.applyAction(state, { type: 'pick', seat: t.id, pick });
    if (!r.ok) throw new Error(`seat ${t.id}: ${r.error}`);
    state = r.state;
  }
  return state;
}
const builds = (card: Card, cover?: number): Pick => ({
  card: card.id,
  use: 'build',
  ...(cover === undefined ? {} : { args: { cover } }),
});

/** A hand-built town for the scoring effects (no turn needed). */
function place(s: WwState, seat: SeatId, def: string): Card {
  const card = { id: s.nextCardId++, def };
  placeBuild(rules, makeCtx(windamereRuleset(rules), s, new Rng(1)), seat, card, null);
  return card;
}

describe('D10b effect types (R13 pending)', () => {
  it('R13 onBuildNeighbourMin: gains per card of the kind in the weaker neighbour; a tie counts it', () => {
    const s = table();
    build(s, 1, 'tf-pond');
    build(s, 1, 'tf-hut'); // seat 1: 2 Holdings
    build(s, 2, 'tf-hut'); // seat 2: 1 Holding, the weaker
    const fair = setHand(s, 0, ['tx-fair'])[0]!;
    expect(townData(turn(s, { 0: builds(fair) }), 0).coins).toBe(5 + 2);
    build(s, 2, 'tf-pond'); // a tie at 2: that number
    const fair2 = setHand(s, 0, ['tx-fair'])[0]!;
    expect(townData(turn(s, { 0: builds(fair2) }), 0).coins).toBe(5 + 4);
  });

  it('R14.5 onBuildNeighbourMin with 2 towns reads the one neighbour', () => {
    const s = table(2);
    build(s, 1, 'tf-pond');
    build(s, 1, 'tf-hut');
    build(s, 1, 'tf-quarry');
    const fair = setHand(s, 0, ['tx-fair'])[0]!;
    const burn = s.seats[0]!.hand[1]!.id;
    const after = turn(s, { 0: { ...builds(fair), args: { burn } } });
    expect(townData(after, 0).coins).toBe(5 + 6);
  });

  it('R4.8 onBuildNeighbourMin reads neighbours as they stood when the Build step began', () => {
    // Town 2 builds the Fair; its neighbours 1 and 0 place their Builds before it (seat order).
    const s = table();
    for (const def of ['tf-pond', 'tf-hut', 'tf-quarry']) build(s, 0, def); // 3 Holdings
    build(s, 1, 'tf-hut'); // 1 Holding, the weaker
    const fair = setHand(s, 2, ['tx-fair'])[0]!;
    // A Holding built this turn does not count yet: 1, not 2.
    const hut = setHand(s, 1, ['tf-hut'])[0]!;
    expect(townData(turn(s, { 1: builds(hut), 2: builds(fair) }), 2).coins).toBe(5 + 2);
    // A Holding covered this turn still counts: 1, not 0.
    const covered = s.seats[1]!.tableau.find((c) => c.def === 'tf-hut')!;
    const watch = setHand(s, 1, ['tx-watchhouse'])[0]!;
    const after = turn(s, { 1: builds(watch, covered.id), 2: builds(fair) });
    expect(after.seats[1]!.zones.covered).toEqual([covered]);
    expect(townData(after, 2).coins).toBe(5 + 2);
    // Lockstep: the town that resolves first sees the same (town 0's neighbours are 1 and 2).
    const t = table();
    for (const def of ['tf-pond', 'tf-hut', 'tf-quarry']) build(t, 2, def);
    build(t, 1, 'tf-hut');
    const fair0 = setHand(t, 0, ['tx-fair'])[0]!;
    const hut1 = setHand(t, 1, ['tf-hut'])[0]!;
    expect(townData(turn(t, { 0: builds(fair0), 1: builds(hut1) }), 0).coins).toBe(5 + 2);
  });

  it('R13 scoreNeighbourMin: Renown per point of the measure of the weaker neighbour', () => {
    const s = newWwGame(3, 1, rules);
    place(s, 0, 'tx-commons');
    expect(scoreTown(rules, s, 0).town).toBe(0); // no neighbour holds any
    for (const def of ['tf-pond', 'tf-hut', 'tf-quarry']) place(s, 1, def);
    place(s, 2, 'tf-hut');
    expect(scoreTown(rules, s, 0).town).toBe(2 * 1);
    place(s, 2, 'tf-pond');
    expect(scoreTown(rules, s, 0).town).toBe(2 * 2);
    const two = newWwGame(2, 1, rules);
    place(two, 0, 'tx-commons');
    for (const def of ['tf-pond', 'tf-hut', 'tf-quarry']) place(two, 1, def);
    expect(scoreTown(rules, two, 0).town).toBe(2 * 3);
  });

  it('R13 scoreSales and R6.7: filled sales count, goods the bank sold for a short seller do not', () => {
    // Town 0 builds a Quarry (1 flint) and buys the flint from town 1, which holds 1.
    const s = table();
    townData(s, 1).store.flint = 1;
    const quarry = setHand(s, 0, ['tf-quarry'])[0]!;
    const buy: Pick = {
      ...builds(quarry),
      args: { pay: [{ good: 'flint', via: 'buy', from: 1 }] },
    };
    expect(turn(s, { 0: buy }).seats.map((t) => t.data.sold)).toEqual([0, 1, 0]);
    // Town 1 pays its own Quarry with that flint first (step 2a): the bank fills the sale.
    const own = setHand(s, 1, ['tf-quarry'])[0]!;
    const short = turn(s, { 0: buy, 1: builds(own) });
    expect(short.seats.map((t) => t.data.sold)).toEqual([0, 0, 0]);
    expect(short.seats[0]!.tableau.map((c) => c.def)).toEqual(['tf-quarry']); // still built
    const score = newWwGame(3, 1, rules);
    place(score, 0, 'tx-arcade');
    for (const [n, renown] of [
      [0, 0],
      [2, 0],
      [3, 2],
      [7, 4],
    ] as const) {
      townData(score, 0).sold = n;
      expect(scoreTown(rules, score, 0).town).toBe(renown);
    }
  });

  it("design's staged D10b cards are valid content now, and play in whole games", () => {
    const shipped = windamereContent();
    const swapped = CARDS.map((c) => {
      const swap = Object.values(PENDING_SWAPS).find((x) => x.card === c.id);
      return swap ? { ...c, counts: swap.counts } : c;
    });
    const content: WwContent = { ...shipped, cards: [...swapped, ...PENDING_CARDS] };
    expect(checkContent(content)).toEqual([]);
    const engine = createWindamereEngine(content);
    for (const seats of [3, 7]) {
      const rng = new Rng(seats);
      let s = engine.createGame({
        seed: seats,
        seats: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })),
      });
      while (s.phase.kind !== 'gameOver') {
        const seat = rng.pick(engine.waitingOn(s));
        const legal = engine.legalActions(s, seat).filter((a) => a.type !== 'unpick');
        const r = engine.applyAction(s, rng.pick(legal));
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      expect(s.result?.scores).toHaveLength(seats);
    }
  });
});
