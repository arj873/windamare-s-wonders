/**
 * The Windamere ruleset object for the core (docs/ENGINE.md §8). The unchanged systems are
 * wired in; the turn structure (deal sizes, picks, resolve steps, paying, trade) waits for
 * design's D2c and is marked TURN_PENDING. Until then `createDraftEngine` refuses this ruleset
 * (no resolve steps), which is what `createWindamereEngine` reports.
 */
import type { Ruleset } from '../core';
import { COVERED } from './build';
import type { WwRules } from './content';
import { greatWorkSpecs } from './greatWork';
import { resolveRaid, revealRaid } from './raid';
import { scoreTown, tiebreakOf } from './score';
import { maskTable, setupSeat, setupTable } from './setup';
import { SEASONS, type WwSeat, type WwTable } from './types';

export const RULESET_ID = 'windamere';
export const RULESET_VERSION = 1;
export const TURN_PENDING = 'the turn structure is not implemented yet (waits for design D2c)';

export function windamereRuleset(rules: WwRules): Ruleset<WwSeat, WwTable> {
  return {
    id: RULESET_ID,
    version: RULESET_VERSION,
    minSeats: 2,
    maxSeats: 7,
    cards: rules.content.cards,
    effects: rules.effects,
    prompts: {},
    rounds: SEASONS.length,
    // --- turn structure: D2c ---
    roundSpec: () => {
      throw new Error(TURN_PENDING);
    },
    validatePick: () => TURN_PENDING,
    legalPicks: () => [],
    resolve: [],
    // --- unchanged systems ---
    setupTable: (ctx) => setupTable(rules, ctx),
    setupSeat: () => setupSeat(rules),
    onRoundStart: (ctx, round) => revealRaid(rules, ctx, round),
    // R3.6: the Raid, then the core runs every `seasonEnd` effect in seat order.
    onRoundEnd: (ctx) => {
      resolveRaid(rules, ctx);
    },
    score: (state, seat) => scoreTown(rules, state, seat),
    tiebreak: tiebreakOf,
    activeEffects: (state, seat) => greatWorkSpecs(rules, state, seat),
    zones: { [COVERED]: 'public' },
    discardVisibility: 'hidden',
    maskTable,
  };
}
