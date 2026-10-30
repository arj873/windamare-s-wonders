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
import type { SeatId } from '../../engine/core';
import type { WwEventEntry } from '../../engine/game/events';
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

export interface RevealOptions extends PlanOptions {
  /** Skip all motion (also forced by prefers-reduced-motion). */
  instant?: boolean;
  /** Called as each beat starts with its sound id and the seat it is about. */
  onCue?: (cue: BeatCue, seat: SeatId | null) => void;
  /** Speed multiplier (bots at fast speed). Default 1. */
  speed?: number;
  /** Abort: when this returns true the rest of the reveal is skipped. */
  cancelled?: () => boolean;
}

/** Milliseconds each step lasts at speed 1. */
export const STEP_MS = {
  flip: 360,
  build: 520,
  chip: 780,
  fly: 600,
  tier: 640,
  raid: 760,
} as const;
const BEAT_GAP_MS = 90;

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** Total ms the reveal would take (beats play in sequence, steps of a beat together). */
export function revealDuration(beats: readonly Beat[], speed = 1): number {
  let ms = 0;
  for (const b of beats)
    ms += Math.max(0, ...b.steps.map((s) => STEP_MS[kindTime(s)])) + BEAT_GAP_MS;
  return ms / speed;
}

const kindTime = (s: Step): keyof typeof STEP_MS => (s.kind === 'chip' ? 'chip' : s.kind);

export async function playReveal(
  events: readonly WwEventEntry[],
  anchors: RevealAnchors,
  opts: RevealOptions = {},
): Promise<void> {
  const beats = planReveal(events, opts);
  const instant = opts.instant ?? prefersReducedMotion();
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  for (const beat of beats) {
    if (opts.cancelled?.()) return;
    if (beat.cue) opts.onCue?.(beat.cue, beat.seat);
    if (instant) continue;
    await Promise.all(beat.steps.map((s) => playStep(s, anchors, speed).catch(() => undefined)));
    await wait(BEAT_GAP_MS / speed);
  }
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

function sprite(layer: HTMLElement, cls: string, text: string, at: Pt): HTMLElement {
  const el = document.createElement('div');
  el.className = `fx-sprite ${cls}`;
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  // Positioned once; all motion below is transform/opacity.
  el.style.cssText = `position:absolute;left:${at.x}px;top:${at.y}px;pointer-events:none;will-change:transform,opacity;`;
  layer.append(el);
  return el;
}

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

async function playStep(step: Step, a: RevealAnchors, speed: number): Promise<void> {
  const ms = STEP_MS[kindTime(step)] / speed;
  const layer = a.layer;
  switch (step.kind) {
    case 'flip': {
      const at = centre(a.hand?.(step.seat) ?? a.town(step.seat), layer);
      if (!at) return;
      const el = sprite(layer, 'fx-card', step.card ?? '?', at);
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
      const el = sprite(layer, 'fx-card', step.card, from);
      const dx = to.x - from.x;
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
      const dx = to.x - from.x;
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
