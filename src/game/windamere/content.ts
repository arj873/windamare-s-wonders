/**
 * The shipped Windamere content (engine's `windamereContent()`, from design's src/content), its
 * compiled rules for the presenter, and the engine bound to the same rules.
 */
import {
  compileContent,
  createDraftEngine,
  windamereContent,
  windamereRuleset,
  type DraftEngine,
  type WwRules,
  type WwSeat,
  type WwTable,
} from '../../engine';

export interface Windamere {
  rules: WwRules;
  engine: DraftEngine<WwSeat, WwTable>;
}

let cached: Windamere | null = null;

/** Compiled once (compileContent checks every card). Throws on bad content. */
export function windamere(): Windamere {
  if (!cached) {
    const rules = compileContent(windamereContent());
    cached = { rules, engine: createDraftEngine(windamereRuleset(rules)) };
  }
  return cached;
}
