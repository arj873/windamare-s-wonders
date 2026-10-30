/**
 * R13.5 staging: cards that are ruled and ready but wait for engine handlers
 * (PENDING_EFFECT_PARAMS). They are NOT in CARDS: the engine rejects content with unknown effect
 * types, so shipping them early would stop the game. When the engine lands the handlers, design
 * moves each card into CARDS and applies its swap (copies taken from another card of the same
 * Season, so every deck stays 6 per seat). The content tests check that cards plus swaps would
 * make legal decks.
 *
 * Empty since D10b: Wend Fair, Commons of the Wend, Brokers' Arcade and Kinsfolk Hall shipped
 * (engine E7). The exports stay for the next staged card.
 */
import type { Counts, WwCardDef } from './types';

export const PENDING_CARDS: readonly WwCardDef[] = [];

/** For each pending card: the shipped card that gives up copies, and its counts afterwards. */
export const PENDING_SWAPS: Readonly<Record<string, { card: string; counts: Counts }>> = {};
