import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource/marcellus';
import './ui/theme/tokens.css';
import './ui/theme/chrome.css';
import { boot } from './game/boot';
import { windamereBinding } from './game/windamere';

const root = document.getElementById('app');
if (root) {
  document.body.style.margin = '0';
  boot(root, { game: windamereBinding() });
}
