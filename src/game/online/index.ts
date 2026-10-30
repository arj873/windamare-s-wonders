/**
 * Entry points for the online game, for the app shell and the online dev page (dev.ts).
 *
 * App shell (ui's boot, src/game/boot.ts `BootOptions.online`):
 *
 *   const online = bootOnline(windamereBinding());
 *   boot(root, { game, online, ... });
 *   const code = roomFromUrl(location.search);   // an invite link
 *   if (code) online.join(code, '', root);         // join card (or straight in with a token)
 *
 * The lower-level `onlineLauncher` (mount anywhere, results as promises) is what dev.ts uses.
 */
import { sfx } from '../../audio';
import type { DraftEngine } from '../../engine';
import { parseRoomCode } from '../../net/transport';
import { showToast, type ToastKind } from '../../ui';
import { browserStorage, loadPref, savePref } from '../../ui/prefs';
import { NAME_KEY } from '../../ui/home/screen';
import type { Presenter } from '../../ui/table/present';
import type { RevealHook } from '../fx';
import type { GameBinding } from '../play';
import { OnlineApp, type OnlineEnv } from './app';
import { pickBackend, realClock, tokenStoreFor, type Backend } from './backend';
import type { SoundSwitch } from './menu';

export { OnlineApp, type OnlineEnv } from './app';
export { NetPlay, presence, roomLooks } from './netPlay';
export type { Backend } from './backend';

export interface OnlineLaunchOptions<S, T> {
  engine: DraftEngine<S, T>;
  present: Presenter<S, T>;
  fx?: RevealHook<S, T>;
  /** The binding's help (How to play, All cards, tooltips). */
  help?: GameBinding<S, T>['help'];
  /** Sound on/off in the ☰ menu. Default: the page's `sfx`. */
  sound?: SoundSwitch;
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

/** The page's sound engine as the menu's on/off switch. */
const pageSound: SoundSwitch = {
  get muted() {
    return sfx.settings.muted;
  },
  setMuted: (muted) => sfx.setMuted(muted),
};

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
    ...(opts.help ? { help: opts.help } : {}),
    sound: opts.sound ?? pageSound,
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

/** What ui's `boot({ online })` takes (src/game/boot.ts). */
export interface BootOnline {
  create(name: string, root: HTMLElement): void;
  join(code: string, name: string, root: HTMLElement): void;
}

export interface BootOnlineOptions<S, T> {
  /**
   * Leaving a room. Default: reload this page without `?room=`, which lands on the home screen
   * (boot has no "show home" callback for us yet).
   */
  goHome?(): void;
  backend?: OnlineLaunchOptions<S, T>['backend'];
  toast?: (message: string, kind?: ToastKind) => void;
}

/**
 * The app shell's adapter: the binding's engine, presenter and reveal (fx) for the online table,
 * the visit mounted into boot's `root`, and errors as toasts (the home screen stays up).
 */
export function bootOnline<S, T>(
  binding: GameBinding<S, T>,
  opts: BootOnlineOptions<S, T> = {},
): BootOnline & { launcher: OnlineLauncher<S, T> } {
  let target: HTMLElement | null = null;
  const toast = opts.toast ?? ((m: string, k?: ToastKind) => void showToast(m, k));
  const launcher = onlineLauncher<S, T>({
    engine: binding.engine,
    present: binding.present,
    ...(binding.fx ? { fx: binding.fx } : {}),
    ...(binding.help ? { help: binding.help } : {}),
    ...(opts.backend ? { backend: opts.backend } : {}),
    toast,
    mount: (el) => target?.replaceChildren(el),
    goHome: opts.goHome ?? (() => location.assign(location.pathname)),
  });
  const report = (r: OnlineApp<S, T> | string) => {
    if (typeof r === 'string') toast(r, 'error');
  };
  return {
    launcher,
    create(name, root) {
      target = root;
      void launcher.create(name).then(report);
    },
    join(code, name, root) {
      target = root;
      void launcher.join(code, name || undefined).then(report);
    },
  };
}
