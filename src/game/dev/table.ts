/**
 * DEV PAGE ONLY (U1): the real setup screen and draft table, bound to the engine's toy ruleset
 * because the Windamere ruleset (E2) does not exist yet. Not a build entry, never shipped.
 * Open it under `pnpm dev` at /src/game/dev/table.html.
 */
import '@fontsource-variable/nunito';
import '@fontsource/marcellus';
import { createDraftEngine } from '../../engine';
import { toyRuleset } from '../../engine/core/testing/toy';
import { toyPresenter } from '../../ui/table/testing/toy';
import { boot } from '../boot';

const root = document.getElementById('app');
if (root) {
  const app = boot(root, {
    game: { engine: createDraftEngine(toyRuleset), present: toyPresenter },
  });
  // ?start: skip the setup screen (screenshots, quick checks).
  if (new URLSearchParams(location.search).has('start')) {
    root.querySelector<HTMLButtonElement>('[data-k="play"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-k="start"]')?.click();
  }
  Object.assign(window, { app });
}
