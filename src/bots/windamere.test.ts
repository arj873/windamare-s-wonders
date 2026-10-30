import { describe, expect, it } from 'vitest';
import { createGreedyBot, createRandomBot, createWindamereBot, pickFor, runSim } from './index';
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

  it('pickFor plays all three levels on the Windamere engine, deterministically and legally', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      let s = windamere.createGame({
        seed: 5,
        seats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      });
      for (let i = 0; i < 400 && s.phase.kind !== 'gameOver'; i++) {
        const seat = windamere.waitingOn(s)[0] as number;
        const view = windamere.viewFor(s, seat);
        const a = pickFor(windamere, view, seat, { level });
        expect(pickFor(windamere, view, seat, { level })).toEqual(a);
        const r = windamere.applyAction(s, a!);
        if (!r.ok) throw new Error(`${level}: ${r.error}`);
        s = r.state;
      }
      expect(s.phase.kind).toBe('gameOver');
    }
  });

  it('level 2 and 3 beat random and level-1 bots at a mixed table', () => {
    const { summary } = runSim(
      {
        engine: windamere,
        bots: [
          createRandomBot<WwSeat, WwTable>(),
          createGreedyBot(windamereAdapter(), 'greedy'),
          createWindamereBot(2),
          createWindamereBot(3),
        ],
        seats: 4,
      },
      40,
      1,
    );
    expect(summary.violations).toEqual([]);
    // Fair share is 0.25 per seat; the smart bots take most wins (measured: ~0.45-0.55 each).
    expect(summary.winByBot.level2).toBeGreaterThan(0.3);
    expect(summary.winByBot.level3).toBeGreaterThan(0.3);
    expect(summary.winByBot.random).toBeLessThan(0.1);
  });
});
