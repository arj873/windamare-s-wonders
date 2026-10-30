/**
 * The Windamere engine, bound to the core (docs/ENGINE.md §2). By default it plays the shipped
 * content (design's `src/content/windamere`); tests pass their own.
 */
import { createDraftEngine, type DraftEngine } from '../core';
import { compileContent } from './content';
import { windamereRuleset } from './ruleset';
import { windamereContent } from './shipped';
import type { WwContent, WwSeat, WwTable } from './types';

/** The engine for Windamere's Wonders. Throws on bad content (`checkContent`). */
export function createWindamereEngine(
  content: WwContent = windamereContent(),
): DraftEngine<WwSeat, WwTable> {
  return createDraftEngine(windamereRuleset(compileContent(content)));
}
