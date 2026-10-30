import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource/marcellus';
import './ui/theme/tokens.css';
import './ui/theme/chrome.css';
import { boot } from './game/boot';

// No ruleset is bound yet (Windamere is E2): Start shows a notice. The toy-ruleset table runs
// at /src/game/dev/table.html under `pnpm dev`.
const root = document.getElementById('app');
if (root) {
  document.body.style.margin = '0';
  boot(root);
}
