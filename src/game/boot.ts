/**
 * App shell boot (until U1 has a game to start): the ☰ menu and the setup screen. Start shows
 * a toast because there is no engine yet. Platform calls `boot(root)` from src/app.ts.
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
  type NewGameConfig,
} from '../ui';

export interface BootHandle {
  menu: Menu;
  setup: SetupScreen;
}

export function boot(root: HTMLElement, onStart?: (cfg: NewGameConfig) => void): BootHandle {
  document.documentElement.classList.toggle('no-anim', !loadAnimations());
  const setup = new SetupScreen({
    onStart:
      onStart ??
      ((cfg) =>
        showToast(
          `No game yet (U1 wires the engine): ${cfg.players.length} players, ${
            cfg.pickTimerSec ? `${cfg.pickTimerSec} s picks` : 'no timer'
          }`,
        )),
  });
  const botSpeed: MenuChoice<BotSpeed> = {
    kind: 'choice',
    label: 'Bot speed',
    options: BOT_SPEEDS,
    value: loadBotSpeed(),
    onChange: (id) => saveBotSpeed(id),
  };
  // No "New game" yet: the setup screen is the only screen until U1.
  const menu = new Menu([
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
  ]);
  const corner = document.createElement('div');
  corner.className = 'ww-corner';
  corner.style.cssText = 'position:fixed;top:12px;left:12px;z-index:25;';
  corner.append(menu.element);
  root.replaceChildren(setup.element, corner);
  return { menu, setup };
}
