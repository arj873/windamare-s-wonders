/**
 * The Windamere ruleset object for the core (docs/ENGINE.md §8), for 3 to 7 seats. Not yet: the
 * 2-player variant (R14).
 */
import type { Ruleset } from '../core';
import { COVERED } from './build';
import type { WwRules } from './content';
import { GREAT_WORK_CHOICE, greatWorkChoice, greatWorkSpecs, offerGreatWorks } from './greatWork';
import { defaultPick, legalPicks, normalizePick, validatePick } from './pick';
import { resolveRaid, revealRaid } from './raid';
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
    minSeats: 3, // 2 seats need the R14 variant (Burn), not written yet
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
    onRoundStart: (ctx, round) => revealRaid(rules, ctx, round),
    normalizePick: (state, seat, pick) => normalizePick(rules, state, seat, pick),
    validatePick: (state, seat, pick) => validatePick(rules, state, seat, pick),
    legalPicks: (state, seat) => legalPicks(rules, state, seat),
    defaultPick: (state, seat) => defaultPick(rules, state, seat),
    onLeftovers,
    resolve: resolveSteps(rules),
    // R3.6: the Raid, then the core runs every `seasonEnd` effect in seat order.
    onRoundEnd: (ctx) => {
      resolveRaid(rules, ctx);
    },
    score: (state, seat) => scoreTown(rules, state, seat),
    tiebreak: tiebreakOf,
    activeEffects: (state, seat) => greatWorkSpecs(rules, state, seat),
    zones: { [COVERED]: 'public', [GLEAN]: 'owner' },
    discardVisibility: 'hidden',
    maskTable,
  };
}
