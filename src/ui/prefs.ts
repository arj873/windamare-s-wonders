/**
 * Small saved preferences (menu settings, setup draft) and the system's motion setting.
 * Every storage access is guarded: full or blocked storage just means nothing is remembered.
 */

export type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const ANIMATIONS_KEY = 'ww.animations';
export const BOT_SPEED_KEY = 'ww.botSpeed';

/** `localStorage`, or null where there is none (node, privacy mode). */
export function browserStorage(): PrefStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPref(storage: PrefStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function savePref(storage: PrefStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Quota / privacy mode: the choice just isn't remembered.
  }
}

/** The "Animations" menu setting: on unless the player turned it off. */
export function loadAnimations(storage: PrefStorage | null = browserStorage()): boolean {
  return loadPref(storage, ANIMATIONS_KEY) !== 'off';
}

export function saveAnimations(on: boolean, storage: PrefStorage | null = browserStorage()): void {
  savePref(storage, ANIMATIONS_KEY, on ? 'on' : 'off');
}

/** The system asks for reduced motion (false where it cannot be asked: node, old browsers). */
export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** Animations should play: the menu setting is on and the system does not ask for less motion. */
export function motionOn(storage: PrefStorage | null = browserStorage()): boolean {
  return loadAnimations(storage) && !prefersReducedMotion();
}

/** Bot speed presets (menu): delay before a bot locks its pick. UX.md §1: Normal 300–900 ms. */
export const BOT_SPEEDS: readonly { id: BotSpeed; label: string; minMs: number; maxMs: number }[] =
  [
    { id: 'slow', label: 'Slow', minMs: 900, maxMs: 1800 },
    { id: 'normal', label: 'Normal', minMs: 300, maxMs: 900 },
    { id: 'fast', label: 'Fast', minMs: 80, maxMs: 250 },
    { id: 'instant', label: 'Instant', minMs: 0, maxMs: 0 },
  ];

export type BotSpeed = 'slow' | 'normal' | 'fast' | 'instant';

export function loadBotSpeed(storage: PrefStorage | null = browserStorage()): BotSpeed {
  const v = loadPref(storage, BOT_SPEED_KEY);
  return BOT_SPEEDS.find((s) => s.id === v)?.id ?? 'normal';
}

export function saveBotSpeed(
  speed: BotSpeed,
  storage: PrefStorage | null = browserStorage(),
): void {
  savePref(storage, BOT_SPEED_KEY, speed);
}
