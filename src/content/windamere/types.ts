/**
 * Windamere's Wonders content types (design lane, card D5). The rules are docs/RULES.md; the
 * catalog with intent notes is docs/design/CARDS.md. R-numbers below cite RULES.md.
 */
import type { CardDef, CardDefId, EffectSpec } from '../../engine';

/** R1.3, in goods order. */
export const GOODS = ['reed', 'peat', 'salt', 'wax', 'horn'] as const;
export type Good = (typeof GOODS)[number];

/** R1.7. */
export const KINDS = ['holding', 'hall', 'market', 'watch', 'lore', 'landmark'] as const;
export type Kind = (typeof KINDS)[number];

/** R3.1, in play order. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Keys a gains or cost object may use (R5.1, R13). Costs use goods and coins only. */
export const GAIN_KEYS = [...GOODS, 'coins', 'labour', 'any'] as const;
export type GainKey = (typeof GAIN_KEYS)[number];

/**
 * A gains or cost object, e.g. `{ peat: 2, coins: 1 }`; `{}` = free. Keys are GainKey (checked by
 * the content tests); the index signature keeps it assignable to the engine's Json.
 */
export interface Gains {
  [key: string]: number;
}

/** R11.5. */
export const MEASURES = [
  'guard',
  'holdings',
  'halls',
  'markets',
  'watches',
  'lore',
  'landmarks',
  'loreRun',
  'tiers',
  'coins',
  'kinds',
  'valour',
] as const;
export type Measure = (typeof MEASURES)[number];

/** R13: every effect type and its params. A new type needs a rules change first (R13.3). */
export const EFFECT_PARAMS = {
  yield: ['gains'],
  income: ['coins'],
  onBuild: ['gains'],
  onBuildPerKind: ['kind', 'gains'],
  renown: ['amount'],
  guard: ['amount'],
  lore: ['rank'],
  exchange: ['good'],
  discount: ['kind', 'amount'],
  toll: ['coins', 'kind?'],
  sellBonus: ['coins'],
  spendBonus: ['kind', 'gains'],
  buildBonus: ['kind', 'gains'],
  heldBonus: ['gains'],
  seasonEnd: ['gains'],
  scorePerKind: ['kind', 'amount'],
  scorePerTier: ['amount'],
  scorePerValour: ['amount'],
  scoreSets: ['amount'],
  scoreGoods: ['per', 'amount'],
  scoreBeat: ['measure', 'amount'],
  scoreThreshold: ['measure', 'atLeast', 'amount'],
  scoreSeasons: ['kind', 'amount'],
} as const satisfies Record<string, readonly string[]>;
export type EffectType = keyof typeof EFFECT_PARAMS;

/** Copies at 3, 4, 5, 6, 7 seats. 2 seats use the 4-seat count (R14.1). */
export type Counts = readonly [number, number, number, number, number];

export interface WwCardDef extends CardDef {
  kind: Kind;
  season: Season;
  /** R6.1; `{}` = free. */
  cost: Gains;
  /** R7.9: may be built for `cost` instead if the town has an uncovered card in `of`. */
  upgrade?: { of: CardDefId[]; cost: Gains };
  /** The Spend band, R5. */
  spend: Gains;
  effects: EffectSpec[];
  counts: Counts;
}

export interface GreatWorkDef {
  id: string;
  name: string;
  /** Active from the reveal, R8.1. */
  perk: EffectSpec[];
  /** Four tiers; an `onBuild` in a reward pays when the tier completes (R8.4). */
  tiers: { threshold: number; reward: EffectSpec[] }[];
}

export interface RaidDef {
  id: string;
  name: string;
  season: Season;
  strength: number;
}

export interface HonourDef {
  id: string;
  name: string;
  measure: Measure;
}
