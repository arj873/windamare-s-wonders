/**
 * F1: the reveal moment. `playReveal(events, anchors)` animates one action's events in order
 * (see plan.ts) over the table: picks flip, builds fly into towns, Spends and payments float as
 * chips, buys move coins between neighbours, Raid results land, Great Work tiers fill.
 *
 * Compositor-only: every animation is `transform` + `opacity` on short-lived absolutely
 * positioned elements in `anchors.layer`; nothing reads layout inside a frame loop (one
 * getBoundingClientRect per anchor per step). `prefers-reduced-motion` (or `instant`) skips the
 * motion and resolves at once; sounds still play. Never rejects: a missing anchor is skipped.
 */
import './fx.css';
import type { SeatId } from '../../engine/core';
import type { WwEventEntry } from '../../engine/game/events';
import { fxSpeed } from './speed';
import { planReveal, type Beat, type BeatCue, type PlanOptions, type Step } from './plan';

export interface RevealAnchors {
  /** Overlay root: position: relative/fixed, pointer-events: none, overflow visible. */
  layer: HTMLElement;
  /** A town's tableau area (where chips, builds and Raid results show). */
  town(seat: SeatId): HTMLElement | null;
  /** Where picked cards flip and builds start (the hand / pick slot). Default: the town. */
  hand?(seat: SeatId): HTMLElement | null;
  /** The Great Work tier slot, if ui draws one. Default: the town. */
  tier?(seat: SeatId, tier: number): HTMLElement | null;
}

/** What a card sprite shows: ui supplies it from the same presenter as the card faces. */
export interface CardLook {
  /** Illustration URL (public/art/cards/...), shown in the sprite's art window. */
  art?: string;
  /** Kind id: the name band takes the kind's colour (`kind-head`, theme/kinds.css). */
  kind?: string;
}

export interface RevealOptions extends PlanOptions {
  /** Look up the art and kind of a card def. Without it sprites show just the name. */
  face?: (def: string) => CardLook | null;
  /** Skip all motion (default: prefers-reduced-motion; the setting Off also skips). */
  instant?: boolean;
  /** Called as each beat starts with its sound id and the seat it is about. */
  onCue?: (cue: BeatCue, seat: SeatId | null) => void;
  /** Speed multiplier. Default: the player's setting (`fxSpeed`: Fast 2, Normal 1). */
  speed?: number;
  /** Abort: when this returns true the rest of the reveal is skipped. */
  cancelled?: () => boolean;
}

/** Milliseconds each step lasts at speed 1 ("Normal"). Tuned so a typical turn is ~1.8 s (F6). */
export const STEP_MS = {
  flip: 240,
  build: 340,
  chip: 520,
  fly: 400,
  tier: 440,
  raid: 520,
  notice: 800,
} as const;
/** The next beat starts when this much of the current beat's longest step has played. */
export const BEAT_OVERLAP = 0.5;
const BEAT_GAP_MS = 30;

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

const kindTime = (s: Step): keyof typeof STEP_MS => (s.kind === 'chip' ? 'chip' : s.kind);
const beatLength = (b: Beat): number => Math.max(0, ...b.steps.map((s) => STEP_MS[kindTime(s)]));

/** When each beat starts (ms from the reveal's start, speed 1) and the total length. */
export function schedule(beats: readonly Beat[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let at = 0;
  let total = 0;
  for (const b of beats) {
    starts.push(at);
    const len = beatLength(b);
    total = Math.max(total, at + len);
    at += len * BEAT_OVERLAP + BEAT_GAP_MS;
  }
  return { starts, total };
}

/** Total ms the reveal would take. Beats overlap: the next starts while the last still fades. */
export function revealDuration(beats: readonly Beat[], speed = 1): number {
  return schedule(beats).total / speed;
}

export async function playReveal(
  events: readonly WwEventEntry[],
  anchors: RevealAnchors,
  opts: RevealOptions = {},
): Promise<void> {
  const beats = planReveal(events, opts);
  // The setting Off always wins, even when ui passes `instant: false`.
  const instant = (opts.instant ?? prefersReducedMotion()) || fxSpeed.off;
  const speed = opts.speed && opts.speed > 0 ? opts.speed : fxSpeed.factor;
  const { starts } = schedule(beats);
  const t0 = Date.now();
  const running: Promise<unknown>[] = [];
  for (const [i, beat] of beats.entries()) {
    if (!instant) {
      const due = (starts[i] ?? 0) / speed - (Date.now() - t0);
      if (due > 0) await wait(due);
    }
    if (opts.cancelled?.()) break;
    if (beat.cue) opts.onCue?.(beat.cue, beat.seat);
    if (instant) continue;
    for (const s of beat.steps)
      running.push(playStep(s, anchors, speed, opts.face).catch(() => undefined));
  }
  await Promise.all(running);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Pt {
  x: number;
  y: number;
}

function centre(el: HTMLElement | null, layer: HTMLElement): Pt | null {
  if (!el) return null;
  const a = el.getBoundingClientRect();
  const l = layer.getBoundingClientRect();
  return { x: a.left - l.left + a.width / 2, y: a.top - l.top + a.height / 2 };
}

/** Keep a sprite of width `w` centred on `x` inside the layer (a wide chip near an edge). */
function clampX(layer: HTMLElement, w: number, x: number): number {
  const max = layer.clientWidth;
  if (!max || !w) return x;
  const half = Math.min(w, max) / 2 + EDGE_PAD;
  return Math.min(Math.max(x, half), Math.max(half, max - half));
}
const EDGE_PAD = 2;

function sprite(layer: HTMLElement, cls: string, text: string, at: Pt): HTMLElement {
  const el = document.createElement('div');
  el.className = `fx-sprite ${cls}`;
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  // Positioned once; all motion below is transform/opacity.
  el.style.cssText = `position:absolute;left:${at.x}px;top:${at.y}px;pointer-events:none;will-change:transform,opacity;`;
  layer.append(el);
  // One layout read per sprite: slide it back inside the layer if it would cross an edge.
  const x = clampX(layer, el.offsetWidth, at.x);
  if (x !== at.x) el.style.left = `${x}px`;
  el.dataset.x = String(x);
  return el;
}

/** The layer x a sprite really sits at (after clamping), for travel maths. */
const spriteX = (el: HTMLElement, fallback: number): number => Number(el.dataset.x ?? fallback);

/** Run keyframes on `el`, remove it after. Without Web Animations, resolves at once. */
async function run(el: HTMLElement, frames: Keyframe[], ms: number): Promise<void> {
  try {
    if (typeof el.animate !== 'function') return;
    await el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' })
      .finished;
  } finally {
    el.remove();
  }
}

const CENTER = 'translate(-50%,-50%)';

/** A card sprite: kind-coloured name band over the illustration; a plain back when unnamed. */
function cardSprite(
  layer: HTMLElement,
  at: Pt,
  def: string | null,
  name: string | null,
  face?: (def: string) => CardLook | null,
): HTMLElement {
  const look = def ? (face?.(def) ?? null) : null;
  const el = sprite(layer, `fx-card${def ? '' : ' fx-back'}`, '', at);
  if (name) {
    const band = document.createElement('span');
    // art's kinds.css colours `.kind-head[data-kind]`.
    band.className = 'fx-card-name kind-head';
    if (look?.kind) band.dataset.kind = look.kind;
    band.textContent = name;
    el.append(band);
  }
  if (look?.art) {
    const img = document.createElement('img');
    img.className = 'fx-card-art';
    img.src = look.art;
    img.alt = '';
    img.decoding = 'async';
    el.append(img);
  }
  return el;
}

async function playStep(
  step: Step,
  a: RevealAnchors,
  speed: number,
  face?: (def: string) => CardLook | null,
): Promise<void> {
  const ms = STEP_MS[kindTime(step)] / speed;
  const layer = a.layer;
  switch (step.kind) {
    case 'flip': {
      const at = centre(a.hand?.(step.seat) ?? a.town(step.seat), layer);
      if (!at) return;
      const el = cardSprite(layer, at, step.card, step.name, face);
      return run(
        el,
        [
          { transform: `${CENTER} rotateY(90deg) scale(.9)`, opacity: 0 },
          { transform: `${CENTER} rotateY(0) scale(1.05)`, opacity: 1, offset: 0.55 },
          { transform: `${CENTER} scale(1)`, opacity: 1, offset: 0.8 },
          { transform: `${CENTER} scale(.9)`, opacity: 0 },
        ],
        ms,
      );
    }
    case 'build': {
      const from = centre(a.hand?.(step.seat) ?? a.town(step.seat), layer);
      const to = centre(a.town(step.seat), layer);
      if (!from || !to) return;
      const el = cardSprite(layer, from, step.card, step.name, face);
      const dx = clampX(layer, el.offsetWidth, to.x) - spriteX(el, from.x);
      const dy = to.y - from.y;
      return run(
        el,
        [
          { transform: `${CENTER} scale(1)`, opacity: 1 },
          { transform: `${CENTER} translate(${dx}px,${dy}px) scale(.8)`, opacity: 1, offset: 0.8 },
          { transform: `${CENTER} translate(${dx}px,${dy}px) scale(.7)`, opacity: 0 },
        ],
        ms,
      );
    }
    case 'chip': {
      const at = centre(a.town(step.seat), layer);
      if (!at) return;
      const el = sprite(layer, `fx-chip fx-${step.tone}`, step.text, at);
      return run(
        el,
        [
          { transform: `${CENTER} translateY(8px)`, opacity: 0 },
          { transform: `${CENTER} translateY(-6px)`, opacity: 1, offset: 0.25 },
          { transform: `${CENTER} translateY(-26px)`, opacity: 1, offset: 0.75 },
          { transform: `${CENTER} translateY(-34px)`, opacity: 0 },
        ],
        ms,
      );
    }
    case 'fly': {
      const from = centre(a.town(step.from), layer);
      const to = centre(a.town(step.to), layer);
      if (!from || !to) return;
      const el = sprite(layer, 'fx-chip fx-coin', step.text, from);
      const dx = clampX(layer, el.offsetWidth, to.x) - spriteX(el, from.x);
      const dy = to.y - from.y;
      return run(
        el,
        [
          { transform: `${CENTER} scale(.8)`, opacity: 0 },
          { transform: `${CENTER} scale(1)`, opacity: 1, offset: 0.15 },
          { transform: `${CENTER} translate(${dx}px,${dy}px) scale(1)`, opacity: 1, offset: 0.85 },
          { transform: `${CENTER} translate(${dx}px,${dy}px) scale(.8)`, opacity: 0 },
        ],
        ms,
      );
    }
    case 'tier': {
      const at = centre(a.tier?.(step.seat, step.tier) ?? a.town(step.seat), layer);
      if (!at) return;
      const el = sprite(layer, 'fx-tier', `Tier ${step.tier + 1}`, at);
      return run(
        el,
        [
          { transform: `${CENTER} scale(.6)`, opacity: 0 },
          { transform: `${CENTER} scale(1.2)`, opacity: 1, offset: 0.4 },
          { transform: `${CENTER} scale(1)`, opacity: 1, offset: 0.75 },
          { transform: `${CENTER} scale(1)`, opacity: 0 },
        ],
        ms,
      );
    }
    case 'notice': {
      const el = sprite(layer, 'fx-notice', step.text, {
        x: layer.clientWidth / 2,
        y: layer.clientHeight * 0.3,
      });
      return run(
        el,
        [
          { transform: `${CENTER} translateY(14px)`, opacity: 0 },
          { transform: `${CENTER} translateY(0)`, opacity: 1, offset: 0.2 },
          { transform: `${CENTER} translateY(0)`, opacity: 1, offset: 0.8 },
          { transform: `${CENTER} translateY(-8px)`, opacity: 0 },
        ],
        ms,
      );
    }
    case 'raid': {
      const at = centre(a.town(step.seat), layer);
      if (!at) return;
      const el = sprite(layer, `fx-raid fx-${step.outcome}`, step.text, at);
      const shake = step.outcome === 'plundered';
      return run(
        el,
        shake
          ? [
              { transform: `${CENTER} translateX(-8px)`, opacity: 0 },
              { transform: `${CENTER} translateX(8px)`, opacity: 1, offset: 0.15 },
              { transform: `${CENTER} translateX(-5px)`, opacity: 1, offset: 0.3 },
              { transform: `${CENTER} translateX(0)`, opacity: 1, offset: 0.8 },
              { transform: `${CENTER}`, opacity: 0 },
            ]
          : [
              { transform: `${CENTER} scale(.8)`, opacity: 0 },
              { transform: `${CENTER} scale(1.1)`, opacity: 1, offset: 0.3 },
              { transform: `${CENTER} scale(1)`, opacity: 1, offset: 0.8 },
              { transform: `${CENTER} scale(1)`, opacity: 0 },
            ],
        ms,
      );
    }
  }
}
