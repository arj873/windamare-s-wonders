/**
 * R6 paying for a Build: discounts, the missing goods, the ways to pay each one (a neighbour, an
 * Exchange, the bank), checking a chosen plan and R15.7's default plan. Pure reads of public
 * information and the town's own data, so everything here works on the town's own view.
 */
import { neighboursOf, type SeatId } from '../core';
import type { WwRules } from './content';
import { COINS } from './gains';
import { activeEffects, townOf } from './town';
import type { Gains, GoodId, Kind, WwState } from './types';

/** How one missing good is paid (R6.3). A plan lists one per missing good, in goods order. */
export type Payment =
  | { good: GoodId; via: 'buy'; from: SeatId }
  | { good: GoodId; via: 'exchange'; give: GoodId }
  | { good: GoodId; via: 'bank' };

/** What the town can pay with this turn: its store and coins, plus a glean's gains (R4.2). */
export interface Purse {
  store: Record<GoodId, number>;
  coins: number;
}

/** Everything a payment check needs. `cost` is after the discount. */
export interface PayContext {
  rules: WwRules;
  state: WwState;
  seat: SeatId;
  cost: Gains;
  purse: Purse;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** R6.1, R13 `discount`: how many goods the town's discounts take off a card of `kind`. */
export function discountFor(rules: WwRules, state: WwState, seat: SeatId, kind: Kind): number {
  return activeEffects(rules, state, seat, 'discount')
    .filter((e) => e.spec.kind === kind)
    .reduce((n, e) => n + ((e.spec.amount as number | undefined) ?? 0), 0);
}

/** How many goods a discount of `total` removes from `cost` (no part goes below 0, R6.1). */
export function discountSize(rules: WwRules, cost: Gains, total: number): number {
  const goods = rules.goods.reduce((n, g) => n + (cost[g] ?? 0), 0);
  return Math.min(total, goods);
}

/** R15.7: a discount comes off goods in goods order. */
export function defaultDiscount(rules: WwRules, cost: Gains, total: number): GoodId[] {
  const out: GoodId[] = [];
  let left = discountSize(rules, cost, total);
  for (const g of rules.goods) {
    for (let i = 0; i < (cost[g] ?? 0) && left > 0; i++, left--) out.push(g);
  }
  return out;
}

/** `cost` without the `removed` goods, or why `removed` is not a valid discount choice. */
export function applyDiscount(
  rules: WwRules,
  cost: Gains,
  total: number,
  removed: unknown,
): Gains | string {
  if (!Array.isArray(removed)) return 'discount must be a list of goods';
  if (removed.length !== discountSize(rules, cost, total)) {
    return `the discount takes off exactly ${discountSize(rules, cost, total)} good(s)`;
  }
  const left: Gains = { ...cost };
  for (const g of removed) {
    if (typeof g !== 'string' || !rules.goods.includes(g)) return `unknown good ${String(g)}`;
    if ((left[g] ?? 0) < 1) return `the cost has no more ${g} to discount`;
    left[g] = (left[g] ?? 0) - 1;
  }
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n > 0));
}

/** R6.5: the goods still missing after the town's own goods pay first, one entry per good. */
export function missingGoods(rules: WwRules, cost: Gains, purse: Purse): GoodId[] {
  const out: GoodId[] = [];
  for (const g of rules.goods) {
    const short = (cost[g] ?? 0) - (purse.store[g] ?? 0);
    for (let i = 0; i < short; i++) out.push(g);
  }
  return out;
}

/** R6.3 Exchanges the town can use: the goods it can give, in town order (deduplicated). */
export function exchangeGoods(rules: WwRules, state: WwState, seat: SeatId): GoodId[] {
  const out: GoodId[] = [];
  for (const e of activeEffects(rules, state, seat, 'exchange')) {
    const g = e.spec.good as GoodId;
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

/** R6.6c: the Season's market price. */
export function marketPrice(rules: WwRules, state: WwState): number {
  return rules.tunables.marketPrice[state.round] ?? 0;
}

/** Coins the plan costs on top of the cost's own coins. */
export function planCoins(pc: PayContext, plan: readonly Payment[]): number {
  const t = pc.rules.tunables;
  const price = marketPrice(pc.rules, pc.state);
  return plan.reduce(
    (n, p) => n + (p.via === 'buy' ? price : p.via === 'bank' ? t.bankPrice : 0),
    0,
  );
}

/** Why `plan` does not pay for the cost, or null. `plan` is untrusted JSON. */
export function checkPayment(pc: PayContext, plan: unknown): string | null {
  const { rules, state, seat, cost, purse } = pc;
  const t = rules.tunables;
  if (!Array.isArray(plan)) return 'pay must be a list';
  const missing = missingGoods(rules, cost, purse);
  if (plan.length !== missing.length) {
    return missing.length === 0
      ? 'nothing is missing: pay from your store'
      : `pay names ${plan.length} good(s), ${missing.length} are missing`;
  }
  const want = new Map<GoodId, number>();
  for (const g of missing) want.set(g, (want.get(g) ?? 0) + 1);
  const neighbours = neighboursOf(state, seat);
  const exchanges = exchangeGoods(rules, state, seat);
  const bought = new Map<SeatId, number>();
  const boughtGood = new Map<string, number>();
  const given = new Map<GoodId, number>();
  for (const p of plan as unknown[]) {
    if (!isRecord(p) || typeof p.good !== 'string') return 'each payment names a good';
    const good = p.good;
    const left = want.get(good) ?? 0;
    if (left === 0) return `${good} is not missing (R6.5)`;
    want.set(good, left - 1);
    if (p.via === 'buy') {
      const from = p.from;
      if (typeof from !== 'number' || !neighbours.includes(from)) {
        return 'buy only from a neighbour (R6.6)';
      }
      const n = (bought.get(from) ?? 0) + 1;
      if (n > t.buyLimit) return `at most ${t.buyLimit} goods from each neighbour a turn (R6.6b)`;
      bought.set(from, n);
      const key = `${from}:${good}`;
      const k = (boughtGood.get(key) ?? 0) + 1;
      if (k > (townOf(state, from).data.store[good] ?? 0)) {
        return `${townOf(state, from).name} holds only ${townOf(state, from).data.store[good] ?? 0} ${good} (R6.6a)`;
      }
      boughtGood.set(key, k);
    } else if (p.via === 'exchange') {
      const give = p.give;
      if (typeof give !== 'string' || !exchanges.includes(give)) return 'no Exchange for that good';
      if (give === good) return 'an Exchange cannot give the missing good itself (R6.3)';
      given.set(give, (given.get(give) ?? 0) + t.exchangeRate);
    } else if (p.via !== 'bank') {
      return 'pay each good by buy, exchange or bank';
    }
  }
  for (const [g, n] of given) {
    const spare = (purse.store[g] ?? 0) - (cost[g] ?? 0);
    if (n > spare) return `not enough ${g} to exchange`;
  }
  const coins = (cost[COINS] ?? 0) + planCoins(pc, plan as Payment[]);
  if (coins > purse.coins) return `needs ${coins} coins, you have ${purse.coins}`;
  return null;
}

/** All ways to split `n` units among `slots`, as counts per slot (multisets). */
function splits(n: number, slots: number): number[][] {
  if (slots === 0) return n === 0 ? [[]] : [];
  const out: number[][] = [];
  for (let k = 0; k <= n; k++) for (const rest of splits(n - k, slots - 1)) out.push([k, ...rest]);
  return out;
}

/**
 * R15.7's default plan: the fewest coins, then the fewest goods given in Exchanges, then buying
 * from the left neighbour before the right, Exchanges in town order and goods in goods order.
 * null when the town cannot pay (R4.2). Tries every split of the missing goods among Exchanges,
 * neighbours (at most `buyLimit` each) and the bank; small, since a cost has a few goods.
 */
export function defaultPayment(pc: PayContext): Payment[] | null {
  const { rules, state, seat, cost, purse } = pc;
  const t = rules.tunables;
  const missing = missingGoods(rules, cost, purse);
  if (missing.length === 0) return checkPayment(pc, []) === null ? [] : null;
  const goods = rules.goods.filter((g) => missing.includes(g));
  const need = goods.map((g) => missing.filter((m) => m === g).length);
  const neighbours = neighboursOf(state, seat);
  const exchanges = exchangeGoods(rules, state, seat);
  const spare = exchanges.map((x) => Math.max(0, (purse.store[x] ?? 0) - (cost[x] ?? 0)));

  let best: { key: number[]; plan: Payment[] } | null = null;
  const consider = (plan: Payment[]) => {
    if (checkPayment(pc, plan) !== null) return;
    const exchanged = plan.filter((p) => p.via === 'exchange').length;
    const rank = (p: Payment) =>
      p.via === 'buy'
        ? neighbours.indexOf(p.from)
        : p.via === 'exchange'
          ? 10 + exchanges.indexOf(p.give)
          : 100;
    const key = [planCoins(pc, plan), exchanged * t.exchangeRate, ...plan.map(rank)];
    if (!best || compare(key, best.key) < 0) best = { key, plan };
  };

  // Exchanges: for each missing good, how many units each usable Exchange covers.
  const exchangeChoices = goods.map((g, i) => {
    const usable = exchanges.map((x) => x !== g);
    return splits(need[i] ?? 0, exchanges.length + 1).filter((s) =>
      s.slice(0, exchanges.length).every((k, j) => k === 0 || usable[j]),
    );
  });
  const walk = (i: number, used: number[], chosen: number[][]) => {
    if (i === goods.length) return buys(chosen);
    for (const s of exchangeChoices[i] ?? []) {
      const next = used.map((u, j) => u + (s[j] ?? 0) * t.exchangeRate);
      if (next.some((u, j) => u > (spare[j] ?? 0))) continue;
      walk(i + 1, next, [...chosen, s]);
    }
  };
  // Buys: for the units left, how many of each good each neighbour sells (then the bank).
  const buys = (ex: number[][]) => {
    const rest = goods.map(
      (_, i) => (need[i] ?? 0) - (ex[i] ?? []).slice(0, -1).reduce((a, b) => a + b, 0),
    );
    const perNeighbour = neighbours.map((n) =>
      splits(t.buyLimit, goods.length + 1)
        .map((s) => s.slice(0, goods.length))
        .filter((s) =>
          s.every(
            (k, i) => k <= Math.min(rest[i] ?? 0, townOf(state, n).data.store[goods[i] ?? ''] ?? 0),
          ),
        ),
    );
    const combine = (k: number, taken: number[], plan: number[][]) => {
      if (k === neighbours.length) return consider(toPlan(ex, plan));
      for (const s of perNeighbour[k] ?? []) {
        const next = taken.map((x, i) => x + (s[i] ?? 0));
        if (next.some((x, i) => x > (rest[i] ?? 0))) continue;
        combine(k + 1, next, [...plan, s]);
      }
    };
    combine(
      0,
      goods.map(() => 0),
      [],
    );
  };
  const toPlan = (ex: number[][], bought: number[][]): Payment[] => {
    const plan: Payment[] = [];
    goods.forEach((good, i) => {
      let n = need[i] ?? 0;
      neighbours.forEach((from, k) => {
        for (let j = 0; j < (bought[k]?.[i] ?? 0); j++, n--) plan.push({ good, via: 'buy', from });
      });
      exchanges.forEach((give, j) => {
        for (let m = 0; m < (ex[i]?.[j] ?? 0); m++, n--) plan.push({ good, via: 'exchange', give });
      });
      for (; n > 0; n--) plan.push({ good, via: 'bank' });
    });
    return plan;
  };
  walk(
    0,
    exchanges.map(() => 0),
    [],
  );
  return (best as { plan: Payment[] } | null)?.plan ?? null;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
