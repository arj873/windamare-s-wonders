/**
 * The Windamere engine, bound to the core (docs/ENGINE.md §2). The game has no shipped card data
 * yet (design's `src/content/`), so `content` is required for now; without it this throws
 * `WINDAMERE_NOT_READY`. The signature is final: net can wire `createWindamereEngine()` now.
 */
import { createDraftEngine, type DraftEngine } from '../core';
import { compileContent } from './content';
import { windamereRuleset } from './ruleset';
import type { WwContent, WwSeat, WwTable } from './types';

export const WINDAMERE_NOT_READY =
  'the Windamere engine has no card data yet (design src/content/): pass content';

/**
 * The engine for Windamere's Wonders. `content` will default to the shipped card data once
 * `src/content/` has it; tests pass their own. Throws on bad content (`checkContent`).
 */
export function createWindamereEngine(content?: WwContent): DraftEngine<WwSeat, WwTable> {
  if (!content) throw new Error(WINDAMERE_NOT_READY);
  return createDraftEngine(windamereRuleset(compileContent(content)));
}
