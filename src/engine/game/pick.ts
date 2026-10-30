/**
 * The R4 pick for 3 to 7 seats: one card, Build or Spend, with every choice it needs (R4.3) in
 * `args`. `normalizePick` fills the choices a pick leaves out with the R15.7 defaults, so a client
 * may send just `{ card, use }`. Reads only the town's own hand and data and public information:
 * view-safe (docs/ENGINE.md §6).
 */
import type { Card, CardId, Json, Pick, SeatId } from '../core';
import { buildCost, checkBuildRules } from './build';
import type { WwRules } from './content';
import { ANY, anyCount, resolveAny, sumGains, COINS } from './gains';
import {
  applyDiscount,
  checkPayment,
  defaultDiscount,
  defaultPayment,
  discountFor,
  missingGoods,
  type PayContext,
  type Payment,
  type Purse,
} from './pay';
import { activeEffects, townOf, uncovered } from './town';
import type { Gains, GoodId, WwCardDef, WwState } from './types';

export const BUILD = 'build';
export const SPEND = 'spend';

/** The choices a pick names (R4.3). */
export interface WwPickArgs {
  /** Goods for the "any" units of the card's Spend band (spend) or its own `onBuild` (build). */
  any?: GoodId[];
  /** Goods for the "any" units of the glean's Spend band (the last turn of a Season, R3.5). */
  glean?: GoodId[];
  /** Build: the uncovered card this upgrade covers, or null for the full cost (R7.9). */
  cover?: CardId | null;
  /** Build: the goods a discount takes off the cost, one entry per good (R6.1). */
  discount?: GoodId[];
  /** Build: how each missing good is paid (R6.3, R6.6), in goods order. */
  pay?: Payment[];
  /** 2 seats, turns 1 to 4: the other card from the hand, burned (R14.2). */
  burn?: CardId;
}

const ARG_KEYS = new Set(['any', 'glean', 'cover', 'discount', 'pay', 'burn']);
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function argsOf(pick: Pick): WwPickArgs {
  return (isRecord(pick.args) ? pick.args : {}) as WwPickArgs;
}

const lastTurn = (state: WwState) => state.turn === state.roundPicks - 1;

/** R14.2: with 2 seats a town also burns a card on every turn but the last. */
export function burnsThisTurn(state: WwState): boolean {
  return state.seats.length === 2 && !lastTurn(state);
}

/** R3.5: on the last turn of a Season, the hand's other card is the glean. */
export function gleanOf(state: WwState, seat: SeatId, card: CardId): Card | null {
  if (!lastTurn(state)) return null;
  return townOf(state, seat).hand.find((c) => c.id !== card) ?? null;
}

/** R15.6 default Burn: the first card in hand order that is not the picked one. */
function defaultBurn(state: WwState, seat: SeatId, card: CardId): CardId | undefined {
  return townOf(state, seat).hand.find((c) => c.id !== card)?.id;
}

/** R5.4: the `spendBonus` gains for Spending a card of the def's kind. */
export function spendBonus(rules: WwRules, state: WwState, seat: SeatId, def: WwCardDef): Gains {
  return activeEffects(rules, state, seat, 'spendBonus')
    .filter((e) => e.spec.kind === def.kind)
    .reduce<Gains>((g, e) => sumGains(g, e.spec.gains as Gains), {});
}

/** What Spending `def` gives the town (R5.1, R5.4), with its "any" goods chosen. */
export function spendGains(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  def: WwCardDef,
  chosen: readonly GoodId[],
): Gains {
  return sumGains(resolveAny(def.spend, chosen), spendBonus(rules, state, seat, def));
}

/** The town's store and coins, plus `extra` gains (a glean's, R4.2). */
export function purseOf(state: WwState, seat: SeatId, extra: Gains = {}): Purse {
  const town = townOf(state, seat).data;
  const store = { ...town.store };
  for (const g of Object.keys(store)) store[g] = (store[g] ?? 0) + (extra[g] ?? 0);
  return { store, coins: town.coins + (extra[COINS] ?? 0) };
}

/**
 * R15.7 "any good": for each unit, the first good (goods order) still lacking from `lacking`;
 * if none, the good the town holds fewest of (ties: goods order).
 */
export function defaultAny(
  rules: WwRules,
  store: Record<GoodId, number>,
  lacking: readonly GoodId[],
  n: number,
): GoodId[] {
  const need = [...lacking];
  const held = { ...store };
  const out: GoodId[] = [];
  for (let i = 0; i < n; i++) {
    let g = rules.goods.find((x) => need.includes(x));
    if (g !== undefined) need.splice(need.indexOf(g), 1);
    else g = rules.goods.reduce((a, b) => ((held[b] ?? 0) < (held[a] ?? 0) ? b : a));
    held[g] = (held[g] ?? 0) + 1;
    out.push(g);
  }
  return out;
}

const onBuildAny = (def: WwCardDef) =>
  def.effects
    .filter((e) => e.type === 'onBuild')
    .reduce((n, e) => n + anyCount(e.gains as Gains), 0);

/** R15.7 upgrade default: the first uncovered card in town order that this card upgrades. */
export function defaultCover(state: WwState, seat: SeatId, def: WwCardDef): CardId | null {
  if (!def.upgrade) return null;
  const of = def.upgrade.of;
  return uncovered(state, seat).find((c) => of.includes(c.def))?.id ?? null;
}

/** The cost of a Build after its discount, or why the discount choice is wrong. */
export function buildCostAfterDiscount(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  def: WwCardDef,
  cover: CardId | null,
  discount: unknown,
): Gains | string {
  const cost = buildCost(rules, def.id, cover);
  return applyDiscount(rules, cost, discountFor(rules, state, seat, def.kind), discount ?? []);
}

/** Fill every choice the pick leaves out (R4.3) with the R15.7 defaults. Never throws. */
export function normalizePick(rules: WwRules, state: WwState, seat: SeatId, pick: Pick): Pick {
  try {
    if (pick.args !== undefined && !isRecord(pick.args)) return pick;
    const args: WwPickArgs = { ...argsOf(pick) };
    const town = townOf(state, seat);
    const card = town.hand.find((c) => c.id === pick.card);
    if (!card) return pick;
    const def = rules.card(card.def);
    const glean = gleanOf(state, seat, pick.card);
    const gleanDef = glean ? rules.card(glean.def) : null;
    if (burnsThisTurn(state) && !('burn' in args)) {
      const burn = defaultBurn(state, seat, pick.card);
      if (burn !== undefined) args.burn = burn;
    }
    if (pick.use === SPEND) {
      args.any ??= defaultAny(rules, town.data.store, [], anyCount(def.spend));
      if (gleanDef) {
        const after = purseOf(state, seat, spendGains(rules, state, seat, def, args.any)).store;
        args.glean ??= defaultAny(rules, after, [], anyCount(gleanDef.spend));
      }
    } else if (pick.use === BUILD) {
      if (!('cover' in args)) args.cover = defaultCover(state, seat, def);
      const cover = args.cover ?? null;
      const cost = buildCost(rules, def.id, cover);
      args.discount ??= defaultDiscount(rules, cost, discountFor(rules, state, seat, def.kind));
      const paid = applyDiscount(
        rules,
        cost,
        discountFor(rules, state, seat, def.kind),
        args.discount,
      );
      if (typeof paid === 'string') return pick;
      if (gleanDef) {
        // The glean's "any" goods go first to what the Build still lacks after its named gains.
        const named = spendGains(
          rules,
          state,
          seat,
          { ...gleanDef, spend: withoutAny(gleanDef.spend) },
          [],
        );
        const lacking = missingGoods(rules, paid, purseOf(state, seat, named));
        args.glean ??= defaultAny(rules, town.data.store, lacking, anyCount(gleanDef.spend));
      }
      const purse = purseOf(
        state,
        seat,
        gleanDef ? spendGains(rules, state, seat, gleanDef, args.glean ?? []) : {},
      );
      args.any ??= defaultAny(rules, afterPaying(rules, purse, paid), [], onBuildAny(def));
      if (!('pay' in args)) {
        const plan = defaultPayment({ rules, state, seat, cost: paid, purse });
        if (plan) args.pay = plan;
      }
    }
    return { ...pick, args: args as unknown as Json };
  } catch {
    return pick;
  }
}

function withoutAny(gains: Gains): Gains {
  const out: Gains = {};
  for (const [k, v] of Object.entries(gains)) if (k !== ANY) out[k] = v;
  return out;
}

/** The store left after paying a cost's goods from it (for the "fewest held" default). */
function afterPaying(rules: WwRules, purse: Purse, cost: Gains): Record<GoodId, number> {
  const out = { ...purse.store };
  for (const g of rules.goods) out[g] = Math.max(0, (out[g] ?? 0) - (cost[g] ?? 0));
  return out;
}

function checkGoods(rules: WwRules, list: unknown, n: number, what: string): string | null {
  if (n === 0)
    return list === undefined || (Array.isArray(list) && list.length === 0)
      ? null
      : `${what}: no "any" goods to choose`;
  if (!Array.isArray(list) || list.length !== n) return `${what}: name ${n} good(s)`;
  for (const g of list)
    if (typeof g !== 'string' || !rules.goods.includes(g))
      return `${what}: unknown good ${String(g)}`;
  return null;
}

/** Why the (normalized) pick is not legal (R4.1-R4.3), or null. */
export function validatePick(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  pick: Pick,
): string | null {
  if (pick.use !== BUILD && pick.use !== SPEND) return 'use must be build or spend';
  if (pick.args !== undefined && !isRecord(pick.args)) return 'args must be an object';
  const args = argsOf(pick);
  for (const k of Object.keys(args)) if (!ARG_KEYS.has(k)) return `unknown pick choice ${k}`;
  const town = townOf(state, seat);
  const card = town.hand.find((c) => c.id === pick.card);
  if (!card) return `card ${pick.card} is not in your hand`;
  const def = rules.card(card.def);
  const glean = gleanOf(state, seat, pick.card);
  const gleanDef = glean ? rules.card(glean.def) : null;
  const gleanErr = checkGoods(rules, args.glean, gleanDef ? anyCount(gleanDef.spend) : 0, 'glean');
  if (gleanErr) return gleanErr;
  if (burnsThisTurn(state)) {
    if (typeof args.burn !== 'number') return 'with 2 towns, also burn a card (R14.2)';
    if (args.burn === pick.card) return 'burn a different card from the one you pick';
    if (!town.hand.some((c) => c.id === args.burn)) return `card ${args.burn} is not in your hand`;
  } else if ('burn' in args) {
    return state.seats.length === 2
      ? 'nothing is burned on the last turn (R14.4)'
      : 'only 2 towns burn cards (R14.2)';
  }

  if (pick.use === SPEND) {
    // R17.2: a Spend is always legal.
    for (const k of ['cover', 'discount', 'pay'] as const)
      if (k in args) return `a Spend has no ${k}`;
    return checkGoods(rules, args.any, anyCount(def.spend), 'any');
  }
  const cover = args.cover ?? null;
  if (cover !== null && typeof cover !== 'number') return 'cover must be a card id or null';
  const rule = checkBuildRules(rules, state, seat, def.id, cover);
  if (rule) return rule;
  const paid = buildCostAfterDiscount(rules, state, seat, def, cover, args.discount);
  if (typeof paid === 'string') return paid;
  const anyErr = checkGoods(rules, args.any, onBuildAny(def), 'any');
  if (anyErr) return anyErr;
  const purse = purseOf(
    state,
    seat,
    gleanDef ? spendGains(rules, state, seat, gleanDef, args.glean ?? []) : {},
  );
  const pc: PayContext = { rules, state, seat, cost: paid, purse };
  const payErr = checkPayment(pc, args.pay ?? []);
  return payErr ? `cannot pay for ${def.name}: ${payErr}` : null;
}

/**
 * Spend every card, and Build every card the town can pay for (default choices; R7.9 both ways).
 * With 2 seats, each of those with every other card of the hand as the Burn (R14.2).
 */
export function legalPicks(rules: WwRules, state: WwState, seat: SeatId): Pick[] {
  const hand = townOf(state, seat).hand;
  const out: Pick[] = [];
  for (const card of hand) {
    const build = normalizePick(rules, state, seat, { card: card.id, use: BUILD });
    const base = [normalizePick(rules, state, seat, { card: card.id, use: SPEND }), build];
    if (argsOf(build).cover != null) {
      base.push(
        normalizePick(rules, state, seat, { card: card.id, use: BUILD, args: { cover: null } }),
      );
    }
    for (const p of base) {
      if (!burnsThisTurn(state)) {
        out.push(p);
        continue;
      }
      for (const other of hand) {
        if (other.id !== card.id)
          out.push({ ...p, args: { ...(p.args as object), burn: other.id } });
      }
    }
  }
  return out.filter((p) => validatePick(rules, state, seat, p) === null);
}

/** R15.6 fallback pick: Build nothing; Spend the first card in hand order (2 seats: Burn the second). */
export function defaultPick(rules: WwRules, state: WwState, seat: SeatId): Pick {
  const first = townOf(state, seat).hand[0];
  return normalizePick(rules, state, seat, { card: first?.id ?? -1, use: SPEND });
}
