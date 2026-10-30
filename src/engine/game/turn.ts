/**
 * The R3/R4 turn for 3 to 7 seats: the deal, the glean and the resolve steps, run step-major by
 * the core (every town does a step before the next one starts: lockstep, R4.8).
 *
 *   1  Spend      the Spent card's band and the glean's (R4.5.1, R3.5, R5)
 *   2a Pay        the Build's cost from the town's store, Exchanges, coins and the bank (R6)
 *   2b Sell       each town fills the purchases its neighbours made from it (R6.6, R6.7)
 *   2c Build      the card is placed; "when built" effects and `buildBonus`
 *      Check      the Great Work check (R8.3)
 *   3  Tolls      (R13 `toll`)
 *   4  Yield      `yield` and `income`, not in Winter (R3.7)
 *      Check      the Great Work check again
 *      Honours    the Honours' leaders, once all towns have resolved (R11.3)
 *
 * Each step records what it did as events (events.ts).
 */
import type { Card, CardDefId, Ctx, Pick, ResolveStep, RoundSpec, SeatId } from '../core';
import { neighboursOf } from '../core';
import { placeBuild } from './build';
import { countsIndex, type WwRules } from './content';
import { emit, gained, holdings, isEmpty } from './events';
import { COINS, addGains } from './gains';
import { greatWorkCheck } from './greatWork';
import { updateHonourLeaders } from './honours';
import { BUILD, SPEND, argsOf, buildCostAfterDiscount, spendGains, type WwPickArgs } from './pick';
import { marketPrice, type Payment } from './pay';
import { activeEffects, townOf } from './town';
import { SEASONS, type Gains, type GoodId, type WwSeat, type WwState, type WwTable } from './types';

/** The hidden seat zone that holds a town's glean between the reveal and step 1 (R3.5). */
export const GLEAN = 'glean';

type WwCtx = Ctx<WwSeat, WwTable>;
type Step = ResolveStep<WwSeat, WwTable>;

/** R2.7, R3.2-R3.4: the Season's deck for the seat count, 6 cards a town, 5 turns. */
export function roundSpec(rules: WwRules, state: WwState, round: number): RoundSpec {
  const season = SEASONS[round];
  const i = countsIndex(state.seats.length);
  const deck: CardDefId[] = [];
  for (const c of rules.content.cards) {
    if (c.season !== season) continue;
    for (let k = 0; k < (c.counts[i] ?? 0); k++) deck.push(c.id);
  }
  return {
    // R14.1: 2 seats deal 10 from the 4-seat deck; the rest stays undealt and unseen.
    handSize: state.seats.length === 2 ? rules.tunables.twoSeatHandSize : rules.tunables.handSize,
    picks: rules.tunables.turnsPerSeason,
    pass: round % 2 === 0 ? 'left' : 'right', // R3.3
    deck,
  };
}

/** R3.5: the fifth turn's other card waits in the glean zone for step 1. */
export function onLeftovers(ctx: WwCtx, seat: SeatId, cards: Card[]): void {
  for (const c of cards) ctx.place(seat, GLEAN, c);
}

const isWinter = (state: WwState) => SEASONS[state.round] === 'winter';

function cost(rules: WwRules, ctx: WwCtx, seat: SeatId, pick: Pick, card: Card): Gains {
  const args = argsOf(pick);
  const paid = buildCostAfterDiscount(
    rules,
    ctx.state,
    seat,
    rules.card(card.def),
    args.cover ?? null,
    args.discount,
  );
  if (typeof paid === 'string')
    throw new Error(`seat ${seat}: a checked Build no longer costs: ${paid}`);
  return paid;
}

export function resolveSteps(rules: WwRules): Step[] {
  const t = rules.tunables;

  // 1. Spend (R4.5.1, R5): the Spent card's and the glean's bands, with spendBonus (R5.4).
  const spend: Step = (ctx, seat, pick, card) => {
    const town = townOf(ctx.state, seat);
    const args = argsOf(pick);
    if (pick.use === SPEND) {
      const def = rules.card(card.def);
      const gains = spendGains(rules, ctx.state, seat, def, args.any ?? []);
      addGains(town.data, gains);
      ctx.toDiscard(card); // R5.3
      emit(ctx, { type: 'spend', seat, card, gains }, `${town.name} spends ${def.name}.`);
    }
    for (const g of [...(town.zones[GLEAN] ?? [])]) {
      const def = rules.card(g.def);
      const gains = spendGains(rules, ctx.state, seat, def, args.glean ?? []);
      addGains(town.data, gains);
      ctx.toDiscard(ctx.take(g.id));
      emit(ctx, { type: 'glean', seat, gains }, `${town.name} gleans a card.`);
    }
    // R14.2, R14.3: the burned card leaves the hand face down, with no effect (before the pass).
    if (args.burn !== undefined) {
      ctx.toDiscard(ctx.take(args.burn));
      emit(ctx, { type: 'burn', seat }, `${town.name} burns a card.`);
    }
  };

  // 2a. Pay (R6.2-R6.5): own goods first, then Exchanges; coins for the cost, purchases and bank.
  const pay: Step = (ctx, seat, pick, card) => {
    if (pick.use !== BUILD) return;
    const owner = townOf(ctx.state, seat);
    const town = owner.data;
    const due = cost(rules, ctx, seat, pick, card);
    const plan = argsOf(pick).pay ?? [];
    const price = marketPrice(rules, ctx.state);
    const goods: Gains = {};
    for (const g of rules.goods) {
      const own = Math.min(town.store[g] ?? 0, due[g] ?? 0);
      if (own > 0) goods[g] = own;
      town.store[g] = (town.store[g] ?? 0) - own;
    }
    let coins = due[COINS] ?? 0;
    const exchanges: { give: GoodId; for: GoodId }[] = [];
    const bank: GoodId[] = [];
    const buys: { from: SeatId; good: GoodId; price: number }[] = [];
    for (const p of plan) {
      if (p.via === 'exchange') {
        town.store[p.give] = (town.store[p.give] ?? 0) - t.exchangeRate;
        exchanges.push({ give: p.give, for: p.good });
      } else if (p.via === 'buy') {
        coins += price;
        buys.push({ from: p.from, good: p.good, price });
      } else {
        coins += t.bankPrice;
        bank.push(p.good);
      }
    }
    town.coins -= coins;
    if (town.coins < 0 || Object.values(town.store).some((n) => n < 0)) {
      throw new Error(`seat ${seat}: a checked Build could not be paid (R4.7)`);
    }
    emit(
      ctx,
      { type: 'pay', seat, card, goods, exchanges, bank, buys, coins },
      `${owner.name} pays for ${rules.card(card.def).name}.`,
    );
  };

  // 2b. Sell (R6.6, R6.7), run for each seller: fill its neighbours' purchases from what its own
  // Build left (its step-1 Spend gains included, R17.9), one good at a time, alternating buyers
  // from its left neighbour. A good it cannot fill comes from the bank at the same price (the
  // buyer already paid; those coins are gone). How many could be bought was already checked
  // against its store at the start of the turn (R6.6a).
  const sell: Step = (ctx, seat) => {
    const seller = townOf(ctx.state, seat);
    const price = marketPrice(rules, ctx.state);
    const bonus = activeEffects(rules, ctx.state, seat, 'sellBonus').reduce(
      (n, e) => n + (e.spec.coins as number),
      0,
    );
    const orders = new Map<SeatId, Payment[]>();
    for (const p of ctx.state.lastReveal?.picks ?? []) {
      if (p.use !== BUILD) continue;
      const plan = (p.args as WwPickArgs | undefined)?.pay ?? [];
      const buys = plan.filter((x) => x.via === 'buy' && x.from === seat);
      if (buys.length > 0) orders.set(p.seat, buys);
    }
    if (orders.size === 0) return;
    const buyers = neighboursOf(ctx.state, seat).filter((n) => orders.has(n));
    for (const good of rules.goods) {
      const want = new Map(
        buyers.map((b) => [b, (orders.get(b) ?? []).filter((x) => x.good === good).length]),
      );
      let open = [...want.values()].reduce((a, b) => a + b, 0);
      for (let i = 0; open > 0; i++) {
        const buyer = buyers[i % buyers.length];
        if (buyer === undefined) break;
        const left = want.get(buyer) ?? 0;
        if (left === 0) continue;
        want.set(buyer, left - 1);
        open -= 1;
        const filled = (seller.data.store[good] ?? 0) > 0;
        if (filled) {
          seller.data.store[good] = (seller.data.store[good] ?? 0) - 1;
          seller.data.coins += price + bonus;
          seller.data.sold = (seller.data.sold ?? 0) + 1; // scoreSales; none before E7
        }
        const name = townOf(ctx.state, buyer).name;
        emit(
          ctx,
          { type: 'trade', seller: seat, buyer, good, price, filled, bonus: filled ? bonus : 0 },
          filled
            ? `${seller.name} sells 1 ${good} to ${name} for ${price}.`
            : `${seller.name} is out of ${good}: ${name} buys it from the bank for ${price}.`,
        );
      }
    }
  };

  // 2c. Build (R4.5.2, R7): place the card (covering), "when built" effects, buildBonus.
  const build: Step = (ctx, seat, pick, card) => {
    if (pick.use !== BUILD) return;
    const town = townOf(ctx.state, seat);
    const def = rules.card(card.def);
    const before = holdings(town.data);
    const cover = argsOf(pick).cover ?? null;
    placeBuild(rules, ctx, seat, card, cover, pick.args);
    for (const e of activeEffects(rules, ctx.state, seat, 'buildBonus')) {
      const self = e.source.kind === 'card' && e.source.card.id === card.id;
      if (!self && e.spec.kind === def.kind) addGains(town.data, e.spec.gains as Gains);
    }
    const gains = gained(before, holdings(town.data));
    emit(ctx, { type: 'build', seat, card, cover, gains }, `${town.name} builds ${def.name}.`);
  };

  const check: Step = (ctx, seat) => {
    greatWorkCheck(rules, ctx, seat);
  };

  // 3. Tolls (R13 `toll`, R17.4): coins per neighbour that Built (a card of `kind`) this turn.
  const toll: Step = (ctx, seat) => {
    const built = new Map(
      (ctx.state.lastReveal?.picks ?? [])
        .filter((p) => p.use === BUILD)
        .map((p) => [p.seat, rules.card(p.card.def).kind]),
    );
    const neighbours = neighboursOf(ctx.state, seat);
    let coins = 0;
    const from = new Set<SeatId>();
    for (const e of activeEffects(rules, ctx.state, seat, 'toll')) {
      const kind = e.spec.kind;
      const paying = neighbours.filter(
        (s) => built.has(s) && (kind === undefined || built.get(s) === kind),
      );
      paying.forEach((s) => from.add(s));
      coins += paying.length * (e.spec.coins as number);
    }
    if (coins > 0) {
      const town = townOf(ctx.state, seat);
      town.data.coins += coins;
      emit(
        ctx,
        { type: 'toll', seat, coins, from: neighbours.filter((s) => from.has(s)) },
        `${town.name} collects ${coins} in tolls.`,
      );
    }
  };

  // 4. Yield (R4.5.4, R17.3), not in Winter (R3.7).
  const yieldStep: Step = (ctx, seat) => {
    if (isWinter(ctx.state)) return;
    const town = townOf(ctx.state, seat);
    const before = holdings(town.data);
    for (const e of activeEffects(rules, ctx.state, seat, 'yield')) {
      addGains(town.data, e.spec.gains as Gains);
    }
    for (const e of activeEffects(rules, ctx.state, seat, 'income')) {
      town.data.coins += e.spec.coins as number;
    }
    const gains = gained(before, holdings(town.data));
    if (!isEmpty(gains)) emit(ctx, { type: 'yield', seat, gains }, `${town.name} yields.`);
  };

  // R11.3: once every town has resolved the turn (the last seat in resolve order).
  const honours: Step = (ctx, seat) => {
    if (seat === ctx.state.seats.length - 1) updateHonourLeaders(rules, ctx);
  };

  return [spend, pay, sell, build, check, toll, yieldStep, check, honours];
}
