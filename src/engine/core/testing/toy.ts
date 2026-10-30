/**
 * TEST FIXTURE, NOT GAME CONTENT. A tiny made-up ruleset that exercises every core feature:
 * coins, three uses (build / sell / stash), a two-step resolution, an owner-only zone, round-end
 * income, end-game points, a prompt during resolution and an optional prompt at game start.
 * Never import it from shipped code.
 *
 * Options: `rounds` (default 2), `opening: true` (every seat answers an 'opening' prompt first).
 */
import { effectScore } from '../effects';
import type { Card, CardDef, DraftState, EffectSpec, Json, Pick, Ruleset, SeatId } from '../types';

export interface ToySeat {
  coins: number;
  opening: string | null;
}

export interface ToyTable {
  /** `<step>:<seat>` per resolve step call, to test the resolution order. */
  trace: string[];
}

export type ToyState = DraftState<ToySeat, ToyTable>;

export const TOY_HAND = 4;
export const TOY_PICKS = 3;
export const TOY_STASH_MAX = 2;
const START_COINS = 2;
const SELL_COINS = 2;

export const TOY_CARDS: CardDef[] = [
  {
    id: 'toy-well',
    name: 'Toy Well',
    kind: 'basic',
    cost: 0,
    effects: [{ type: 'coins', amount: 1 }],
  },
  {
    id: 'toy-mill',
    name: 'Toy Mill',
    kind: 'basic',
    cost: 1,
    effects: [{ type: 'income', amount: 1 }],
  },
  {
    id: 'toy-statue',
    name: 'Toy Statue',
    kind: 'civic',
    cost: 2,
    effects: [{ type: 'points', amount: 3 }],
  },
  {
    id: 'toy-school',
    name: 'Toy School',
    kind: 'civic',
    cost: 1,
    effects: [{ type: 'perNeighbourKind', kind: 'civic', points: 1 }],
  },
  { id: 'toy-scout', name: 'Toy Scout', kind: 'basic', cost: 0, effects: [{ type: 'salvage' }] },
  { id: 'toy-lamp', name: 'Toy Lamp', kind: 'basic', cost: 0, effects: [] },
];

const costOf = (def: CardDef | undefined): number => (typeof def?.cost === 'number' ? def.cost : 0);
const defById = new Map(TOY_CARDS.map((c) => [c.id, c]));
const amount = (spec: EffectSpec, key = 'amount'): number => spec[key] as number;
const isCount = (x: Json | undefined) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

function seatOf(state: ToyState, seat: SeatId) {
  const s = state.seats[seat];
  if (!s) throw new Error(`no seat ${seat}`);
  return s;
}

function checkToyPick(state: ToyState, seat: SeatId, pick: Pick): string | null {
  const s = state.seats[seat];
  const card = s?.hand.find((c) => c.id === pick.card);
  if (!s || !card) return 'card not in hand';
  if (pick.args !== undefined) return 'toy picks take no args';
  switch (pick.use) {
    case 'build': {
      const def = defById.get(card.def);
      if (s.tableau.some((c) => c.def === card.def)) return 'already built';
      if (s.data.coins < costOf(def)) return 'not enough coins';
      return null;
    }
    case 'sell':
      return null;
    case 'stash':
      return (s.zones.stash?.length ?? 0) >= TOY_STASH_MAX ? 'stash is full' : null;
    default:
      return `unknown use ${pick.use}`;
  }
}

export const toyRuleset: Ruleset<ToySeat, ToyTable> = {
  id: 'toy',
  version: 1,
  minSeats: 2,
  maxSeats: 5,
  cards: TOY_CARDS,
  zones: { stash: 'owner' },
  rounds: (config) => (typeof config.options?.rounds === 'number' ? config.options.rounds : 2),
  validateOptions(options) {
    if (options.rounds !== undefined && !isCount(options.rounds)) return 'rounds must be a count';
    return null;
  },
  roundSpec(state, round) {
    const n = state.seats.length;
    const deck = Array.from(
      { length: TOY_HAND * n + 2 },
      (_, i) => (TOY_CARDS[i % TOY_CARDS.length] as CardDef).id,
    );
    return { handSize: TOY_HAND, picks: TOY_PICKS, pass: round % 2 === 0 ? 'left' : 'right', deck };
  },
  setupTable: () => ({ trace: [] }),
  setupSeat: () => ({ coins: START_COINS, opening: null }),
  onGameStart(ctx) {
    if (ctx.state.config.options?.opening !== true) return;
    for (const s of ctx.state.seats) ctx.prompt(s.id, 'opening', { choices: ['coins', 'none'] });
  },
  validatePick: checkToyPick,
  legalPicks(state, seat) {
    const hand = state.seats[seat]?.hand ?? [];
    const all = hand.flatMap((c) =>
      ['build', 'sell', 'stash'].map((use): Pick => ({ card: c.id, use })),
    );
    return all.filter((p) => checkToyPick(state, seat, p) === null);
  },
  defaultPick(state, seat) {
    const card = state.seats[seat]?.hand[0];
    return { card: card?.id ?? -1, use: 'sell' };
  },
  resolve: [
    // Step 1: everybody pays first ...
    (ctx, seat, pick, card) => {
      const s = seatOf(ctx.state, seat);
      if (pick.use === 'build') s.data.coins -= costOf(defById.get(card.def));
      ctx.state.table.trace.push(`pay:${seat}`);
    },
    // ... step 2: then cards land and income arrives.
    (ctx, seat, pick, card) => {
      const s = seatOf(ctx.state, seat);
      if (pick.use === 'build') ctx.play(seat, card);
      else if (pick.use === 'stash') ctx.place(seat, 'stash', card);
      else {
        ctx.toDiscard(card);
        s.data.coins += SELL_COINS;
      }
      ctx.state.table.trace.push(`place:${seat}`);
    },
  ],
  effects: {
    coins: {
      validate: (spec) => (isCount(spec.amount) ? null : 'amount must be a count'),
      onPlay: (ctx, seat, spec) => {
        seatOf(ctx.state, seat).data.coins += amount(spec);
      },
    },
    income: {
      validate: (spec) => (isCount(spec.amount) ? null : 'amount must be a count'),
      onRoundEnd: (ctx, seat, spec) => {
        seatOf(ctx.state, seat).data.coins += amount(spec);
      },
    },
    points: {
      validate: (spec) => (isCount(spec.amount) ? null : 'amount must be a count'),
      score: (_state, _seat, spec) => ({ civic: amount(spec) }),
    },
    perNeighbourKind: {
      validate: (spec) =>
        typeof spec.kind === 'string' && isCount(spec.points) ? null : 'needs kind and points',
      score: (state, seat, spec) => {
        const n = state.seats.length;
        const near = [...new Set([(seat + 1) % n, (seat - 1 + n) % n])].filter((s) => s !== seat);
        const count = near
          .flatMap((s) => seatOf(state, s).tableau)
          .filter((c) => defById.get(c.def)?.kind === spec.kind).length;
        return { neighbours: count * amount(spec, 'points') };
      },
    },
    salvage: {
      onPlay: (ctx, seat) => {
        if (ctx.state.discard.length === 0) return;
        ctx.prompt(seat, 'salvage', { cards: ctx.state.discard.map((c) => ({ ...c })) });
      },
    },
  },
  prompts: {
    opening: {
      answers: () => ['coins', 'none'],
      validate: (_s, _p, answer) =>
        answer === 'coins' || answer === 'none' ? null : 'coins or none',
      apply: (ctx, prompt, answer) => {
        const data = seatOf(ctx.state, prompt.seat).data;
        data.opening = answer as string;
        if (answer === 'coins') data.coins += 1;
      },
      defaultAnswer: () => 'none',
    },
    salvage: {
      // The discard as it is when this prompt opens; validate then needs only prompt.data.
      refresh: (state) => ({ cards: state.discard.map((c) => ({ ...c })) }),
      answers: (_state, prompt) => [null, ...offered(prompt.data).map((c) => c.id)],
      validate: (_state, prompt, answer) => {
        if (answer === null) return null;
        return offered(prompt.data).some((c) => c.id === answer) ? null : 'not offered';
      },
      apply: (ctx, prompt, answer) => {
        if (answer === null) return;
        ctx.play(prompt.seat, ctx.take(answer as number));
      },
    },
  },
  score(state, seat) {
    const s = seatOf(state, seat);
    return {
      treasury: Math.floor(s.data.coins / 3),
      stash: s.zones.stash?.length ?? 0,
      ...sumInto({}, effectScore(toyRuleset, state, seat)),
    };
  },
  tiebreak: (state, seat) => [seatOf(state, seat).data.coins],
};

function offered(data: Json): Card[] {
  const cards = (data as { cards?: Card[] } | null)?.cards;
  return Array.isArray(cards) ? cards : [];
}

function sumInto(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
  return a;
}
