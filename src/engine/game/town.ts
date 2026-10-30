/**
 * Reading a town: its uncovered cards, kinds, active effects with their sources, Guard, Lore and
 * the R11.4 measures. Everything here reads public information only, so it works on views too.
 */
import {
  neighboursOf,
  type Card,
  type CardId,
  type EffectSpec,
  type SeatId,
  type SeatState,
} from '../core';
import type { WwRules } from './content';
import { storeTotal } from './gains';
import { KINDS, type Kind, type Measure, type WwSeat, type WwState } from './types';

/** Where an active effect comes from (R12.2 scores Renown by source). */
export type EffectSource =
  | { kind: 'card'; card: Card }
  | { kind: 'perk'; greatWork: string }
  | { kind: 'tier'; greatWork: string; tier: number };

export interface ActiveEffect {
  spec: EffectSpec;
  source: EffectSource;
}

export function townOf(state: WwState, seat: SeatId): SeatState<WwSeat> {
  const s = state.seats[seat];
  if (!s) throw new Error(`no seat ${seat}`);
  return s;
}

/**
 * The town's uncovered cards, in build order (R7.1). Covered cards live in the `covered` zone
 * (R7.9), so the tableau holds exactly the uncovered ones.
 */
export function uncovered(state: WwState, seat: SeatId): Card[] {
  return townOf(state, seat).tableau;
}

/** Number of uncovered cards of `kind` (R7.10). */
export function countKind(rules: WwRules, state: WwState, seat: SeatId, kind: string): number {
  return uncovered(state, seat).filter((c) => rules.card(c.def).kind === kind).length;
}

/** Uncovered cards of every kind, in R1.7 order. */
export function kindCounts(rules: WwRules, state: WwState, seat: SeatId): Record<Kind, number> {
  const out = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
  for (const c of uncovered(state, seat)) out[rules.card(c.def).kind] += 1;
  return out;
}

/** The Perk and the completed tiers' rewards of the town's Great Work (R8.1, R8.4). */
export function greatWorkEffects(rules: WwRules, town: WwSeat): ActiveEffect[] {
  if (town.greatWork === null) return [];
  const gw = rules.greatWork(town.greatWork);
  const out: ActiveEffect[] = gw.perk.map((spec) => ({
    spec,
    source: { kind: 'perk', greatWork: gw.id },
  }));
  gw.tiers.slice(0, town.tiers).forEach((tier, i) => {
    for (const spec of tier.reward) {
      out.push({ spec, source: { kind: 'tier', greatWork: gw.id, tier: i + 1 } });
    }
  });
  return out;
}

/**
 * Every effect acting for the town (R13.1): uncovered cards in build order, then the Perk, then
 * completed tiers I to IV. Only those of `type` if given.
 */
export function activeEffects(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  type?: string,
): ActiveEffect[] {
  const all: ActiveEffect[] = [];
  for (const card of uncovered(state, seat)) {
    for (const spec of rules.card(card.def).effects) {
      all.push({ spec, source: { kind: 'card', card } });
    }
  }
  all.push(...greatWorkEffects(rules, townOf(state, seat).data));
  return type === undefined ? all : all.filter((e) => e.spec.type === type);
}

const amountOf = (spec: EffectSpec, key = 'amount'): number => {
  const v = spec[key];
  return typeof v === 'number' ? v : 0;
};

/** R9.2: `guard` effects on uncovered cards, completed tiers and the Perk. */
export function guardOf(rules: WwRules, state: WwState, seat: SeatId): number {
  return activeEffects(rules, state, seat, 'guard').reduce((a, e) => a + amountOf(e.spec), 0);
}

/** R10.1, R10.2: the distinct Lore ranks of the town, ascending. */
export function loreRanks(rules: WwRules, state: WwState, seat: SeatId): number[] {
  const ranks = new Set(
    activeEffects(rules, state, seat, 'lore').map((e) => amountOf(e.spec, 'rank')),
  );
  return [...ranks].sort((a, b) => a - b);
}

/** R10.2: lengths of the runs (longest blocks of consecutive ranks) in ascending distinct ranks. */
export function loreRuns(ranks: readonly number[]): number[] {
  const runs: number[] = [];
  let prev: number | null = null;
  for (const r of ranks) {
    if (prev !== null && r === prev + 1) runs[runs.length - 1] = (runs[runs.length - 1] ?? 0) + 1;
    else runs.push(1);
    prev = r;
  }
  return runs;
}

/** R10.3: Renown for the town's Lore. */
export function loreScore(rules: WwRules, state: WwState, seat: SeatId): number {
  const table = rules.tunables.loreRunScores;
  return loreRuns(loreRanks(rules, state, seat)).reduce(
    (a, len) => a + (table[Math.min(len, table.length) - 1] ?? 0),
    0,
  );
}

/** R11.4: a town's value for an Honour or a `scoreBeat`. */
export function measure(rules: WwRules, state: WwState, seat: SeatId, m: Measure): number {
  const town = townOf(state, seat).data;
  switch (m) {
    case 'guard':
      return guardOf(rules, state, seat);
    case 'holdings':
      return countKind(rules, state, seat, 'holding');
    case 'halls':
      return countKind(rules, state, seat, 'hall');
    case 'markets':
      return countKind(rules, state, seat, 'market');
    case 'loreRun':
      return Math.max(0, ...loreRuns(loreRanks(rules, state, seat)));
    case 'tiers':
      return town.tiers;
    case 'coins':
      return town.coins;
    case 'kinds':
      return Object.values(kindCounts(rules, state, seat)).filter((n) => n > 0).length;
  }
}

/** Number of the town's neighbours (each counted once, R14.5) whose measure is strictly lower. */
export function neighboursBeaten(rules: WwRules, state: WwState, seat: SeatId, m: Measure): number {
  const mine = measure(rules, state, seat, m);
  return neighboursOf(state, seat).filter((n) => measure(rules, state, n, m) < mine).length;
}

/** Goods left in the town's store (R12.2g: goods score nothing unless an effect says so). */
export function goodsHeld(state: WwState, seat: SeatId): number {
  return storeTotal(townOf(state, seat).data.store);
}

/** The card the town's `covered` card `id` lies under, or null (R7.9). */
export function coveredBy(state: WwState, seat: SeatId, id: CardId): CardId | null {
  return townOf(state, seat).data.covers.find((c) => c.card === id)?.by ?? null;
}
