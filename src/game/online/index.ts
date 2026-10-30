/**
 * Entry points for the online game, for the app shell (ui's boot: the home screen's Play online
 * and Join buttons, and `?room=CODE` invite links) and the online dev page (dev.ts).
 *
 *   const online = onlineLauncher({ engine, present, mount, goHome, ... });
 *   home: onOnline: (name) => online.create(name)   onJoin: (code, name) => online.join(code, name)
 *   load: const code = roomFromUrl(location.search); if (code) online.join(code)
 */
import type { DraftEngine } from '../../engine';
import { parseRoomCode } from '../../net/transport';
import { showToast, type ToastKind } from '../../ui';
import { browserStorage, loadPref, savePref } from '../../ui/prefs';
import { NAME_KEY } from '../../ui/home/screen';
import type { Presenter } from '../../ui/table/present';
import type { RevealHook } from '../fx';
import { OnlineApp, type OnlineEnv } from './app';
import { pickBackend, realClock, tokenStoreFor, type Backend } from './backend';

export { OnlineApp, type OnlineEnv } from './app';
export { NetPlay, presence, roomLooks } from './netPlay';
export type { Backend } from './backend';

export interface OnlineLaunchOptions<S, T> {
  engine: DraftEngine<S, T>;
  present: Presenter<S, T>;
  fx?: RevealHook<S, T>;
  /** Put the room visit on screen (e.g. `root.replaceChildren(el)`). */
  mount(el: HTMLElement): void;
  /** Leave the room: show the home screen again. */
  goHome(): void;
  /** Default: `pickBackend(location.search)`. */
  backend?: Backend | (() => Promise<Backend>);
  toast?: (message: string, kind?: ToastKind) => void;
  /** Default: location.href (invite links). */
  href?: () => string;
}

export interface OnlineLauncher<S, T> {
  /** Create a room as host and open its lobby. Resolves to the visit, or an error to show. */
  create(name: string): Promise<OnlineApp<S, T> | string>;
  /** Open a room by code or invite link; with `name`, join with it (no join card). */
  join(codeOrLink: string, name?: string): Promise<OnlineApp<S, T> | string>;
  /** The visit on screen, if any. */
  readonly current: OnlineApp<S, T> | null;
  /** Leave the current visit's screens (going home). */
  close(): void;
}

/** `?room=CODE` (an invite link), or null. */
export function roomFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('room');
  return raw ? parseRoomCode(raw) : null;
}

export function onlineLauncher<S, T>(opts: OnlineLaunchOptions<S, T>): OnlineLauncher<S, T> {
  let current: OnlineApp<S, T> | null = null;
  let backend: Promise<Backend> | null = null;
  const storage = browserStorage();
  const getBackend = () =>
    (backend ??=
      typeof opts.backend === 'function'
        ? opts.backend()
        : opts.backend
          ? Promise.resolve(opts.backend)
          : pickBackend(location.search));

  const env = (b: Backend): OnlineEnv<S, T> => ({
    backend: b,
    engine: opts.engine,
    present: opts.present,
    ...(opts.fx ? { fx: opts.fx } : {}),
    tokens: tokenStoreFor(b.kind),
    clock: realClock,
    name: () => loadPref(storage, NAME_KEY) ?? '',
    saveName: (name) => savePref(storage, NAME_KEY, name),
    href: opts.href?.() ?? location.href,
    toast: opts.toast ?? ((m, k) => void showToast(m, k)),
    goHome: () => {
      close();
      opts.goHome();
    },
  });

  function close(): void {
    current?.dispose();
    current = null;
  }

  function mount(app: OnlineApp<S, T>): OnlineApp<S, T> {
    close();
    current = app;
    opts.mount(app.element);
    return app;
  }

  return {
    get current() {
      return current;
    },
    close,
    async create(name) {
      try {
        const b = await getBackend();
        return mount(await OnlineApp.create(env(b), name));
      } catch (e) {
        return `Could not create a room: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    async join(codeOrLink, name) {
      const code = parseRoomCode(codeOrLink);
      if (code === null) return 'That is not a room code or invite link.';
      try {
        const b = await getBackend();
        const app = mount(new OnlineApp(env(b), code));
        void app.run(name);
        return app;
      } catch (e) {
        return `Could not reach the room server: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
}
