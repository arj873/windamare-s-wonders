/**
 * The Windamere engine, bound to the core (docs/ENGINE.md §2). STUB until card E2 lands: the
 * turn structure waits for design's D2c, so this throws. The signature is final: net can wire
 * `createWindamereEngine()` now.
 */
import type { DraftEngine } from '../core';
import type { WwContent, WwSeat, WwTable } from './types';

export const WINDAMERE_NOT_READY = 'the Windamere engine is not ready yet (engine card E2)';

/**
 * The engine for Windamere's Wonders. `content` defaults to the shipped card data
 * (`src/content/`, design lane) once it exists; tests may pass their own.
 */
export function createWindamereEngine(content?: WwContent): DraftEngine<WwSeat, WwTable> {
  void content;
  throw new Error(WINDAMERE_NOT_READY);
}
