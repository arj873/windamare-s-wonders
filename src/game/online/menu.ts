/**
 * The ☰ menu for a room visit (research R8 #4): How to play, Animations and Sound, in the same
 * corner and widget as the hotseat menu (src/game/boot.ts). No New game or Bot speed: the room
 * owns those. Boot's own corner leaves the page while a room is on screen.
 */
import { h, Menu, type MenuItem } from '../../ui';
import { loadAnimations, saveAnimations } from '../../ui/prefs';

/** The page's sound on/off (src/audio `sfx`; tests pass a stand-in). */
export interface SoundSwitch {
  readonly muted: boolean;
  setMuted(muted: boolean): void;
}

export interface OnlineMenuOptions {
  /** The tutorial lane's rules overlay; absent = no "How to play". */
  openRules?: () => void;
  sound?: SoundSwitch;
}

const ON_OFF = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
] as const;

export function onlineMenuItems(opts: OnlineMenuOptions): MenuItem[] {
  const items: MenuItem[] = [];
  const rules = opts.openRules;
  if (rules) {
    items.push({
      kind: 'action',
      label: 'How to play',
      hint: 'Rules (or press ?)',
      onClick: rules,
    });
  }
  items.push({
    kind: 'choice',
    label: 'Animations',
    options: ON_OFF,
    value: loadAnimations() ? 'on' : 'off',
    // As boot does: the class turns CSS motion off, the pref turns the reveal off.
    onChange: (id) => {
      saveAnimations(id === 'on');
      document.documentElement.classList.toggle('no-anim', id === 'off');
    },
  });
  const sound = opts.sound;
  if (sound) {
    items.push({
      kind: 'choice',
      label: 'Sound',
      options: ON_OFF,
      value: sound.muted ? 'off' : 'on',
      onChange: (id) => sound.setMuted(id === 'off'),
    });
  }
  return items;
}

/** The ☰ button in the top-left corner (where the table and the lobby leave room for it). */
export function onlineMenu(opts: OnlineMenuOptions): { element: HTMLElement; menu: Menu } {
  const menu = new Menu(onlineMenuItems(opts));
  const element = h('div', { class: 'ww-corner ol-corner' }, menu.element);
  return { element, menu };
}
