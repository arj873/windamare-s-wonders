/**
 * Small helpers so the catalog reads like the CARDS.md tables. They run once at import and
 * produce plain data (WwCardDef objects); nothing here is needed at play time.
 */
import type { EffectSpec } from '../../engine';
import type { Gains, Good, Kind, Measure } from './types';

const SHORT: Record<string, string> = {
  R: 'reed',
  P: 'peat',
  S: 'salt',
  W: 'wax',
  H: 'horn',
  c: 'coins',
  lab: 'labour',
  any: 'any',
};

/** Parses the CARDS.md shorthand: `g('2P 1W 3c 1lab 2any')`; `g('')` or `g('—')` = free. */
export function g(text: string): Gains {
  const out: Gains = {};
  for (const part of text.trim().split(/\s+/)) {
    if (part === '' || part === '—') continue;
    const m = /^(\d+)(R|P|S|W|H|c|lab|any)$/.exec(part);
    const key = m?.[2] === undefined ? undefined : SHORT[m[2]];
    if (!m || key === undefined) throw new Error(`bad gains term "${part}" in "${text}"`);
    if (key in out) throw new Error(`repeated gains term "${part}" in "${text}"`);
    out[key] = Number(m[1]);
  }
  return out;
}

/** R13 effect builders. Gains arguments use the shorthand of `g`. */
export const fx = {
  yield: (gains: string): EffectSpec => ({ type: 'yield', gains: g(gains) }),
  income: (coins: number): EffectSpec => ({ type: 'income', coins }),
  onBuild: (gains: string): EffectSpec => ({ type: 'onBuild', gains: g(gains) }),
  onBuildPerKind: (kind: Kind, gains: string): EffectSpec => ({
    type: 'onBuildPerKind',
    kind,
    gains: g(gains),
  }),
  renown: (amount: number): EffectSpec => ({ type: 'renown', amount }),
  guard: (amount: number): EffectSpec => ({ type: 'guard', amount }),
  lore: (rank: number): EffectSpec => ({ type: 'lore', rank }),
  exchange: (good: Good): EffectSpec => ({ type: 'exchange', good }),
  discount: (kind: Kind, amount: number): EffectSpec => ({ type: 'discount', kind, amount }),
  toll: (coins: number, kind?: Kind): EffectSpec =>
    kind ? { type: 'toll', coins, kind } : { type: 'toll', coins },
  sellBonus: (coins: number): EffectSpec => ({ type: 'sellBonus', coins }),
  spendBonus: (kind: Kind, gains: string): EffectSpec => ({
    type: 'spendBonus',
    kind,
    gains: g(gains),
  }),
  buildBonus: (kind: Kind, gains: string): EffectSpec => ({
    type: 'buildBonus',
    kind,
    gains: g(gains),
  }),
  heldBonus: (gains: string): EffectSpec => ({ type: 'heldBonus', gains: g(gains) }),
  seasonEnd: (gains: string): EffectSpec => ({ type: 'seasonEnd', gains: g(gains) }),
  scorePerKind: (kind: Kind, amount: number): EffectSpec => ({
    type: 'scorePerKind',
    kind,
    amount,
  }),
  scorePerTier: (amount: number): EffectSpec => ({ type: 'scorePerTier', amount }),
  scorePerValour: (amount: number): EffectSpec => ({ type: 'scorePerValour', amount }),
  scoreSets: (amount: number): EffectSpec => ({ type: 'scoreSets', amount }),
  scoreGoods: (per: number, amount: number): EffectSpec => ({ type: 'scoreGoods', per, amount }),
  scoreBeat: (measure: Measure, amount: number): EffectSpec => ({
    type: 'scoreBeat',
    measure,
    amount,
  }),
  scoreThreshold: (measure: Measure, atLeast: number, amount: number): EffectSpec => ({
    type: 'scoreThreshold',
    measure,
    atLeast,
    amount,
  }),
  scoreSeasons: (kind: Kind, amount: number): EffectSpec => ({
    type: 'scoreSeasons',
    kind,
    amount,
  }),
};
