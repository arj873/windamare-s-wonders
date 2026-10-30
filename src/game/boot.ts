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
import { HomeScreen, NAME_KEY } from '../ui/home/screen';
import { browserStorage, loadPref } from '../ui/prefs';
import { MAX_PLAYERS, MIN_PLAYERS, SEAT_COLORS, STORAGE_KEY } from '../ui/setup/model';
import type { RevealHook } from './fx';
import { playLocal, type GameBinding, type PlayHandle, type TutorialHandle } from './play';

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
  /** Overrides the game binding's reveal hook (tests); see src/game/fx.ts. */
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

/** Someone who has played here before (a saved nickname or setup) is not offered the tutorial. */
function returning(): boolean {
  const store = browserStorage();
  return loadPref(store, NAME_KEY) !== null || loadPref(store, STORAGE_KEY) !== null;
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
    clock: 'off',
    ...(seed ? { seed } : {}),
  };
}

export interface BootHandle<S, T> {
  menu: Menu;
  /** The screen on show: home, setup, or neither while a game is on. */
  readonly home: HomeScreen | null;
  readonly setup: SetupScreen | null;
  readonly play: PlayHandle<S, T> | null;
  /** Show the home screen (the online lane calls this when a player leaves a room). */
  showHome(): void;
}

export function boot<S, T>(root: HTMLElement, opts: BootOptions<S, T> = {}): BootHandle<S, T> {
  document.documentElement.classList.toggle('no-anim', !loadAnimations());
  let home: HomeScreen | null = null;
  let setup: SetupScreen | null = null;
  let play: PlayHandle<S, T> | null = null;
  /** The home screen's nickname, for the first human seat. */
  let nickname = '';
  let lastConfig: NewGameConfig | null = null;
  /** The last game was the tutorial's (its ruleset options carry over to a rematch). */
  let lastTutorial = false;
  let speed: BotSpeed = loadBotSpeed();
  /** The tutorial coach's floor on bot speed, ms per move. */
  let paceMs: number | null = null;
  let coach: TutorialHandle | null = null;

  const botDelayMs = (): number => {
    const s = BOT_SPEEDS.find((b) => b.id === speed) ?? BOT_SPEEDS[1];
    const ms = s ? s.minMs + Math.random() * (s.maxMs - s.minMs) : 0;
    return Math.max(ms, paceMs ?? 0);
  };
  const learn = (): void => coach?.begin();

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

  /** One screen at a time, with the ☰ corner and the tutorial coach's panel kept on top. */
  function mount(screen: HTMLElement): void {
    root.replaceChildren(screen, corner, ...(coach ? [coach.panel] : []));
  }

  /** UX.md §4: the first screen (Play vs bots → setup). */
  function showHome(): void {
    play?.hide();
    coach?.hide();
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
      ...(coach ? { onTutorial: learn } : {}),
    });
    menu.setItems(prefs);
    mount(home.element);
    // The tutorial's one-time "New to the game?" card, for a first visit only.
    if (coach) coach.offer(home.element, returning(), learn);
  }

  function showSetup(): void {
    play?.hide();
    coach?.hide();
    home = null;
    setup = new SetupScreen({
      onStart: start,
      ...(play ? { onBack: showPlay } : { onBack: showHome, backLabel: 'Back' }),
      ...(nickname ? { playerName: nickname } : {}),
      ...(opts.game?.clock ? { clockHint: opts.game.clock.hint } : {}),
      ...(opts.game?.firstGame ? { firstGame: { hint: opts.game.firstGame.hint } } : {}),
      ...(coach ? { onTutorial: learn } : {}),
    });
    menu.setItems(prefs);
    mount(setup.element);
  }

  function showPlay(): void {
    if (!play) return;
    setup = null;
    home = null;
    const rules = play.openRules;
    menu.setItems([
      { kind: 'action', label: 'New game', hint: 'Back to the setup screen', onClick: showSetup },
      ...(rules
        ? [
            {
              kind: 'action' as const,
              label: 'How to play',
              hint: 'Rules (or press ?)',
              onClick: rules,
            },
          ]
        : []),
      ...(coach
        ? [
            {
              kind: 'action' as const,
              label: 'Learn to play',
              hint: 'A guided first game against 3 bots',
              onClick: learn,
            },
          ]
        : []),
      ...prefs,
    ]);
    mount(play.element);
    play.show();
    coach?.update();
  }

  /** `tutorial`: the game the coach runs, with the tutorial's ruleset options. */
  function start(cfg: NewGameConfig, tutorial = false): void {
    if (opts.onStart) return opts.onStart(cfg);
    const game = opts.game;
    if (!game) {
      showToast(
        `No game yet (the ruleset is not in): ${cfg.players.length} players, clock ${cfg.clock}`,
      );
      return;
    }
    const extra = tutorial ? game.tutorial?.options : undefined;
    const binding = extra ? { ...game, options: { ...game.options, ...extra } } : game;
    const next = playLocal(binding, cfg, {
      botDelayMs,
      covers: !opts.debug,
      ...(opts.fx ? { fx: opts.fx } : {}),
      onNewGame: showSetup,
      onRematch: () => {
        if (!lastConfig) return;
        const { seed: _seed, ...again } = lastConfig;
        start(again, lastTutorial);
      },
      // The coach reads the table on screen only (a game starting behind setup waits for showPlay).
      afterRender: () => {
        if (play?.element.isConnected) coach?.update();
      },
    });
    if (typeof next === 'string') {
      showToast(next, 'error');
      return;
    }
    play?.dispose();
    play = next;
    lastConfig = cfg;
    lastTutorial = tutorial;
    showPlay();
  }

  // The tutorial coach (tutorial lane) lives on `root`, above every screen; not in the harness.
  if (opts.game?.tutorial && !opts.debug) {
    coach = opts.game.tutorial.create(root, {
      view: () => play?.game.view() ?? null,
      seed: () => (play ? String(play.game.state.config.seed) : null),
      start: (cfg) => start(cfg, true),
      newGame: showSetup,
      pace: (ms) => {
        paceMs = ms;
      },
    });
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
    showHome,
  };
}
