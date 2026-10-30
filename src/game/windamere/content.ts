/**
 * Design's card data (src/content/windamere) as the engine's WwContent, plus the compiled rules
 * and the bound engine. Nobody ships this assembly yet (createWindamereEngine() without content
 * throws WINDAMERE_NOT_READY); when design or engine export one, this file shrinks to a re-export.
 * Tunables are left to the engine's DEFAULT_TUNABLES, which match content's TUNABLES today.
 */
import { CARDS, GOODS, GREAT_WORKS, HONOURS, RAIDS } from '../../content/windamere';
import {
  compileContent,
  createDraftEngine,
  windamereRuleset,
  type DraftEngine,
  type WwContent,
  type WwRules,
  type WwSeat,
  type WwTable,
} from '../../engine';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const WINDAMERE_CONTENT: WwContent = {
  goods: GOODS.map((id) => ({ id, name: capitalize(id) })),
  // Design types `counts` as a readonly tuple, the engine as number[]: copy.
  cards: CARDS.map((c) => ({ ...c, counts: [...c.counts] })),
  greatWorks: [...GREAT_WORKS],
  raids: [...RAIDS],
  honours: [...HONOURS],
};

export interface Windamere {
  rules: WwRules;
  engine: DraftEngine<WwSeat, WwTable>;
}

let cached: Windamere | null = null;

/** Compiled once (compileContent checks every card). Throws on bad content. */
export function windamere(): Windamere {
  if (!cached) {
    const rules = compileContent(WINDAMERE_CONTENT);
    cached = { rules, engine: createDraftEngine(windamereRuleset(rules)) };
  }
  return cached;
}
