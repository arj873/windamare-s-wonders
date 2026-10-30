/**
 * DEV PAGE ONLY (O1): the online flow without the app shell, until ui wires the home screen's
 * Play online / Join buttons to `onlineLauncher` (src/game/online/index.ts). Not a build entry.
 * Open `/src/game/online/dev.html` under `pnpm dev`: create a room, copy the invite link into a
 * second tab (the dev server runs in a SharedWorker, so tabs share rooms), play.
 * `?server=remote` talks to the Worker at this origin (or VITE_ROOM_SERVER) instead.
 */
import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource/marcellus';
import '../../ui/theme/tokens.css';
import '../../ui/theme/chrome.css';
import { showToast } from '../../ui';
import { NAME_KEY } from '../../ui/home/screen';
import { JoinCard } from '../../ui/online/join';
import { browserStorage, loadPref } from '../../ui/prefs';
import { windamereBinding } from '../windamere';
import { onlineLauncher, roomFromUrl } from '.';

const root = document.getElementById('app');
if (root) {
  // The same reveal (fx) and help as the app: the online binding (only the viewer sounds local).
  const { engine, present, fx, help } = windamereBinding('online');
  const here = () =>
    `${location.pathname}${location.search.includes('server=remote') ? '?server=remote' : ''}`;
  const online = onlineLauncher({
    engine,
    present,
    ...(fx ? { fx } : {}),
    ...(help ? { help } : {}),
    mount: (el) => root.replaceChildren(el),
    goHome: () => {
      history.replaceState(null, '', here());
      home();
    },
  });

  const enter = (result: unknown) => {
    if (typeof result === 'string') showToast(result, 'error');
    else if (online.current) {
      const u = new URL(location.href);
      u.searchParams.set('room', online.current.roomId);
      history.replaceState(null, '', u);
    }
  };

  function home(): void {
    const card = new JoinCard({
      name: loadPref(browserStorage(), NAME_KEY) ?? '',
      onCreate: (name) => void online.create(name).then(enter),
      onJoin: (name, code) => void online.join(code, name).then(enter),
    });
    root?.replaceChildren(card.element);
  }

  const code = roomFromUrl(location.search);
  if (code) void online.join(code).then(enter);
  else home();
  // Dev aid: the launcher and the current room client in the console.
  Object.assign(window, { wwOnline: online });
}
