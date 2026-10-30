/**
 * The one place the room server learns which game it hosts. The Windamere ruleset (engine card
 * E2) is not on main yet; until it is, a deployed room cannot be created. Tests inject the toy
 * ruleset through `FakeRuntime`, so nothing here is exercised by them.
 *
 * When E2 lands: `import { engine } from '../engine'` and return it.
 */
import type { DraftEngine } from '../engine';

export function roomEngine(): DraftEngine<unknown, unknown> {
  throw new Error('no Windamere engine yet (engine card E2): the room server cannot host a game');
}
