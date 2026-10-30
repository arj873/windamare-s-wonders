/**
 * F6: the player's motion speed, one setting for every fx animation: Fast / Normal / Off.
 * Saved in localStorage ('ww:fxspeed'). ui puts it in the ☰ menu:
 *   `fxSpeed.get()`, `fxSpeed.set('fast' | 'normal' | 'off')`, `fxSpeed.onChange(fn)`.
 * Off = no motion (like prefers-reduced-motion; sounds still play). The defaults of playReveal
 * and the moments read it, so ui passes nothing.
 */
export type FxSpeed = 'fast' | 'normal' | 'off';

export const FX_SPEEDS: readonly FxSpeed[] = ['fast', 'normal', 'off'];
export const FX_SPEED_KEY = 'ww:fxspeed';
export const FX_SPEED_LABEL: Readonly<Record<FxSpeed, string>> = {
  fast: 'Fast',
  normal: 'Normal',
  off: 'Off',
};
/** Playback multiplier per setting (Off never animates). */
export const FX_SPEED_FACTOR: Readonly<Record<FxSpeed, number>> = { fast: 2, normal: 1, off: 1 };

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class FxSpeedSetting {
  private value: FxSpeed = 'normal';
  private readonly listeners = new Set<(s: FxSpeed) => void>();

  constructor(private readonly store: Store | null = defaultStore()) {
    try {
      const raw = this.store?.getItem(FX_SPEED_KEY);
      if (FX_SPEEDS.includes(raw as FxSpeed)) this.value = raw as FxSpeed;
    } catch {
      // Unreadable storage: stay on Normal.
    }
  }

  get(): FxSpeed {
    return this.value;
  }

  set(speed: FxSpeed): void {
    if (!FX_SPEEDS.includes(speed)) return;
    this.value = speed;
    try {
      this.store?.setItem(FX_SPEED_KEY, speed);
    } catch {
      // Private mode: the choice just does not stick.
    }
    for (const fn of this.listeners) fn(speed);
  }

  /** Called with the new value after every change; returns an unsubscribe. */
  onChange(fn: (s: FxSpeed) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** True when the setting is Off. */
  get off(): boolean {
    return this.value === 'off';
  }

  get factor(): number {
    return FX_SPEED_FACTOR[this.value];
  }
}

/** The page's one setting. */
export const fxSpeed = new FxSpeedSetting();
