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
  // ?debug=1[&seats=N][&seed=S]: the playtest harness's all-human start (UX.md §18).
  const params = new URLSearchParams(location.search);
  const debug = params.get('debug') === '1';
  const app = boot(root, {
    game: windamereBinding(),
    homeArt: `${import.meta.env.BASE_URL}art/table/title-key-art.svg`,
    ...(debug
      ? {
          debug: {
            seats: Number(params.get('seats') ?? 4),
            ...(params.get('seed') ? { seed: params.get('seed') ?? '' } : {}),
          },
        }
      : {}),
  });
  // Debug only: the harness may read the full state (`ww.play.game.state`). Never in a normal game.
  if (debug) Object.assign(window, { ww: app });
}
