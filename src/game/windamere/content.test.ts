import { describe, expect, it } from 'vitest';
import { windamere } from './content';

describe('windamere()', () => {
  it('compiles design content and plays a 4-town game to the end on defaults', () => {
    const { engine } = windamere();
    let s = engine.createGame({
      seed: 'u3',
      seats: ['A', 'B', 'C', 'D'].map((name) => ({ name })),
    });
    for (let i = 0; i < 500 && s.phase.kind !== 'gameOver'; i++) {
      for (const seat of engine.waitingOn(s)) {
        const a = engine.defaultAction(s, seat);
        if (!a) continue;
        const r = engine.applyAction(s, a);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
    }
    expect(s.phase.kind).toBe('gameOver');
    expect(s.result?.scores).toHaveLength(4);
  });
});
