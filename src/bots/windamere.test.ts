import { describe, expect, it } from 'vitest';
import { createGreedyBot, createRandomBot, createWindamereBot, pickFor, runSim } from './index';
import { SEARCH } from './windamereBots';
import { valueOf } from './windamereEval';
import { PENDING_CARDS } from '../content/windamere';
import { windamere, windamereRules } from './windamere';
import { rateGreatWork, windamereAdapter } from './windamereAdapter';
import { observeWindamere, SOURCES, sourcesOf } from './windamereMetrics';
import { compileContent, scoreTown } from '../engine';
import { windamereContent } from '../engine';
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

  it('the Great Work choice values Valour-scaled tiers (Wolf Gate is not rated at printed Renown only)', () => {
    const content = windamereContent();
    const wolf = content.greatWorks.find((g) => g.id === 'the-wolf-gate');
    expect(wolf).toBeDefined();
    const printed = (wolf?.tiers ?? []).reduce(
      (a, t) =>
        a + t.reward.reduce((b, e) => b + (e.type === 'renown' ? (e.amount as number) : 0), 0),
      0,
    );
    expect(rateGreatWork(content, 'the-wolf-gate')).toBeGreaterThan(printed + 4);
  });

  it('the opt-in play-out search plays a whole game legally', () => {
    const bot = createWindamereBot(3, 'search', 0.7, { ...SEARCH, samples: 2, candidates: 2 });
    const { summary } = runSim({ engine: windamere, bots: bot, seats: 3 }, 1, 5);
    expect(summary.violations).toEqual([]);
    expect(summary.finished).toBe(1);
  });

  it('the evaluator prices the D10b types: weaker-neighbour gains and future sales', () => {
    let state = windamere.createGame({
      seed: 3,
      seats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    });
    while (state.phase.kind !== 'pick') {
      const w = windamere.waitingOn(state)[0] as number;
      const act = windamere.legalActions(windamere.viewFor(state, w), w)[0];
      const r = windamere.applyAction(state, act as never);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const withHoldings = (n: number) =>
      ({
        ...state,
        seats: state.seats.map((s) =>
          s.id === 0
            ? { ...s, data: { ...s.data, store: { ...s.data.store, salt: 1, wax: 1 } } }
            : {
                ...s,
                tableau: Array.from({ length: n }, (_, k) => ({
                  id: 900 + s.id * 10 + k,
                  def: 'reed-shallows',
                })),
              },
        ),
      }) as typeof state;
    const content = windamereContent();
    const rules = compileContent({ ...content, cards: [...content.cards, ...PENDING_CARDS] });
    const fair = PENDING_CARDS.find((c) => c.id === 'wend-fair');
    const arcade = PENDING_CARDS.find((c) => c.id === 'brokers-arcade');
    if (!fair || !arcade) throw new Error('pending cards moved');
    const v = (n: number) => valueOf(rules, withHoldings(n), 0, { def: fair, role: 'build' });
    // One more Holding at the weaker neighbour: 2 coins more (n=0 differs by Honours standing).
    expect((v(2) ?? 0) - (v(1) ?? 0)).toBeCloseTo(2 * 0.28, 5);
    // A Landmark that scores sales is worth more than its goods cost alone, before any sale.
    const base = withHoldings(0);
    const rich = {
      ...base,
      seats: base.seats.map((s) =>
        s.id === 0
          ? { ...s, data: { ...s.data, store: { reed: 1, peat: 0, salt: 1, wax: 1, horn: 0 } } }
          : s,
      ),
    } as typeof state;
    const plain = { ...arcade, effects: [] };
    expect(valueOf(rules, rich, 0, { def: arcade, role: 'build' }) ?? 0).toBeGreaterThan(
      valueOf(rules, rich, 0, { def: plain, role: 'build' }) ?? 0,
    );
  });
});
