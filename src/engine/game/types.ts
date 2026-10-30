/**
 * Windamere's Wonders: content and state types (docs/RULES.md, data spec in docs/design/CARDS.md
 * §1). Goods are data: their ids come from `WwContent.goods`, never from code.
 */
import type { CardDef, CardDefId, CardId, DraftState, EffectSpec } from '../core';

export type GoodId = string;

export interface GoodDef {
  id: GoodId;
  name: string;
}

/** R1.7 */
export const KINDS = ['holding', 'hall', 'market', 'watch', 'lore', 'landmark'] as const;
export type Kind = (typeof KINDS)[number];

/** R3.1, in order: round index = Season index. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** R11.5 measure ids (Honours, `scoreBeat`, `scoreThreshold`). */
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

/**
 * Gains or a cost (R5.1, R13): good ids, `coins`, `labour`, and `any` (one good of the town's
 * choice per unit; Spend bands and a card's own `onBuild` only, R13.4). Costs use goods and coins.
 */
export type Gains = Record<string, number>;

export interface WwCardDef extends CardDef {
  kind: Kind;
  season: Season;
  /** `{}` = free (R6.1). */
  cost: Gains;
  /** R7.9 */
  upgrade?: { of: CardDefId[]; cost: Gains };
  /** The Spend band (R5). */
  spend: Gains;
  /** Copies at 3, 4, 5, 6, 7 seats; 2 seats use the 4-seat count (R14.1). */
  counts: readonly number[];
}

export interface GreatWorkTier {
  threshold: number;
  /** R8.4: R13 effects; `onBuild` pays once, when the tier completes. */
  reward: EffectSpec[];
}

export interface GreatWorkDef {
  id: string;
  name: string;
  /** Active from the reveal to the end (R8.1). */
  perk: EffectSpec[];
  /** Tiers I to IV, thresholds rising (R8.1). */
  tiers: GreatWorkTier[];
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

/** The R16 numbers this code uses. Missing keys take `DEFAULT_TUNABLES`. */
export interface WwTunables {
  /** R2.2 */
  startingCoins: number;
  /** R2.3 */
  honoursPerGame: number;
  /** R2.4: Great Works dealt to each town to choose from. */
  greatWorksOffered: number;
  /** R3.2, 3-7 seats. One more than `turnsPerSeason`: the last turn's spare card is the glean. */
  handSize: number;
  /** R3.4 */
  turnsPerSeason: number;
  /** R14.1: hand size with 2 seats (two cards a turn on turns 1 to 4, pick + glean on the last). */
  twoSeatHandSize: number;
  /** R6.3: coins per missing good bought from the bank. */
  bankPrice: number;
  /** R6.3: goods an Exchange gives for one missing good. */
  exchangeRate: number;
  /** R6.6b: goods a town may buy from each neighbour per turn. */
  buyLimit: number;
  /** R6.6c: coins per good bought from a neighbour, per Season. */
  marketPrice: number[];
  /** R9.4, per Season. */
  valourBySeason: number[];
  /** R9.5: coins lost per point of Guard short. */
  plunderPerPoint: number;
  /** R9.6: coins per plundered neighbour. */
  bountyPerNeighbour: number;
  /** R10.3: Renown for a run of length i + 1. */
  loreRunScores: number[];
  /** R11.2 */
  honourSole: number;
  honourTied: number;
  /** R12.2g */
  coinsPerRenown: number;
}

/** Everything the Windamere rules read as data (design lane: `src/content/`). */
export interface WwContent {
  /** In goods order (R1.3). */
  goods: readonly GoodDef[];
  cards: readonly WwCardDef[];
  greatWorks: readonly GreatWorkDef[];
  raids: readonly RaidDef[];
  honours: readonly HonourDef[];
  tunables?: Partial<WwTunables>;
}

/** A town's public data (R1.11: all of it is public). */
export interface WwSeat {
  coins: number;
  /** Every good of the content, in goods order (R1.3). */
  store: Record<GoodId, number>;
  /** Only ever goes up (R8.2). */
  labour: number;
  /** The chosen Great Work; null until the choice is revealed (R2.5). */
  greatWork: string | null;
  /** Completed tiers, 0 to 4 (R8.3). */
  tiers: number;
  /** Valour tokens, each worth its Season's value in Renown (R9.4). */
  valour: number[];
  /** R7.9: `card` lies under `by`, in the public `covered` zone. */
  covers: { card: CardId; by: CardId }[];
}

export interface WwTable {
  /** The Honours revealed at setup (R2.3); public. */
  honours: string[];
  /** One Raid per Season, by Season index (R2.6). Unrevealed ones are masked in views. */
  raids: { id: string; revealed: boolean }[];
}

export type WwState = DraftState<WwSeat, WwTable>;
