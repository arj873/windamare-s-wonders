import { describe, expect, it } from 'vitest';
import { createGreedyBot, createRandomBot, runSim } from './index';
import { windamere, windamereRules } from './windamere';
import { windamereAdapter } from './windamereAdapter';
import { observeWindamere, SOURCES, sourcesOf } from './windamereMetrics';
import { scoreTown } from '../engine';
import type { WwSeat, WwTable } from '../engine';

describe('bots on the Windamere ruleset', () => {
  for (const seats of [2, 3, 5, 7]) {
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
      // 20 turns each, plus one Great Work choice per seat (R2.5).
      expect(summary.actions.mean).toBe(21 * seats);
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

  it('the 8 score sources add up to each town total, and the Great Work choice is rule-based', () => {
    const bot = createGreedyBot(windamereAdapter(), 'greedy');
    let checked = 0;
    runSim(
      {
        engine: windamere,
        bots: bot,
        seats: 4,
        observe: (state) => {
          for (const seat of state.seats) {
            const sources = sourcesOf(windamereRules, state, seat.id);
            const sheet = scoreTown(windamereRules, state, seat.id);
            const total = Object.values(sheet).reduce((a, b) => a + b, 0);
            expect(SOURCES.reduce((a, c) => a + sources[c], 0)).toBe(total);
            expect(seat.data.greatWork).not.toBeNull();
            checked++;
          }
          return {};
        },
      },
      8,
      1,
    );
    expect(checked).toBe(32);
  });
});
