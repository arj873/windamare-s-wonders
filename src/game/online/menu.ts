/**
 * The ☰ menu for a room visit (research R8 #4): How to play, Animations (fx's Fast / Normal /
 * Off) and Sound, in the same corner and widget as the hotseat menu (src/game/boot.ts). No New
 * game or Bot speed: the room owns those. Boot's own corner leaves the page while a room is on
 * screen.
 */
import { h, Menu, type MenuItem } from '../../ui';
import {
  FX_SPEED_LABEL,
  FX_SPEEDS,
  fxSpeed,
  type FxSpeed,
  type FxSpeedSetting,
} from '../../ui/fx/speed';
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
  /** fx's animation speed (F6). Default: the page's `fxSpeed`. */
  speed?: Pick<FxSpeedSetting, 'get' | 'set'>;
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
  const speed = opts.speed ?? fxSpeed;
  items.push({
    kind: 'choice',
    label: 'Animations',
    options: FX_SPEEDS.map((id) => ({ id, label: FX_SPEED_LABEL[id] })),
    // An earlier "Animations: Off" (ui's pref) still reads as Off.
    value: loadAnimations() ? speed.get() : 'off',
    // fx's speed drives the reveal and moments (F6). Off also turns the CSS motion off, as the
    // old On/Off did, so the table's transitions and `motionOn()` agree with fx.
    onChange: (id) => {
      speed.set(id as FxSpeed);
      saveAnimations(id !== 'off');
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
