import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource/marcellus';
import './ui/theme/tokens.css';
import './ui/theme/chrome.css';
import { sfx } from './audio';
import { boot, type BootHandle } from './game/boot';
import { bootOnline, roomFromUrl } from './game/online';
import { windamereBinding } from './game/windamere';
import { mountAudition, wantsAudition } from './ui/fx/audition';
import type { WwSeat, WwTable } from './engine';

// The fx lane's sound engine starts silent; the first click, key or touch unlocks it.
sfx.installUnlock(document);
// ?sfx=1: fx's sound audition panel (F4), for tuning recipes by ear.
if (wantsAudition(location.search)) mountAudition(document.body);

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
  // Online play (online lane): Play online / Join on the home screen; leaving a room goes home.
  let app: BootHandle<WwSeat, WwTable> | null = null;
  const online = bootOnline(windamereBinding('online'), {
    goHome: () => {
      // Drop ?room= so a reload does not rejoin the room just left.
      history.replaceState(null, '', location.pathname);
      app?.showHome();
    },
  });
  app = boot(root, {
    game: windamereBinding(),
    online,
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
  // An invite link (?room=CODE) opens that room's join card straight away.
  const code = debug ? null : roomFromUrl(location.search);
  if (code) online.join(code, '', root);
  // Debug only: the harness may read the full state (`ww.play.game.state`). Never in a normal game.
  if (debug) Object.assign(window, { ww: app });
}
