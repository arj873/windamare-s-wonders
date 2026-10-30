import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource/marcellus';
import './ui/theme/tokens.css';
import './ui/theme/chrome.css';
import { boot } from './game/boot';
import { windamereBinding } from './game/windamere';

// index.html names no icon, so browsers asked for /favicon.ico (404). Point them at art's
// Renown mark until platform or art ship a favicon of its own.
if (!document.querySelector('link[rel="icon"]')) {
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = `${import.meta.env.BASE_URL}art/goods/renown.svg`;
  document.head.append(icon);
}

const root = document.getElementById('app');
if (root) {
  document.body.style.margin = '0';
  boot(root, { game: windamereBinding() });
}
