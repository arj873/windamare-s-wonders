/**
 * F3: the bigger moments around the table: the Season transition banner, the end-game score
 * count-up, the Great Work tier-complete burst and the card select pulse. Like reveal.ts they are
 * transform/opacity only, resolve at once under prefers-reduced-motion (or `instant`) and never
 * reject. The count-up writes text only (use tabular figures so the width does not move).
 */
import './fx.css';
import { prefersReducedMotion } from './reveal';
import { fxSpeed } from './speed';

export interface MomentOptions {
  /** Skip motion (also forced by prefers-reduced-motion). */
  instant?: boolean;
  /** Speed multiplier, default 1. */
  speed?: number;
}

// The setting Off always wins; otherwise `instant` (reduced motion) or the OS preference.
const isInstant = (o: MomentOptions) => (o.instant ?? prefersReducedMotion()) || fxSpeed.off;
const speedOf = (o: MomentOptions) => (o.speed && o.speed > 0 ? o.speed : fxSpeed.factor);
const EASE = 'cubic-bezier(.2,.7,.2,1)';

async function run(el: HTMLElement, frames: Keyframe[], ms: number, keep = false): Promise<void> {
  try {
    if (typeof el.animate !== 'function') return;
    await el.animate(frames, { duration: ms, easing: EASE, fill: 'forwards' }).finished;
  } catch {
    // Cancelled (element removed): nothing to do.
  } finally {
    if (!keep) el.remove();
  }
}

/**
 * The Season banner: a title that rises in, holds and fades ("Summer", "Raids are coming").
 * `layer` is the table's overlay (position: relative/fixed); the banner centres in it.
 * `onCue` fires once as it starts, for the `season` sound.
 */
export async function seasonTransition(
  layer: HTMLElement,
  text: { title: string; subtitle?: string },
  opts: MomentOptions & { onCue?: () => void } = {},
): Promise<void> {
  opts.onCue?.();
  if (isInstant(opts)) return;
  const el = document.createElement('div');
  el.className = 'fx-season';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:absolute;left:50%;top:40%;pointer-events:none;will-change:transform,opacity;';
  const h = document.createElement('div');
  h.className = 'fx-season-title';
  h.textContent = text.title;
  el.append(h);
  if (text.subtitle) {
    const s = document.createElement('div');
    s.className = 'fx-season-sub';
    s.textContent = text.subtitle;
    el.append(s);
  }
  layer.append(el);
  const C = 'translate(-50%,-50%)';
  await run(
    el,
    [
      { transform: `${C} translateY(24px) scale(.92)`, opacity: 0 },
      { transform: `${C} translateY(0) scale(1)`, opacity: 1, offset: 0.2 },
      { transform: `${C} translateY(0) scale(1.02)`, opacity: 1, offset: 0.78 },
      { transform: `${C} translateY(-14px) scale(1.04)`, opacity: 0 },
    ],
    1800 / speedOf(opts),
  );
}

/** Ease-out cubic: fast start, gentle landing. */
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** The integer shown `t` (0..1) of the way from `from` to `to`. */
export const countAt = (from: number, to: number, t: number): number =>
  Math.round(from + (to - from) * easeOut(Math.min(1, Math.max(0, t))));

/**
 * Count `el`'s text from `from` to `to` over `ms`. Under reduced motion it shows `to` at once.
 * `onTick` fires when the shown number changes (hook it to the `scoreTick` sound, limited).
 */
export function countUp(
  el: HTMLElement,
  from: number,
  to: number,
  opts: MomentOptions & {
    ms?: number;
    format?: (n: number) => string;
    onTick?: (n: number) => void;
    /** When it returns true the count jumps to its end and stops. */
    cancelled?: () => boolean;
  } = {},
): Promise<void> {
  const fmt = opts.format ?? String;
  if (isInstant(opts) || from === to || typeof requestAnimationFrame !== 'function') {
    el.textContent = fmt(to);
    return Promise.resolve();
  }
  const ms = (opts.ms ?? 900) / speedOf(opts);
  return new Promise((resolve) => {
    const t0 = performance.now();
    let shown = from;
    el.textContent = fmt(from);
    const frame = (now: number) => {
      if (opts.cancelled?.()) {
        el.textContent = fmt(to);
        resolve();
        return;
      }
      const t = (now - t0) / ms;
      const n = countAt(from, to, t);
      if (n !== shown) {
        shown = n;
        el.textContent = fmt(n);
        opts.onTick?.(n);
      }
      if (t >= 1) {
        el.textContent = fmt(to);
        resolve();
      } else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

export interface ScoreRow {
  el: HTMLElement;
  total: number;
}

/**
 * The end-game reveal: every town's total counts up from 0, lowest total first so the winner
 * lands last; each count is a little longer than the one before. Resolves true when it ran, false
 * when `once` says this game already counted (the totals are then just shown, so a re-render or a
 * second onAction call cannot restart it). A cancel jumps the rest to their totals.
 */
export async function countUpScores(
  rows: readonly ScoreRow[],
  opts: MomentOptions & {
    onTick?: (n: number) => void;
    /** A key for this game (its seed): the same key counts up only once per page. */
    once?: string;
    cancelled?: () => boolean;
  } = {},
): Promise<boolean> {
  const showAll = () => {
    for (const r of rows) r.el.textContent = String(r.total);
  };
  if (opts.once !== undefined) {
    if (counted.has(opts.once)) {
      showAll();
      return false;
    }
    counted.add(opts.once);
  }
  if (isInstant(opts)) {
    showAll();
    return true;
  }
  // Nothing is spoiled: every total waits at 0 until its turn.
  for (const r of rows) r.el.textContent = '0';
  const order = [...rows].sort((a, b) => a.total - b.total);
  for (const [i, r] of order.entries()) {
    if (opts.cancelled?.()) break;
    await countUp(r.el, 0, r.total, { ...opts, ms: 700 + i * 150 });
  }
  showAll();
  return true;
}

const counted = new Set<string>();

/** For tests: forget which games have counted up. */
export const resetCountedScores = (): void => counted.clear();

/**
 * Great Work tier-complete: a ring blooms from `target` with a few sparks. All sprites are
 * removed when done. `onCue` fires once (the `tier` sound).
 */
export async function tierMoment(
  layer: HTMLElement,
  target: HTMLElement | null,
  opts: MomentOptions & { onCue?: () => void } = {},
): Promise<void> {
  opts.onCue?.();
  if (isInstant(opts) || !target) return;
  const a = target.getBoundingClientRect();
  const l = layer.getBoundingClientRect();
  const x = a.left - l.left + a.width / 2;
  const y = a.top - l.top + a.height / 2;
  const make = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;pointer-events:none;will-change:transform,opacity;`;
    layer.append(el);
    return el;
  };
  const ms = 900 / speedOf(opts);
  const C = 'translate(-50%,-50%)';
  const jobs = [
    run(
      make('fx-ring'),
      [
        { transform: `${C} scale(.3)`, opacity: 0.9 },
        { transform: `${C} scale(2.2)`, opacity: 0 },
      ],
      ms,
    ),
  ];
  const SPARKS = 8;
  for (let i = 0; i < SPARKS; i++) {
    const ang = (i / SPARKS) * Math.PI * 2;
    const d = 46 + (i % 2) * 18;
    jobs.push(
      run(
        make('fx-spark'),
        [
          { transform: `${C} translate(0,0) scale(1)`, opacity: 1 },
          {
            transform: `${C} translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d}px) scale(.3)`,
            opacity: 0,
          },
        ],
        ms,
      ),
    );
  }
  await Promise.all(jobs);
}

/** A short pulse on a card when it is selected (hand or staged). Does not remove the element. */
export function selectPulse(el: HTMLElement, opts: MomentOptions = {}): Promise<void> {
  if (isInstant(opts)) return Promise.resolve();
  return run(
    el,
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.06)', offset: 0.4 },
      { transform: 'scale(1)' },
    ],
    220 / speedOf(opts),
    true,
  );
}
