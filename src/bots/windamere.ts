/** The shipped Windamere game for bots and sims: the engine's `windamereContent()` bound to E2. */
import { compileContent, createWindamereEngine, windamereContent } from '../engine';

export const windamereRules = compileContent(windamereContent());
export const windamere = createWindamereEngine(windamereContent());
