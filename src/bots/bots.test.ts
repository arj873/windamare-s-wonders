import { describe, expect, it } from 'vitest';
import { toy, toyConfig } from '../engine/core/testing/helpers';
import { Rng } from '../engine';
import { createRandomBot, pickFor, runGame, runSim } from './index';
import type { ToySeat, ToyTable } from '../engine/core/testing/toy';
import type { Bot as GenericBot } from './types';

type Bot = GenericBot<ToySeat, ToyTable>;

describe('random bot', () => {
  it('plays 40 toy games per seat count with no violations', () => {
    for (const seats of [2, 3, 4, 5]) {
      const { summary } = runSim(
        { engine: toy, bots: createRandomBot<ToySeat, ToyTable>(), seats },
        40,
        100,
      );
      expect(summary.violations).toEqual([]);
      expect(summary.finished).toBe(40);
      expect(summary.winRate.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
  });

  it('plays games with opening prompts', () => {
    const r = runGame({
      engine: toy,
      bots: createRandomBot<ToySeat, ToyTable>(),
      seats: 3,
      seed: 5,
      options: { opening: true },
    });
    expect(r.violation).toBeNull();
    expect(r.finished).toBe(true);
  });

  it('is deterministic per seed', () => {
    const run = () =>
      runGame({ engine: toy, bots: createRandomBot<ToySeat, ToyTable>(), seats: 4, seed: 9 });
    expect(run()).toEqual(run());
  });

  it('only ever picks legal actions from a view', () => {
    const state = toy.createGame(toyConfig(3));
    const view = toy.viewFor(state, 1);
    const bot = createRandomBot<ToySeat, ToyTable>();
    const a = bot.act({ engine: toy, view, seat: 1, rng: new Rng(1) });
    expect(a).not.toBeNull();
    expect(toy.applyAction(state, a!).ok).toBe(true);
  });
});

describe('runner', () => {
  it('reports an illegal action as a violation, not a throw', () => {
    const bad: Bot = {
      name: 'bad',
      act: ({ seat }) => ({ type: 'pick', seat, pick: { card: 9999, use: 'build' } }),
    };
    const r = runGame({ engine: toy, bots: bad, seats: 3, seed: 1 });
    expect(r.violation?.kind).toBe('illegal');
  });

  it('reports a bot with no move', () => {
    const none: Bot = { name: 'none', act: () => null };
    expect(runGame({ engine: toy, bots: none, seats: 3, seed: 1 }).violation?.kind).toBe('noMove');
  });

  it('flags a game that exceeds maxActions as a stall', () => {
    const r = runGame({
      engine: toy,
      bots: createRandomBot<ToySeat, ToyTable>(),
      seats: 3,
      seed: 1,
      maxActions: 3,
    });
    expect(r.violation?.kind).toBe('stall');
  });

  it('bots only receive masked views (other hands hidden)', () => {
    let leaked = false;
    const spy: Bot = {
      name: 'spy',
      act(ctx) {
        for (const s of ctx.view.seats) {
          if (s.id !== ctx.seat && s.hand.some((c) => c.id >= 0)) leaked = true;
        }
        return createRandomBot<ToySeat, ToyTable>().act(ctx);
      },
    };
    runGame({ engine: toy, bots: spy, seats: 4, seed: 3 });
    expect(leaked).toBe(false);
  });
});

describe('pickFor', () => {
  it('returns a legal, deterministic action from a view, for every waiting seat', () => {
    const state = toy.createGame(toyConfig(4));
    for (const seat of toy.waitingOn(state)) {
      const view = toy.viewFor(state, seat);
      const a = pickFor(toy, view, seat);
      expect(a).toEqual(pickFor(toy, view, seat));
      expect(a?.type).not.toBe('unpick');
      expect(toy.applyAction(state, a!).ok).toBe(true);
    }
  });

  it('plays a whole game through pickFor alone', () => {
    let s = toy.createGame(toyConfig(3, undefined, 11));
    for (let i = 0; i < 500 && s.phase.kind !== 'gameOver'; i++) {
      const seat = toy.waitingOn(s)[0]!;
      const r = toy.applyAction(s, pickFor(toy, toy.viewFor(s, seat), seat)!);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.phase.kind).toBe('gameOver');
  });

  it('returns null once the game is over', () => {
    let s = toy.createGame(toyConfig(2, undefined, 3));
    while (s.phase.kind !== 'gameOver') {
      const seat = toy.waitingOn(s)[0]!;
      const r = toy.applyAction(s, pickFor(toy, toy.viewFor(s, seat), seat)!);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(pickFor(toy, toy.viewFor(s, 0), 0)).toBeNull();
  });
});
