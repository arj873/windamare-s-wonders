/**
 * App shell boot: the ☰ menu, the setup screen and, when a ruleset is bound, the draft table.
 * Platform calls `boot(root)` from src/app.ts; with no `game` bound yet (the Windamere ruleset
 * is E2), Start shows a notice. Dev pages bind the toy ruleset (src/game/dev/).
 */
import {
  BOT_SPEEDS,
  loadAnimations,
  loadBotSpeed,
  Menu,
  saveAnimations,
  saveBotSpeed,
  SetupScreen,
  showToast,
  type BotSpeed,
  type MenuChoice,
  type MenuItem,
  type NewGameConfig,
} from '../ui';
import { HomeScreen } from '../ui/home/screen';
import { MAX_PLAYERS, MIN_PLAYERS, SEAT_COLORS } from '../ui/setup/model';
import type { RevealHook } from './fx';
import { playLocal, type GameBinding, type PlayHandle } from './play';

export interface BootOptions<S, T> {
  /** Replaces what Start does (tests). */
  onStart?: (cfg: NewGameConfig) => void;
  /** The ruleset to play; absent = no game yet. */
  game?: GameBinding<S, T>;
  /**
   * Playtest harness (`?debug=1`, UX.md §18): skip setup, start at once with every seat human,
   * no timer and no pass covers, so a script can play each seat in turn.
   */
  debug?: { seats: number; seed?: string };
  /** Title key art behind the home screen (public/art). */
  homeArt?: string;
  /** The fx lane's reveal animation and sound (src/game/fx.ts); absent = the table's badges. */
  fx?: RevealHook<S, T>;
  /**
   * The online lane's entry points (src/game/online): shows Play online and Join with code on
   * the home screen. `root` is where online screens go; boot steps aside while they show.
   */
  online?: {
    create(name: string, root: HTMLElement): void;
    join(code: string, name: string, root: HTMLElement): void;
  };
}

/** The all-human game `?debug=1` starts. */
export function debugConfig(seats: number, seed?: string): NewGameConfig {
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(seats) || 4));
  return {
    mode: 'standard',
    players: Array.from({ length: n }, (_, i) => ({
      name: `P${i + 1}`,
      color: SEAT_COLORS[i % SEAT_COLORS.length]?.color ?? '#888888',
      controller: 'human',
    })),
    pickTimerSec: null,
    ...(seed ? { seed } : {}),
  };
}

export interface BootHandle<S, T> {
  menu: Menu;
  /** The screen on show: home, setup, or neither while a game is on. */
  readonly home: HomeScreen | null;
  readonly setup: SetupScreen | null;
  readonly play: PlayHandle<S, T> | null;
}

export function boot<S, T>(root: HTMLElement, opts: BootOptions<S, T> = {}): BootHandle<S, T> {
  document.documentElement.classList.toggle('no-anim', !loadAnimations());
  let home: HomeScreen | null = null;
  let setup: SetupScreen | null = null;
  let play: PlayHandle<S, T> | null = null;
  /** The home screen's nickname, for the first human seat. */
  let nickname = '';
  let lastConfig: NewGameConfig | null = null;
  let speed: BotSpeed = loadBotSpeed();

  const botDelayMs = (): number => {
    const s = BOT_SPEEDS.find((b) => b.id === speed) ?? BOT_SPEEDS[1];
    return s ? s.minMs + Math.random() * (s.maxMs - s.minMs) : 0;
  };

  const botSpeed: MenuChoice<BotSpeed> = {
    kind: 'choice',
    label: 'Bot speed',
    options: BOT_SPEEDS,
    value: speed,
    onChange: (id) => {
      speed = id;
      saveBotSpeed(id);
    },
  };
  const prefs: MenuItem[] = [
    botSpeed,
    {
      kind: 'choice',
      label: 'Animations',
      options: [
        { id: 'on', label: 'On' },
        { id: 'off', label: 'Off' },
      ],
      value: loadAnimations() ? 'on' : 'off',
      onChange: (id) => {
        saveAnimations(id === 'on');
        document.documentElement.classList.toggle('no-anim', id === 'off');
      },
    },
  ];
  const menu = new Menu(prefs);
  const corner = document.createElement('div');
  corner.className = 'ww-corner';
  corner.style.cssText = 'position:fixed;top:12px;left:12px;z-index:25;';
  corner.append(menu.element);

  /** UX.md §4: the first screen (Play vs bots → setup). */
  function showHome(): void {
    play?.hide();
    setup = null;
    home = new HomeScreen({
      onPlay: (name) => {
        nickname = name;
        showSetup();
      },
      ...(opts.homeArt ? { art: opts.homeArt } : {}),
      ...(opts.online
        ? {
            onOnline: (name: string) => opts.online?.create(name, root),
            onJoin: (code: string, name: string) => opts.online?.join(code, name, root),
          }
        : {}),
    });
    menu.setItems(prefs);
    root.replaceChildren(home.element, corner);
  }

  function showSetup(): void {
    play?.hide();
    home = null;
    setup = new SetupScreen({
      onStart: start,
      ...(play ? { onBack: showPlay } : { onBack: showHome, backLabel: 'Back' }),
      ...(nickname ? { playerName: nickname } : {}),
    });
    menu.setItems(prefs);
    root.replaceChildren(setup.element, corner);
  }

  function showPlay(): void {
    if (!play) return;
    setup = null;
    home = null;
    menu.setItems([
      { kind: 'action', label: 'New game', hint: 'Back to the setup screen', onClick: showSetup },
      ...prefs,
    ]);
    root.replaceChildren(play.element, corner);
    play.show();
  }

  function start(cfg: NewGameConfig): void {
    if (opts.onStart) return opts.onStart(cfg);
    if (!opts.game) {
      showToast(
        `No game yet (the ruleset is not in): ${cfg.players.length} players, ${
          cfg.pickTimerSec ? `${cfg.pickTimerSec} s picks` : 'no timer'
        }`,
      );
      return;
    }
    const next = playLocal(opts.game, cfg, {
      botDelayMs,
      covers: !opts.debug,
      ...(opts.fx ? { fx: opts.fx } : {}),
      onNewGame: showSetup,
      onRematch: () => {
        if (!lastConfig) return;
        const { seed: _seed, ...again } = lastConfig;
        start(again);
      },
    });
    if (typeof next === 'string') {
      showToast(next, 'error');
      return;
    }
    play?.dispose();
    play = next;
    lastConfig = cfg;
    showPlay();
  }

  if (opts.debug) {
    showSetup();
    start(debugConfig(opts.debug.seats, opts.debug.seed));
  } else {
    showHome();
  }
  return {
    menu,
    get home() {
      return home;
    },
    get setup() {
      return setup;
    },
    get play() {
      return play;
    },
  };
}
