import { describe, expect, it } from 'vitest';
import { createGreedyBot, createRandomBot, runSim } from './index';
import { windamere, windamereRules } from './windamere';
import { windamereAdapter } from './windamereAdapter';
import { observeWindamere } from './windamereMetrics';
import type { WwSeat, WwTable } from '../engine';

describe('bots on the Windamere ruleset', () => {
  for (const seats of [3, 5, 7]) {
    it(`greedy and random play ${seats}-seat games with no violations`, () => {
      const { summary } = runSim(
        {
          engine: windamere,
          bots: [
            createGreedyBot(windamereAdapter(), 'greedy'),
            ...Array.from({ length: seats - 1 }, () => createRandomBot<WwSeat, WwTable>()),
          ],
          seats,
          observe: (s) => observeWindamere(windamereRules, s),
        },
        10,
        1,
      );
      expect(summary.violations).toEqual([]);
      expect(summary.finished).toBe(10);
      expect(summary.actions.mean).toBe(20 * seats);
      expect(summary.metrics.loreRun?.length).toBe(10 * seats);
    });
  }

  it('a specialist never builds outside its kind', () => {
    const { summary } = runSim(
      {
        engine: windamere,
        bots: createGreedyBot(windamereAdapter({ focus: 'hall' }), 'hall'),
        seats: 3,
        observe: (s) => observeWindamere(windamereRules, s),
      },
      5,
      1,
    );
    expect(summary.violations).toEqual([]);
    for (const k of ['holding', 'market', 'watch', 'lore']) {
      expect(summary.metrics[`builtKind.${k}`]?.every((x) => x === 0)).toBe(true);
    }
  });
});
