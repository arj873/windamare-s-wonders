import { describe, expect, it } from 'vitest';
import { SoundLimiter, coalesce } from './limiter';
import type { SoundCue } from './types';

const c = (id: string, level: SoundCue['level'] = 'normal'): SoundCue => ({ id, level });
const ids = (cues: SoundCue[]) => cues.map((x) => x.id);

describe('coalesce', () => {
  it('keeps one cue per id at its loudest level, in first-seen order', () => {
    expect(coalesce([c('build', 'low'), c('raid'), c('build', 'high'), c('raid', 'low')])).toEqual([
      c('build', 'high'),
      c('raid', 'normal'),
    ]);
  });
});

describe('SoundLimiter', () => {
  it('drops the same id within its cooldown', () => {
    const l = new SoundLimiter();
    expect(ids(l.admit([c('build', 'high')], 0))).toEqual(['build']);
    expect(ids(l.admit([c('build', 'high')], 100))).toEqual([]);
    expect(ids(l.admit([c('build', 'high')], 200))).toEqual(['build']);
    // Raids have a longer cooldown.
    expect(ids(l.admit([c('raid', 'high')], 0))).toEqual(['raid']);
    expect(ids(l.admit([c('raid', 'high')], 400))).toEqual([]);
    expect(ids(l.admit([c('raid', 'high')], 700))).toEqual(['raid']);
  });

  it('plays at most perUpdate cues, loudest first', () => {
    const l = new SoundLimiter({ perUpdate: 2 });
    const out = l.admit([c('a', 'low'), c('b', 'normal'), c('c', 'high'), c('d', 'high')], 0);
    expect(ids(out)).toEqual(['c', 'd']);
  });

  it('budgets normal and low cues per window; high cues bypass it', () => {
    const l = new SoundLimiter({ budget: { normal: 3, low: 1 } });
    expect(ids(l.admit([c('a', 'low')], 0))).toEqual(['a']);
    expect(ids(l.admit([c('b', 'low')], 10))).toEqual([]);
    expect(ids(l.admit([c('b', 'normal')], 20))).toEqual(['b']);
    expect(ids(l.admit([c('e', 'normal')], 30))).toEqual(['e']);
    expect(ids(l.admit([c('f', 'normal')], 40))).toEqual([]);
    expect(ids(l.admit([c('g', 'high')], 50))).toEqual(['g']);
    // The window rolls on.
    expect(ids(l.admit([c('h', 'low')], 1100))).toEqual(['h']);
  });

  it('reset forgets cooldowns and the window', () => {
    const l = new SoundLimiter();
    l.admit([c('build', 'high')], 0);
    l.reset();
    expect(ids(l.admit([c('build', 'high')], 1))).toEqual(['build']);
  });
});
