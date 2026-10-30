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
 */
import type { Card, CardDefId, Ctx, Pick, ResolveStep, RoundSpec, SeatId } from '../core';
import { neighboursOf } from '../core';
import { placeBuild } from './build';
import { countsIndex, type WwRules } from './content';
import { COINS, addGains } from './gains';
import { greatWorkCheck } from './greatWork';
import { BUILD, SPEND, argsOf, buildCostAfterDiscount, spendGains, type WwPickArgs } from './pick';
import { marketPrice, type Payment } from './pay';
import { activeEffects, townOf } from './town';
import { SEASONS, type Gains, type WwSeat, type WwState, type WwTable } from './types';

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
      ctx.log(seat, 'spend', `${town.name} spends ${def.name}.`, {
        data: { card: card.def, gains },
      });
    }
    for (const g of [...(town.zones[GLEAN] ?? [])]) {
      const def = rules.card(g.def);
      const gains = spendGains(rules, ctx.state, seat, def, args.glean ?? []);
      addGains(town.data, gains);
      ctx.toDiscard(ctx.take(g.id));
      ctx.log(seat, 'glean', `${town.name} gleans a card.`, { data: { gains } });
    }
    // R14.2, R14.3: the burned card leaves the hand face down, with no effect (before the pass).
    if (args.burn !== undefined) {
      ctx.toDiscard(ctx.take(args.burn));
      ctx.log(seat, 'burn', `${town.name} burns a card.`);
    }
  };

  // 2a. Pay (R6.2-R6.5): own goods first, then Exchanges; coins for the cost, purchases and bank.
  const pay: Step = (ctx, seat, pick, card) => {
    if (pick.use !== BUILD) return;
    const town = townOf(ctx.state, seat).data;
    const due = cost(rules, ctx, seat, pick, card);
    const plan = argsOf(pick).pay ?? [];
    for (const g of rules.goods)
      town.store[g] = (town.store[g] ?? 0) - Math.min(town.store[g] ?? 0, due[g] ?? 0);
    let coins = due[COINS] ?? 0;
    for (const p of plan) {
      if (p.via === 'exchange') town.store[p.give] = (town.store[p.give] ?? 0) - t.exchangeRate;
      else coins += p.via === 'buy' ? marketPrice(rules, ctx.state) : t.bankPrice;
    }
    town.coins -= coins;
    if (town.coins < 0 || Object.values(town.store).some((n) => n < 0)) {
      throw new Error(`seat ${seat}: a checked Build could not be paid (R4.7)`);
    }
  };

  // 2b. Sell (R6.6, R6.7), run for each seller: fill its neighbours' purchases from what its own
  // Build left, one good at a time, alternating buyers from its left neighbour. A good it cannot
  // fill comes from the bank at the same price (the buyer already paid; those coins are gone).
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
        }
        const name = townOf(ctx.state, buyer).name;
        ctx.log(
          seat,
          filled ? 'sale' : 'saleShort',
          filled
            ? `${seller.name} sells 1 ${good} to ${name} for ${price}.`
            : `${seller.name} is out of ${good}: ${name} buys it from the bank for ${price}.`,
          {
            data: { good, buyer, price, filled, ...(filled && bonus > 0 ? { bonus } : {}) },
          },
        );
      }
    }
  };

  // 2c. Build (R4.5.2, R7): place the card (covering), "when built" effects, buildBonus.
  const build: Step = (ctx, seat, pick, card) => {
    if (pick.use !== BUILD) return;
    const town = townOf(ctx.state, seat);
    const def = rules.card(card.def);
    placeBuild(rules, ctx, seat, card, argsOf(pick).cover ?? null, pick.args);
    for (const e of activeEffects(rules, ctx.state, seat, 'buildBonus')) {
      const self = e.source.kind === 'card' && e.source.card.id === card.id;
      if (!self && e.spec.kind === def.kind) addGains(town.data, e.spec.gains as Gains);
    }
    ctx.log(seat, 'build', `${town.name} builds ${def.name}.`, { data: { card: card.def } });
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
    for (const e of activeEffects(rules, ctx.state, seat, 'toll')) {
      const kind = e.spec.kind;
      const n = neighbours.filter(
        (s) => built.has(s) && (kind === undefined || built.get(s) === kind),
      ).length;
      coins += n * (e.spec.coins as number);
    }
    if (coins > 0) {
      townOf(ctx.state, seat).data.coins += coins;
      ctx.log(seat, 'toll', `${townOf(ctx.state, seat).name} collects ${coins} in tolls.`, {
        data: { coins },
      });
    }
  };

  // 4. Yield (R4.5.4, R17.3), not in Winter (R3.7).
  const yieldStep: Step = (ctx, seat) => {
    if (isWinter(ctx.state)) return;
    const town = townOf(ctx.state, seat).data;
    for (const e of activeEffects(rules, ctx.state, seat, 'yield'))
      addGains(town, e.spec.gains as Gains);
    for (const e of activeEffects(rules, ctx.state, seat, 'income'))
      town.coins += e.spec.coins as number;
  };

  return [spend, pay, sell, build, check, toll, yieldStep, check];
}
