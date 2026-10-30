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
import { playLocal, type GameBinding, type PlayHandle } from './play';

export interface BootOptions<S, T> {
  /** Replaces what Start does (tests). */
  onStart?: (cfg: NewGameConfig) => void;
  /** The ruleset to play; absent = no game yet. */
  game?: GameBinding<S, T>;
}

export interface BootHandle<S, T> {
  menu: Menu;
  /** The screen on show: the setup screen, or null while a game is on. */
  readonly setup: SetupScreen | null;
  readonly play: PlayHandle<S, T> | null;
}

export function boot<S, T>(root: HTMLElement, opts: BootOptions<S, T> = {}): BootHandle<S, T> {
  document.documentElement.classList.toggle('no-anim', !loadAnimations());
  let setup: SetupScreen | null = null;
  let play: PlayHandle<S, T> | null = null;
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

  function showSetup(): void {
    play?.hide();
    setup = new SetupScreen({
      onStart: start,
      ...(play ? { onBack: showPlay } : {}),
    });
    menu.setItems(prefs);
    root.replaceChildren(setup.element, corner);
  }

  function showPlay(): void {
    if (!play) return;
    setup = null;
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

  showSetup();
  return {
    menu,
    get setup() {
      return setup;
    },
    get play() {
      return play;
    },
  };
}
