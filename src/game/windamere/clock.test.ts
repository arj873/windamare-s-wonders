import { describe, expect, it } from 'vitest';
import type { WwState } from '../../engine';
import { windamereClock } from './clock';

const at = (turn: number, kind: 'pick' | 'prompt' = 'pick') =>
  ({ turn, phase: kind === 'pick' ? { kind } : { kind, then: 'start' } }) as unknown as WwState;

describe('windamereClock (RULES.md R15.3)', () => {
  it('gives R15.3 lengths per turn for Normal, Relaxed and Fast', () => {
    const turns = [0, 1, 2, 3, 4];
    expect(turns.map((t) => windamereClock.seconds(at(t), 1))).toEqual([45, 40, 35, 30, 25]);
    expect(turns.map((t) => windamereClock.seconds(at(t), 1.5))).toEqual([68, 60, 53, 45, 38]);
    expect(turns.map((t) => windamereClock.seconds(at(t), 0.5))).toEqual([23, 20, 18, 15, 13]);
  });

  it('gives the Great Work choice its own 60 s', () => {
    expect(windamereClock.seconds(at(0, 'prompt'), 1)).toBe(60);
    expect(windamereClock.hint(1)).toBe(
      '45 s on a fresh hand, down to 25 s on the last turn of a Season; 60 s for the Great Work choice',
    );
  });
});
