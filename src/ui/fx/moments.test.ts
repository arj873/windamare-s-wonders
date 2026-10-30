// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countAt,
  countUp,
  countUpScores,
  easeOut,
  seasonTransition,
  selectPulse,
  tierMoment,
} from './moments';

const frames = (el: HTMLElement) => el;

afterEach(() => {
  // @ts-expect-error jsdom has no animate
  delete HTMLElement.prototype.animate;
  vi.unstubAllGlobals();
});

describe('countAt', () => {
  it('eases from the start to exactly the end', () => {
    expect(countAt(0, 40, 0)).toBe(0);
    expect(countAt(0, 40, 1)).toBe(40);
    expect(countAt(0, 40, 2)).toBe(40);
    expect(countAt(0, 40, 0.5)).toBeGreaterThan(20);
    expect(easeOut(0.5)).toBeCloseTo(0.875);
  });
});

describe('countUp', () => {
  it('instant: shows the end at once', async () => {
    const el = document.createElement('span');
    await countUp(el, 0, 37, { instant: true });
    expect(el.textContent).toBe('37');
  });

  it('animates through rAF, ticks on change, ends on the exact total', async () => {
    let now = 0;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      now += 100;
      setTimeout(() => cb(now), 0);
      return 1;
    });
    const el = document.createElement('span');
    const ticks: number[] = [];
    await countUp(el, 0, 12, { instant: false, ms: 400, onTick: (n) => ticks.push(n) });
    expect(el.textContent).toBe('12');
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });

  it('countUpScores lands the highest total last', async () => {
    const mk = () => document.createElement('span');
    const a = mk();
    const b = mk();
    await countUpScores(
      [
        { el: a, total: 30 },
        { el: b, total: 10 },
      ],
      { instant: true },
    );
    expect([a.textContent, b.textContent]).toEqual(['30', '10']);
  });
});

describe('moments', () => {
  it('cue fires even when instant; no sprites left behind', async () => {
    const layer = document.createElement('div');
    const cue = vi.fn();
    await seasonTransition(layer, { title: 'Summer' }, { instant: true, onCue: cue });
    await tierMoment(layer, document.createElement('div'), { instant: true, onCue: cue });
    expect(cue).toHaveBeenCalledTimes(2);
    expect(layer.children).toHaveLength(0);
  });

  it('animated moments use only transform/opacity and clean up', async () => {
    const animate = vi.fn((fr: Keyframe[]) => {
      for (const f of fr)
        for (const k of Object.keys(f)) expect(['transform', 'opacity', 'offset']).toContain(k);
      return { finished: Promise.resolve() };
    });
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate'];
    const layer = document.createElement('div');
    await seasonTransition(layer, { title: 'Winter', subtitle: 'Raids' }, { instant: false });
    await tierMoment(layer, document.createElement('div'), { instant: false });
    expect(animate).toHaveBeenCalledTimes(1 + 9);
    expect(layer.children).toHaveLength(0);
    const card = frames(document.createElement('div'));
    await selectPulse(card, { instant: false });
    expect(animate).toHaveBeenCalledTimes(11);
  });
});
