/**
 * The one place the room server learns which game it hosts: the shipped Windamere engine
 * (docs/ENGINE.md §15, content from src/engine/game/shipped.ts). Tests inject the toy ruleset
 * through `FakeRuntime`.
 */
import { createWindamereEngine, windamereContent, type DraftEngine } from '../engine';

export function roomEngine(): DraftEngine<unknown, unknown> {
  // A DraftEngine<WwSeat, WwTable> is not assignable to <unknown, unknown> (ENGINE.md §1).
  return createWindamereEngine(windamereContent()) as unknown as DraftEngine<unknown, unknown>;
}
