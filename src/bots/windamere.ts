/**
 * The shipped Windamere game for bots and sims: design's content bound to engine E2.
 * Tunables: design's `TUNABLES` and the engine's `WwTunables` use different key names and shapes
 * (`buyLimitPerNeighbour` vs `buyLimit`, season objects vs arrays), so they cannot be passed
 * through. The engine defaults equal design's values today (checked by hand 2026-10-30), so this
 * passes none. If R16 is re-tuned, the numbers must be changed in the engine's defaults too.
 */
import { compileContent, createWindamereEngine, type WwContent } from '../engine';
import { CARDS, GOODS, GREAT_WORKS, HONOURS, RAIDS } from '../content/windamere';

export const windamereContent: WwContent = {
  goods: GOODS.map((id) => ({ id, name: id })),
  cards: CARDS.map((c) => ({ ...c, counts: [...c.counts] })),
  greatWorks: GREAT_WORKS.map((w) => ({ ...w, tiers: w.tiers.map((t) => ({ ...t })) })),
  raids: [...RAIDS],
  honours: [...HONOURS],
};

export const windamereRules = compileContent(windamereContent);
export const windamere = createWindamereEngine(windamereContent);
