/** R2.4, R2.5 the Great Work choice and R8 the labour track. */
import type { Ctx, EffectSpec, Json, PromptHandler, SeatId } from '../core';
import type { WwRules } from './content';
import { emit, gained, holdings } from './events';
import { updateHonourLeaders } from './honours';
import { greatWorkEffects, townOf } from './town';
import type { WwSeat, WwState, WwTable } from './types';

export const GREAT_WORK_CHOICE = 'greatWork';

/**
 * R2.4, R2.5, R15.10: deal each town its offers from the shuffled pool, face down, and ask every
 * town at once (one prompt group: hidden, changeable until the last choice, revealed together).
 * The offers live only in the prompts' owner-only data, so the ones not chosen leave unseen.
 */
export function offerGreatWorks(rules: WwRules, ctx: Ctx<WwSeat, WwTable>): void {
  const pool = ctx.rng.shuffle(rules.content.greatWorks.map((g) => g.id));
  const n = rules.tunables.greatWorksOffered;
  ctx.promptGroup(
    ctx.state.seats.map((s, i) => ({
      seat: s.id,
      kind: GREAT_WORK_CHOICE,
      data: { offers: pool.slice(i * n, (i + 1) * n) },
    })),
  );
}

/** The Great Work ids a choice prompt offers. */
export function offersOf(data: Json): string[] {
  const offers = (data as { offers?: unknown } | null)?.offers;
  return Array.isArray(offers) ? offers.filter((x): x is string => typeof x === 'string') : [];
}

export function greatWorkChoice(rules: WwRules): PromptHandler<WwSeat, WwTable> {
  return {
    answers: (_state, prompt) => offersOf(prompt.data),
    validate: (_state, prompt, answer) =>
      typeof answer === 'string' && offersOf(prompt.data).includes(answer)
        ? null
        : 'choose one of your offered Great Works',
    // Runs for every town once all have chosen (R2.5): the Perk is active from now on.
    apply: (ctx, prompt, answer) => {
      const town = townOf(ctx.state, prompt.seat);
      const gw = rules.greatWork(answer as string);
      town.data.greatWork = gw.id;
      emit(
        ctx,
        { type: 'greatWork', seat: prompt.seat, greatWork: gw.id },
        `${town.name} will raise ${gw.name}.`,
      );
      // The group applies in seat order; after the last town, the Perks may move an Honour.
      if (prompt.seat === ctx.state.seats.length - 1) updateHonourLeaders(rules, ctx);
    },
    // R15.6, R15.10: the timeout choice is the first offered.
    defaultAnswer: (_state, prompt) => offersOf(prompt.data)[0] ?? null,
  };
}

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
    const before = holdings(town);
    ctx.trigger(seat, tier.reward, null);
    emit(
      ctx,
      {
        type: 'tier',
        seat,
        greatWork: gw.id,
        tier: town.tiers,
        gains: gained(before, holdings(town)),
      },
      `${townOf(ctx.state, seat).name} completes ${gw.name} tier ${town.tiers}.`,
    );
    next = nextThreshold(rules, town);
  }
  return done;
}

/** The Perk and completed tiers' specs, for the core's `Ruleset.activeEffects` (`effectsOf`). */
export function greatWorkSpecs(rules: WwRules, state: WwState, seat: SeatId): EffectSpec[] {
  return greatWorkEffects(rules, townOf(state, seat).data).map((e) => e.spec);
}
