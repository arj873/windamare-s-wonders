/** R8: the Great Work labour track. */
import type { Ctx, EffectSpec, SeatId } from '../core';
import type { WwRules } from './content';
import { greatWorkEffects, townOf } from './town';
import type { WwSeat, WwState, WwTable } from './types';

/** The labour the town's next tier needs, or null (no Great Work yet, or tier IV done, R8.5). */
export function nextThreshold(rules: WwRules, town: WwSeat): number | null {
  if (town.greatWork === null) return null;
  return rules.greatWork(town.greatWork).tiers[town.tiers]?.threshold ?? null;
}

/**
 * R8.3, the Great Work check: while the town's labour reaches its next tier's threshold, that
 * tier completes and its reward applies at once, in order. One-off rewards (`onBuild`) pay now
 * (R8.4); lasting ones count from now on through `activeEffects`. Returns the tiers completed.
 */
export function greatWorkCheck(rules: WwRules, ctx: Ctx<WwSeat, WwTable>, seat: SeatId): number {
  const town = townOf(ctx.state, seat).data;
  let done = 0;
  for (let next = nextThreshold(rules, town); next !== null && town.labour >= next;) {
    const gw = rules.greatWork(town.greatWork as string);
    const tier = gw.tiers[town.tiers];
    if (!tier) break;
    town.tiers += 1;
    done += 1;
    ctx.trigger(seat, tier.reward, null);
    ctx.log(
      seat,
      'tier',
      `${townOf(ctx.state, seat).name} completes ${gw.name} tier ${town.tiers}.`,
      {
        data: { greatWork: gw.id, tier: town.tiers },
      },
    );
    next = nextThreshold(rules, town);
  }
  return done;
}

/** The Perk and completed tiers' specs, for the core's `Ruleset.activeEffects` (`effectsOf`). */
export function greatWorkSpecs(rules: WwRules, state: WwState, seat: SeatId): EffectSpec[] {
  return greatWorkEffects(rules, townOf(state, seat).data).map((e) => e.spec);
}
