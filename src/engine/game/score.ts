/** R12 end scoring and tie-breaks. */
import type { SeatId } from '../core';
import type { WwRules } from './content';
import { honourScore } from './honours';
import { activeEffects, loreScore, townOf } from './town';
import type { WwState } from './types';

/** R12.2 a to g, in that order (the UI shows them in this order). */
export const CATEGORIES = [
  'buildings',
  'greatWork',
  'valour',
  'lore',
  'landmarks',
  'honours',
  'treasury',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * R12.2. An effect's Renown goes by its source: on a card, `renown` is Buildings (a) and the
 * `score…` effects are Landmarks (e); on the Perk or a completed tier, both are Great Work (b).
 */
export function scoreTown(rules: WwRules, state: WwState, seat: SeatId): Record<Category, number> {
  const town = townOf(state, seat).data;
  const out: Record<Category, number> = {
    buildings: 0,
    greatWork: 0,
    valour: town.valour.reduce((a, b) => a + b, 0),
    lore: loreScore(rules, state, seat),
    landmarks: 0,
    honours: honourScore(rules, state, seat),
    treasury: Math.floor(town.coins / rules.tunables.coinsPerRenown),
  };
  for (const { spec, source } of activeEffects(rules, state, seat)) {
    const renown = rules.effects[spec.type]?.score?.(state, seat, spec).renown ?? 0;
    if (renown === 0) continue;
    if (source.kind !== 'card') out.greatWork += renown;
    else if (spec.type === 'renown') out.buildings += renown;
    else out.landmarks += renown;
  }
  return out;
}

/** R12.4: most completed Great Work tiers, then most coins; still tied, the win is shared. */
export function tiebreakOf(state: WwState, seat: SeatId): number[] {
  const town = townOf(state, seat).data;
  return [town.tiers, town.coins];
}
