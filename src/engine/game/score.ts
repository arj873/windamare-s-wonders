/** R12 end scoring and tie-breaks. */
import type { SeatId } from '../core';
import type { WwRules } from './content';
import { honourScore } from './honours';
import { activeEffects, loreScore, townOf } from './town';
import type { WwState } from './types';

/** R12.2 a to f, in score-sheet order. */
export const CATEGORIES = ['town', 'greatWork', 'raids', 'lore', 'honours', 'purse'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * R12.2. An effect's Renown goes by its source: on an uncovered card it is Town (a), printed
 * `renown` and `score…` effects alike; on the Perk or a completed tier it is Great Work (b).
 */
export function scoreTown(rules: WwRules, state: WwState, seat: SeatId): Record<Category, number> {
  const town = townOf(state, seat).data;
  const out: Record<Category, number> = {
    town: 0,
    greatWork: 0,
    raids: town.valour.reduce((a, b) => a + b, 0),
    lore: loreScore(rules, state, seat),
    honours: honourScore(rules, state, seat),
    purse: Math.floor(town.coins / rules.tunables.coinsPerRenown),
  };
  for (const { spec, source } of activeEffects(rules, state, seat)) {
    const renown = rules.effects[spec.type]?.score?.(state, seat, spec).renown ?? 0;
    if (source.kind === 'card') out.town += renown;
    else out.greatWork += renown;
  }
  return out;
}

/** R12.4: most completed Great Work tiers, then most coins; still tied, the win is shared. */
export function tiebreakOf(state: WwState, seat: SeatId): number[] {
  const town = townOf(state, seat).data;
  return [town.tiers, town.coins];
}
