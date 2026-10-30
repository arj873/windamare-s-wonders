/** The D2c turn on the real engine (test fixture): R3-R6, R13 turn effects, R15.6/R15.7, R17. */
import { describe, expect, it } from 'vitest';
import type { Card, Json, Pick, SeatId } from '../core';
import { argsOf, type WwPickArgs } from './pick';
import { FX_CARDS } from './testing/fixture';
import {
  build,
  ctxOf,
  fxEngine as e,
  fxRuleset,
  newGame,
  playTurn,
  setGreatWork,
  setHand,
  townData,
} from './testing/helpers';
import type { WwState } from './types';

const filler = Array(6).fill('tf-stall') as string[]; // Spend band: 1 coin, no goods

/** 3 towns, spring turn 1, every hand Stalls, every store empty, 5 coins, no Great Work. */
function table(seats = 3): WwState {
  const s = structuredClone(newGame(seats, 1));
  for (const t of s.seats) {
    setHand(s, t.id, filler);
    t.data.store = { flint: 0, slate: 0, honey: 0 };
    t.data.coins = 5;
    t.data.greatWork = null;
  }
  return s;
}
const store = (s: WwState, seat: SeatId, goods: Record<string, number>) =>
  Object.assign(townData(s, seat).store, goods);
const pk = (card: Card, use: 'build' | 'spend', args?: WwPickArgs): Pick => ({
  card: card.id,
  use,
  ...(args ? { args: args as unknown as Json } : {}),
});
const submit = (s: WwState, seat: SeatId, pick: Pick) =>
  e.applyAction(s, { type: 'pick', seat, pick });
const stored = (s: WwState, seat: SeatId, pick: Pick): WwPickArgs => {
  const r = submit(s, seat, pick);
  if (!r.ok) throw new Error(r.error);
  return argsOf(r.state.seats[seat]!.pick!);
};
/** Play turns with default picks until the last turn of the Season. */
function toLastTurn(s0: WwState): WwState {
  let s = s0;
  while (s.turn < s.roundPicks - 1) s = playTurn(s);
  return s;
}

describe('the deal and the Season (R2.7, R3)', () => {
  it('R2.7 and R3.2 the Season deck for the seat count deals 6 cards to each town', () => {
    for (const seats of [3, 5, 7]) {
      const s = newGame(seats);
      const spring = FX_CARDS.filter((c) => c.season === 'spring');
      const size = spring.reduce((n, c) => n + (c.counts[seats - 3] ?? 0), 0);
      expect(s.seats.every((t) => t.hand.length === 6)).toBe(true);
      expect(s.deck).toHaveLength(size - 6 * seats);
      expect(s.seats.flatMap((t) => t.hand).every((c) => spring.some((d) => d.id === c.def))).toBe(
        true,
      );
    }
  });

  it('R3.3 hands pass left in Spring and Autumn, right in Summer and Winter', () => {
    const s0 = newGame(3);
    expect(s0.passDirection).toBe('left');
    const before = s0.seats.map((t) => t.hand.map((c) => c.id));
    const s1 = playTurn(s0);
    // Seat 0's hand (less its pick) is now seat 1's: left is the next seat clockwise.
    expect(s1.seats[1]!.hand.map((c) => c.id)).toEqual(before[0]!.slice(1));
    let s = s1;
    while (s.round === 0) s = playTurn(s);
    expect(s.passDirection).toBe('right');
  });

  it('R3.4, R3.5 and R4.6 five turns; on the fifth the other card is gleaned, nothing passes', () => {
    let s = toLastTurn(newGame(3));
    expect(s.turn).toBe(4);
    expect(s.seats.every((t) => t.hand.length === 2)).toBe(true);
    s = structuredClone(s);
    setHand(s, 0, ['tf-hut', 'tf-quarry']); // Spend the Hut; glean the Quarry (2 slate)
    const slate = townData(s, 0).store.slate ?? 0;
    const glean = s.seats[0]!.hand[1]!;
    const next = playTurn(s, { 0: pk(s.seats[0]!.hand[0]!, 'spend') });
    expect(next.round).toBe(1);
    expect(next.seats.every((t) => t.hand.length === 6)).toBe(true);
    expect(townData(next, 0).store.slate).toBe(slate + 2);
    expect(next.box.concat(next.discard).some((c) => c.id === glean.id)).toBe(true);
    expect(next.log.filter((l) => l.kind === 'glean' && l.round === 0)).toHaveLength(3);
  });

  it('R3.7 Winter has no Yield', () => {
    const s = table();
    build(s, 0, 'tf-quarry'); // yield 1 slate, 1 labour
    const yielded = playTurn(s);
    expect(townData(yielded, 0).store.slate).toBe(1);
    const winter = table();
    build(winter, 0, 'tf-quarry');
    const ctx = ctxOf(winter);
    for (let r = 1; r <= 3; r++) fxRuleset.onRoundStart?.(ctx, r);
    winter.round = 3;
    expect(townData(playTurn(winter), 0).store.slate).toBe(0);
  });
});

describe('the pick (R4.1-R4.4, R15.6, R17.1, R17.2)', () => {
  it('R4.1 and R17.1 one card from the hand, to Build or Spend', () => {
    const s = table();
    const card = s.seats[0]!.hand[0]!;
    expect(submit(s, 0, { card: card.id, use: 'burn' })).toEqual({
      ok: false,
      error: 'use must be build or spend',
    });
    expect(submit(s, 0, { card: card.id, use: 'spend', args: { wish: 1 } })).toEqual({
      ok: false,
      error: 'unknown pick choice wish',
    });
    expect(submit(s, 0, pk(card, 'spend', { cover: null }))).toEqual({
      ok: false,
      error: 'a Spend has no cover',
    });
  });

  it('R17.2 a Spend is always legal, so every town always has a legal pick', () => {
    const s = newGame(5, 3);
    for (const t of s.seats) {
      const picks = e.legalPicks(s, t.id);
      for (const c of t.hand)
        expect(picks.some((p) => p.card === c.id && p.use === 'spend')).toBe(true);
    }
  });

  it('R4.2 a Build is legal only if the town can pay for it', () => {
    const s = table();
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!; // 2 slate; the bank: 2 x 5 coins
    expect(submit(s, 0, pk(apiary, 'build'))).toMatchObject({ ok: false });
    expect(e.legalPicks(s, 0).some((p) => p.card === apiary.id && p.use === 'build')).toBe(false);
    townData(s, 0).coins = 10;
    expect(stored(s, 0, pk(apiary, 'build')).pay).toEqual([
      { good: 'slate', via: 'bank' },
      { good: 'slate', via: 'bank' },
    ]);
  });

  it('R4.3 and R4.4 the pick names its choices; they are revealed with it', () => {
    const s = table();
    store(s, 1, { slate: 2 });
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!;
    const after = playTurn(s, { 0: pk(apiary, 'build') });
    const reveal = after.lastReveal!.picks.find((p) => p.seat === 0)!;
    expect((reveal.args as WwPickArgs).pay).toEqual([
      { good: 'slate', via: 'buy', from: 1 },
      { good: 'slate', via: 'buy', from: 1 },
    ]);
  });

  it('R15.6 the fallback pick Spends the first card in hand', () => {
    const s = newGame(4, 9);
    for (const t of s.seats)
      expect(e.defaultPick(s, t.id)).toMatchObject({ card: t.hand[0]!.id, use: 'spend' });
  });
});

describe('Spend and glean (R5)', () => {
  it('R5.1 and R5.3 a Spend gains its band, "any" as named; the card goes face down', () => {
    const s = table();
    const pond = setHand(s, 0, ['tf-pond'])[0]!; // flint 1, any 1
    const after = playTurn(s, { 0: pk(pond, 'spend', { any: ['honey'] }) });
    expect(townData(after, 0).store).toEqual({ flint: 1, slate: 0, honey: 1 });
    expect(after.discard.some((c) => c.id === pond.id)).toBe(true);
  });

  it('R15.7 an "any" gain with no Build defaults to the good held fewest (ties: goods order)', () => {
    const s = table();
    store(s, 0, { flint: 2, slate: 1, honey: 1 });
    const pond = setHand(s, 0, ['tf-pond'])[0]!;
    expect(stored(s, 0, pk(pond, 'spend')).any).toEqual(['slate']);
  });

  it("R5.2 on the fifth turn the glean's gains can pay for that turn's Build", () => {
    const s = structuredClone(toLastTurn(table()));
    const [quarry, pond] = setHand(s, 0, ['tf-quarry', 'tf-pond']); // Quarry costs 1 flint
    townData(s, 0).store = { flint: 0, slate: 0, honey: 0 };
    townData(s, 0).coins = 0;
    for (const n of [1, 2]) townData(s, n).store = { flint: 0, slate: 0, honey: 0 };
    const args = stored(s, 0, pk(quarry!, 'build'));
    expect(args.pay).toEqual([]); // the glean's 1 flint pays
    const after = playTurn(s, { 0: pk(quarry!, 'build') });
    expect(after.seats[0]!.tableau.some((c) => c.id === quarry!.id)).toBe(true);
    expect(after.discard.some((c) => c.id === pond!.id)).toBe(true);
  });

  it('R5.4 spendBonus adds to Spending a card of its kind, the glean included', () => {
    const s = table();
    build(s, 0, 'tf-school'); // Spend a Lore card: +1 labour
    const lore = setHand(s, 0, ['tf-lore-1'])[0]!;
    expect(townData(playTurn(s, { 0: pk(lore, 'spend') }), 0).labour).toBe(1);
    const last = structuredClone(toLastTurn(s));
    const [hut] = setHand(last, 0, ['tf-hut', 'tf-lore-2']); // spend the Hut (3 labour), glean Lore
    const before = townData(last, 0).labour;
    expect(townData(playTurn(last, { 0: pk(hut!, 'spend') }), 0).labour).toBe(before + 3 + 1);
  });
});

describe('paying and buying (R6, R15.7, R17.9-R17.11)', () => {
  it('R6.2 and R6.5 own goods pay first; a town may not buy a good it holds enough of', () => {
    const s = table();
    store(s, 0, { slate: 2 });
    store(s, 1, { slate: 2 });
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!;
    expect(stored(s, 0, pk(apiary, 'build')).pay).toEqual([]);
    expect(
      submit(s, 0, pk(apiary, 'build', { pay: [{ good: 'slate', via: 'buy', from: 1 }] })),
    ).toMatchObject({
      ok: false,
    });
    const after = playTurn(s, { 0: pk(apiary, 'build') });
    expect(townData(after, 0).store.slate).toBe(0);
  });

  it('R6.3 the bank sells a missing good for 5 coins', () => {
    const s = table();
    townData(s, 0).coins = 10;
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!;
    expect(townData(playTurn(s, { 0: pk(apiary, 'build') }), 0).coins).toBe(0);
  });

  it('R6.3 an Exchange pays 2 of its good for a missing good (never the good itself)', () => {
    const s = table();
    build(s, 0, 'tf-broker'); // exchange flint
    store(s, 0, { flint: 2 });
    const mint = setHand(s, 0, ['tf-mint'])[0]!; // 1 honey
    expect(stored(s, 0, pk(mint, 'build')).pay).toEqual([
      { good: 'honey', via: 'exchange', give: 'flint' },
    ]);
    const after = playTurn(s, { 0: pk(mint, 'build') });
    // No coins paid; the new Mint's income 2 arrives in this turn's Yield.
    expect(townData(after, 0)).toMatchObject({
      coins: 5 + 2,
      store: { flint: 0, slate: 0, honey: 0 },
    });
    const quarry = setHand(s, 0, ['tf-quarry'])[0]!; // 1 flint: an Exchange cannot give flint for flint
    store(s, 0, { flint: 0, slate: 4 });
    expect(
      submit(
        s,
        0,
        pk(quarry, 'build', { pay: [{ good: 'flint', via: 'exchange', give: 'flint' }] }),
      ),
    ).toEqual({
      ok: false,
      error: 'cannot pay for tf-quarry: an Exchange cannot give the missing good itself (R6.3)',
    });
  });

  it("R6.6a-d buying moves the good from the seller, at the Season's price, into the Build", () => {
    const s = table();
    store(s, 1, { slate: 3 });
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!;
    const after = playTurn(s, { 0: pk(apiary, 'build') });
    expect(townData(after, 0)).toMatchObject({ coins: 5 - 2, store: { slate: 0 } }); // R17.11
    expect(townData(after, 1)).toMatchObject({ coins: 5 + 1 + 2, store: { slate: 1 } }); // +1 Stall spend
    // Summer's price is 2 (R6.6c).
    const summer = table();
    store(summer, 1, { slate: 3 });
    summer.round = 1;
    const a2 = setHand(summer, 0, ['tf-apiary'])[0]!;
    expect(townData(playTurn(summer, { 0: pk(a2, 'build') }), 1).coins).toBe(5 + 1 + 4);
  });

  it('R6.6b at most 2 goods from each neighbour a turn', () => {
    const s = table();
    store(s, 1, { slate: 5 });
    townData(s, 0).coins = 10;
    const keep = setHand(s, 0, ['tf-keep'])[0]!; // 3 slate
    expect(stored(s, 0, pk(keep, 'build')).pay).toEqual([
      { good: 'slate', via: 'buy', from: 1 },
      { good: 'slate', via: 'buy', from: 1 },
      { good: 'slate', via: 'bank' },
    ]);
    const three = [1, 1, 1].map(() => ({ good: 'slate', via: 'buy' as const, from: 1 }));
    expect(submit(s, 0, pk(keep, 'build', { pay: three }))).toEqual({
      ok: false,
      error: 'cannot pay for tf-keep: at most 2 goods from each neighbour a turn (R6.6b)',
    });
  });

  it('R6.6e sellBonus pays the seller extra from the bank; the buyer pays the same', () => {
    const s = table();
    build(s, 1, 'tf-seller');
    store(s, 1, { slate: 2 });
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!;
    const after = playTurn(s, { 0: pk(apiary, 'build') });
    expect(townData(after, 0).coins).toBe(3);
    expect(townData(after, 1).coins).toBe(5 + 1 + 2 * (1 + 1));
  });

  it("R6.7 a seller's own Build comes first; a short purchase comes from the bank at the same price", () => {
    const s = table();
    store(s, 1, { slate: 2 });
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!;
    const own = setHand(s, 1, ['tf-apiary'])[0]!; // the seller builds with its 2 slate
    const after = playTurn(s, { 0: pk(apiary, 'build'), 1: pk(own, 'build') });
    expect(townData(after, 0).coins).toBe(3); // paid the price it saw
    expect(townData(after, 1)).toMatchObject({ coins: 5, store: { slate: 0 } }); // sold nothing
    expect(after.seats[0]!.tableau.some((c) => c.id === apiary.id)).toBe(true);
    expect(after.log.filter((l) => l.kind === 'saleShort')).toHaveLength(2);
  });

  it('R6.7 and R17.10 both neighbours may buy from one town; short goods alternate from its left', () => {
    const s = table();
    store(s, 0, { honey: 1 });
    const m1 = setHand(s, 1, ['tf-mint'])[0]!; // 1 honey, from seat 0 (its right)
    const m2 = setHand(s, 2, ['tf-mint'])[0]!; // 1 honey, from seat 0 (its left)
    const after = playTurn(s, { 1: pk(m1, 'build'), 2: pk(m2, 'build') });
    const sales = after.log.filter((l) => l.kind === 'sale' || l.kind === 'saleShort');
    // Seat 0's left neighbour (seat 1) is served first.
    expect(sales.map((l) => [l.kind, (l.data as { buyer: number }).buyer])).toEqual([
      ['sale', 1],
      ['saleShort', 2],
    ]);
    expect(townData(after, 0)).toMatchObject({ coins: 5 + 1 + 1, store: { honey: 0 } });
    expect(after.seats[1]!.tableau).toHaveLength(1);
    expect(after.seats[2]!.tableau).toHaveLength(1);
  });

  it("R17.9 a purchase is checked against the seller's store at the start of the turn", () => {
    const s = table();
    townData(s, 0).coins = 0;
    const mint = setHand(s, 0, ['tf-mint'])[0]!;
    setHand(s, 1, ['tf-apiary']); // seat 1 will Spend it for 2 honey this turn: too late to buy
    expect(
      submit(s, 0, pk(mint, 'build', { pay: [{ good: 'honey', via: 'buy', from: 1 }] })),
    ).toEqual({
      ok: false,
      error: 'cannot pay for tf-mint: P1 holds only 0 honey (R6.6a)',
    });
  });

  it('R15.7 the default plan spends the fewest coins: Exchange, then the left neighbour, then the bank', () => {
    const s = table();
    store(s, 1, { honey: 1 });
    store(s, 2, { honey: 1 });
    const mint = setHand(s, 0, ['tf-mint'])[0]!;
    expect(stored(s, 0, pk(mint, 'build')).pay).toEqual([{ good: 'honey', via: 'buy', from: 1 }]);
    build(s, 0, 'tf-broker');
    store(s, 0, { flint: 2 });
    expect(stored(s, 0, pk(mint, 'build')).pay).toEqual([
      { good: 'honey', via: 'exchange', give: 'flint' },
    ]);
  });

  it('R4.7 and R15.9 the order picks arrive in never changes the result, trade included', () => {
    const s = table();
    store(s, 0, { honey: 1 });
    const picks: Record<number, Pick> = {
      0: pk(s.seats[0]!.hand[0]!, 'spend'),
      1: pk(setHand(s, 1, ['tf-mint'])[0]!, 'build'),
      2: pk(setHand(s, 2, ['tf-mint'])[0]!, 'build'),
    };
    const results = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
      [2, 0, 1],
    ].map((order) => {
      let x = s;
      for (const seat of order) {
        const r = submit(x, seat, picks[seat]!);
        if (!r.ok) throw new Error(r.error);
        x = r.state;
      }
      return x;
    });
    for (const r of results) expect(r).toEqual(results[0]);
  });
});

describe('discounts, upgrades and Build effects (R6.1, R7.9, R13)', () => {
  it('R6.1 a discount takes goods off a cost, in goods order unless the pick names them', () => {
    const s = table();
    build(s, 0, 'tf-mason'); // Halls cost 1 good fewer
    store(s, 0, { flint: 1, slate: 1 });
    const hall = setHand(s, 0, ['tf-hall'])[0]!; // flint 2, slate 1
    expect(stored(s, 0, pk(hall, 'build'))).toMatchObject({ discount: ['flint'], pay: [] });
    expect(stored(s, 0, pk(hall, 'build', { discount: ['slate'] })).pay).toEqual([
      { good: 'flint', via: 'bank' },
    ]);
  });

  it('R7.9 an upgrade covers the first matching card by default, or pays full cost to cover none', () => {
    const s = table();
    const shrine = build(s, 0, 'tf-shrine');
    store(s, 0, { flint: 2, slate: 1 });
    const hall = setHand(s, 0, ['tf-hall'])[0]!;
    expect(stored(s, 0, pk(hall, 'build'))).toMatchObject({ cover: shrine.id, pay: [] });
    const builds = e.legalPicks(s, 0).filter((p) => p.card === hall.id && p.use === 'build');
    expect(builds.map((p) => argsOf(p).cover)).toEqual([shrine.id, null]);
    const after = playTurn(s, { 0: pk(hall, 'build') });
    expect(after.seats[0]!.zones.covered).toEqual([shrine]);
    expect(townData(after, 0).store).toMatchObject({ flint: 2, slate: 0 }); // upgrade cost: 1 slate
  });

  it('R13 onBuild "any" goods are named in the pick (R4.3)', () => {
    const s = table();
    const gift = setHand(s, 0, ['tf-gift'])[0]!; // free; when built: 2 any
    const after = playTurn(s, { 0: pk(gift, 'build', { any: ['slate', 'honey'] }) });
    expect(townData(after, 0).store).toEqual({ flint: 0, slate: 1, honey: 1 });
  });

  it('R13 buildBonus: Building a card of its kind gains, but not for the card itself', () => {
    const s = table();
    store(s, 0, { honey: 1, flint: 1 });
    const patron = setHand(s, 0, ['tf-patron'])[0]!;
    const s1 = playTurn(s, { 0: pk(patron, 'build') });
    expect(townData(s1, 0).coins).toBe(5);
    const s2 = structuredClone(s1);
    const shrine = setHand(s2, 0, ['tf-shrine'])[0]!;
    expect(townData(playTurn(s2, { 0: pk(shrine, 'build') }), 0).coins).toBe(5 + 2);
  });

  it('R13 toll and R17.4 coins for each neighbour that Built (of the kind), upgrades included', () => {
    const s = table();
    build(s, 0, 'tf-toll'); // 1 per neighbour that built
    build(s, 0, 'tf-hall-toll'); // 2 per neighbour that built a Hall
    const shrine1 = build(s, 1, 'tf-shrine');
    store(s, 1, { slate: 1 });
    const hall = setHand(s, 1, ['tf-hall'])[0]!; // an upgrade of the Shrine
    const hut = setHand(s, 2, ['tf-hut'])[0]!;
    const after = playTurn(s, { 1: pk(hall, 'build', { cover: shrine1.id }), 2: pk(hut, 'build') });
    expect(townData(after, 0).coins).toBe(5 + 1 + (1 + 2) + 1);
  });

  it('R4.5 step 4 and R17.3 Yield pays every yield and income, a Holding built this turn included', () => {
    const s = table();
    build(s, 0, 'tf-mint'); // income 2
    store(s, 0, { flint: 1 });
    const quarry = setHand(s, 0, ['tf-quarry'])[0]!;
    const after = playTurn(s, { 0: pk(quarry, 'build') });
    expect(townData(after, 0)).toMatchObject({
      coins: 7,
      labour: 1,
      store: { flint: 0, slate: 1 },
    });
  });

  it('R8.3 the Great Work check runs after step 2 and after step 4', () => {
    const s = table();
    setGreatWork(s, 0, 'tg-crown'); // tier I at 3 labour: +4 coins
    const hut = setHand(s, 0, ['tf-hut'])[0]!; // Spend: 3 labour (step 1)
    const a = playTurn(s, { 0: pk(hut, 'spend') });
    expect(townData(a, 0)).toMatchObject({ tiers: 1, coins: 9 });
    const t = table();
    setGreatWork(t, 0, 'tg-crown');
    townData(t, 0).labour = 2;
    build(t, 0, 'tf-quarry'); // Yield: 1 labour (step 4)
    const b = playTurn(t);
    expect(townData(b, 0).tiers).toBe(1);
    const steps = b.log.filter((l) => l.seq === b.seq).map((l) => l.kind);
    expect(steps.indexOf('tier')).toBeGreaterThan(-1);
  });
});
