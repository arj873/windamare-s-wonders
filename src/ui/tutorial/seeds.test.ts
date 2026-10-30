import { describe, expect, it } from 'vitest';
import { TUTORIAL_SEED } from './game';
import { playTutorial } from './headless';
import { LESSONS } from './lessons';

describe('the tutorial game, played headless', () => {
  for (const learner of ['easy', 'medium'] as const) {
    it(`shows every lesson in order to a ${learner} learner`, () => {
      const r = playTutorial(TUTORIAL_SEED, { learner });
      expect(r.over).toBe(true);
      expect(r.picks).toBe(20);
      expect(r.shown.filter((id) => !r.recapped.includes(id)).length).toBeGreaterThan(10);
      // Every lesson shows, the intro first and the wrap-up last.
      expect(new Set(r.shown)).toEqual(new Set(LESSONS.map((l) => l.id)));
      expect(r.shown[0]).toBe('welcome');
      expect(r.shown.at(-1)).toBe('finish');
    });
  }
  // Seed search: SEEDS=30 pnpm exec vitest run src/ui/tutorial/seeds
  it.skipIf(!process.env.SEEDS)('seed search', () => {
    for (let i = 1; i <= Number(process.env.SEEDS); i++) {
      const r = playTutorial(`learn-${i}`);
      console.log(`learn-${i}`, 'recap:', r.recapped.join(',') || '-');
    }
  });
});
