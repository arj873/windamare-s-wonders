/** The Windamere ruleset object for the core (docs/ENGINE.md §8), for 2 to 7 seats. */
import type { Ruleset } from '../core';
import { COVERED } from './build';
import type { WwRules } from './content';
import { GREAT_WORK_CHOICE, greatWorkChoice, greatWorkSpecs, offerGreatWorks } from './greatWork';
import { defaultPick, legalPicks, normalizePick, validatePick } from './pick';
import { updateHonourLeaders } from './honours';
import { validateOptions } from './options';
import { resolveRaid, revealRaid, sampleHiddenRaids, seasonEndEffects } from './raid';
import { scoreTown, tiebreakOf } from './score';
import { maskTable, setupSeat, setupTable } from './setup';
import { GLEAN, onLeftovers, resolveSteps, roundSpec } from './turn';
import { SEASONS, type WwSeat, type WwTable } from './types';

export const RULESET_ID = 'windamere';
export const RULESET_VERSION = 1;

export function windamereRuleset(rules: WwRules): Ruleset<WwSeat, WwTable> {
  return {
    id: RULESET_ID,
    version: RULESET_VERSION,
    minSeats: 2, // 2 seats: the R14 variant (a Burn each turn but the last)
    maxSeats: 7,
    cards: rules.content.cards,
    effects: rules.effects,
    prompts: { [GREAT_WORK_CHOICE]: greatWorkChoice(rules) },
    rounds: SEASONS.length,
    roundSpec: (state, round) => roundSpec(rules, state, round),
    setupTable: (ctx) => setupTable(rules, ctx),
    setupSeat: () => setupSeat(rules),
    // R2.4, R2.5: the Great Work choice, before the first deal.
    onGameStart: (ctx) => offerGreatWorks(rules, ctx),
    startBeforeDeal: true,
    // R15.8: a town may look at the hands it passed on, until the Season ends.
    recall: true,
    onRoundStart: (ctx, round) => revealRaid(rules, ctx, round),
    validateOptions, // R19: { firstGame: true }

    normalizePick: (state, seat, pick) => normalizePick(rules, state, seat, pick),
    validatePick: (state, seat, pick) => validatePick(rules, state, seat, pick),
    legalPicks: (state, seat) => legalPicks(rules, state, seat),
    defaultPick: (state, seat) => defaultPick(rules, state, seat),
    onLeftovers,
    resolve: resolveSteps(rules),
    // R3.6: the Raid, then every `seasonEnd` effect in seat order; then the Honours (R11.3).
    onRoundEnd: (ctx) => {
      resolveRaid(rules, ctx);
      seasonEndEffects(rules, ctx);
      updateHonourLeaders(rules, ctx);
    },
    score: (state, seat) => scoreTown(rules, state, seat),
    tiebreak: tiebreakOf,
    activeEffects: (state, seat) => greatWorkSpecs(rules, state, seat),
    zones: { [COVERED]: 'public', [GLEAN]: 'owner' },
    discardVisibility: 'hidden',
    maskTable,
    sampleHidden: (state, rng) => sampleHiddenRaids(rules, state, rng),
    // R14.3: the other town sees that a card was burned, not which.
    maskRevealArgs: (args) =>
      args !== null && typeof args === 'object' && !Array.isArray(args) && 'burn' in args
        ? { ...args, burn: -1 }
        : args,
  };
}
