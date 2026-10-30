// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { WwEvent, WwEventEntry } from '../../engine/game/events';
import { gainsText, planReveal } from './plan';
import { playReveal, revealDuration, type RevealAnchors } from './reveal';

const entry = (event: WwEvent, seq = 1): WwEventEntry => ({
  seq,
  round: 1,
  turn: 1,
  text: '',
  event,
});
const card = { id: 1, def: 'mill' };

const turn: WwEventEntry[] = [
  entry({ type: 'spend', seat: 0, card, gains: { coins: 2 } }),
  entry({ type: 'glean', seat: 1, gains: {} }),
  entry({ type: 'pay', seat: 0, card, goods: {}, exchanges: [], bank: [], buys: [], coins: 1 }),
  entry({ type: 'trade', seller: 1, buyer: 0, good: 'flint', price: 2, filled: true, bonus: 0 }),
  entry({ type: 'build', seat: 0, card, cover: null, gains: { labour: 1 } }),
  entry({ type: 'tier', seat: 0, greatWork: 'gw', tier: 0, gains: {} }),
  entry({
    type: 'raid',
    seat: 1,
    raid: 'r',
    outcome: 'plundered',
    guard: 1,
    strength: 3,
    valour: 0,
    lost: 2,
  }),
];

describe('gainsText', () => {
  it('shows signed nonzero entries', () => {
    expect(gainsText({ coins: 2, flint: -1, labour: 0 })).toBe('+2 coins, −1 flint');
  });
});

describe('planReveal extras', () => {
  it('pluralises one coin', () => {
    expect(gainsText({ coins: 1 })).toBe('+1 coin');
    expect(gainsText({ coins: -3 })).toBe('−3 coins');
  });

  it('announces great works, the season raid and honour changes', () => {
    const b = planReveal([
      entry({ type: 'greatWork', seat: 2, greatWork: 'gw' }),
      entry({ type: 'raidRevealed', season: 2, raid: 'wolves', strength: 4 }),
      entry({ type: 'honour', honour: 'h', leaders: [1], was: [], best: 3 }),
      entry({ type: 'honour', honour: 'g', leaders: [], was: [1], best: 0 }),
    ]);
    const steps = b.flatMap((x) => x.steps);
    expect(steps.map((s) => s.kind)).toEqual(['chip', 'notice', 'chip', 'notice']);
    expect(steps[1]).toMatchObject({ text: 'Raid: wolves (strength 4)' });
    expect(b[0]!.cue).toBe('reveal');
  });
});

describe('planReveal', () => {
  it('orders beats by what happened and attaches sounds', () => {
    const beats = planReveal(turn);
    expect(beats.map((b) => b.cue)).toEqual(['spend', 'coin', 'build', 'tier', 'raidHit']);
    expect(beats[0]!.steps.map((s) => s.kind)).toEqual(['flip', 'chip', 'flip']);
    expect(beats[1]!.steps.map((s) => s.kind)).toEqual(['chip', 'fly']);
  });

  it('a held raid sounds differently, a burn is silent', () => {
    const b = planReveal([
      entry({ type: 'burn', seat: 0 }),
      entry({
        type: 'raid',
        seat: 0,
        raid: 'r',
        outcome: 'held',
        guard: 4,
        strength: 3,
        valour: 2,
        lost: 0,
      }),
    ]);
    expect(b.map((x) => x.cue)).toEqual([null, 'raidHold']);
  });

  it('no events, no beats', () => {
    expect(planReveal([])).toEqual([]);
  });
});

const anchors = (): RevealAnchors => {
  const el = document.createElement('div');
  return { layer: document.createElement('div'), town: () => el };
};

describe('card sprites', () => {
  it('show the card name, kind colour and art from face()', async () => {
    const a = anchors();
    document.body.append(a.layer);
    let seenHtml = '';
    HTMLElement.prototype.animate = function (this: HTMLElement) {
      seenHtml ||= this.innerHTML;
      return { finished: Promise.resolve() };
    } as unknown as HTMLElement['animate'];
    try {
      await playReveal([turn[0]!], a, {
        instant: false,
        speed: 100,
        label: (id) => `Name of ${id}`,
        face: () => ({ art: '/art/x.svg', kind: 'hall' }),
      });
    } finally {
      // @ts-expect-error jsdom has no animate, so remove the stub
      delete HTMLElement.prototype.animate;
    }
    expect(seenHtml).toContain('Name of mill');
    expect(seenHtml).toContain('data-kind="hall"');
    expect(seenHtml).toContain('/art/x.svg');
  });
});

describe('playReveal', () => {
  it('instant mode only cues, in order, and leaves no sprites', async () => {
    const cues: string[] = [];
    const a = anchors();
    await playReveal(turn, a, { instant: true, onCue: (c) => cues.push(c) });
    expect(cues).toEqual(['spend', 'coin', 'build', 'tier', 'raidHit']);
    expect(a.layer.children).toHaveLength(0);
  });

  it('animates with transform/opacity only and cleans up', async () => {
    const a = anchors();
    const animate = vi.fn((frames: Keyframe[]) => {
      for (const f of frames)
        for (const k of Object.keys(f)) expect(['transform', 'opacity', 'offset']).toContain(k);
      return { finished: Promise.resolve() };
    });
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate'];
    try {
      await playReveal(turn, a, { instant: false, speed: 100 });
      expect(animate).toHaveBeenCalled();
      expect(a.layer.children).toHaveLength(0);
    } finally {
      // @ts-expect-error restore jsdom's lack of animate
      delete HTMLElement.prototype.animate;
    }
  });

  it('skips a missing anchor and honours cancel', async () => {
    const a: RevealAnchors = { layer: document.createElement('div'), town: () => null };
    await expect(playReveal(turn, a, { instant: false, speed: 100 })).resolves.toBeUndefined();
    const cues: string[] = [];
    await playReveal(turn, anchors(), {
      instant: true,
      cancelled: () => true,
      onCue: (c) => cues.push(c),
    });
    expect(cues).toEqual([]);
  });

  it('estimates a duration that shrinks with speed', () => {
    const b = planReveal(turn);
    expect(revealDuration(b, 2)).toBeCloseTo(revealDuration(b, 1) / 2);
  });
});
