import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toy, toyConfig } from '../engine/core/testing/helpers';
import type { ToySeat, ToyTable } from '../engine/core/testing/toy';
import { decisionKey, LocalGame, type LocalGameOptions } from './local';

type Opts = LocalGameOptions<ToySeat, ToyTable>;

function game(over: Partial<Opts> = {}) {
  const onChange = vi.fn();
  const g = new LocalGame<ToySeat, ToyTable>({
    engine: toy,
    config: toyConfig(3),
    bots: [1, 2],
    pickTimerSec: null,
    botDelayMs: () => 100,
    onChange,
    ...over,
  });
  g.start();
  return { g, onChange };
}

/** The viewer picks its first legal option. */
function humanPicks(g: LocalGame<ToySeat, ToyTable>) {
  const seat = g.viewer!;
  const pick = toy.legalPicks(g.view(), seat)[0]!;
  expect(g.act({ type: 'pick', seat, pick })).toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LocalGame', () => {
  it('lets bots answer after their delay and plays to the end', () => {
    const { g, onChange } = game();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(g.viewer).toBe(0);
    humanPicks(g);
    expect(g.state.turn).toBe(0);
    vi.advanceTimersByTime(100);
    expect(g.state.turn).toBe(1); // both bots picked: revealed and passed

    for (let i = 0; i < 100 && !g.over; i++) {
      const seat = g.viewer!;
      if (toy.waitingOn(g.state).includes(seat)) {
        const a = toy.legalActions(g.view(), seat).find((x) => x.type !== 'unpick')!;
        expect(g.act(a)).toBeNull();
      }
      vi.advanceTimersByTime(100);
    }
    expect(g.over).toBe(true);
    expect(g.state.result?.winners.length).toBeGreaterThan(0);
  });

  it('refuses actions for bot seats', () => {
    const { g } = game();
    const card = g.state.seats[1]!.hand[0]!;
    expect(g.act({ type: 'pick', seat: 1, pick: { card: card.id, use: 'sell' } })).toMatch(/bot/);
  });

  it('plays the engine default for a human whose clock runs out', () => {
    const onTimeout = vi.fn();
    const { g } = game({ pickTimerSec: 30, botDelayMs: () => 50, onTimeout });
    expect(g.clock()).toEqual({ remainingMs: 30_000, totalMs: 30_000 });
    vi.advanceTimersByTime(10_000);
    expect(g.clock()?.remainingMs).toBe(20_000);
    expect(g.state.turn).toBe(0);
    vi.advanceTimersByTime(20_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout.mock.calls[0]![1]).toMatchObject({ type: 'pick', seat: 0 });
    expect(g.state.turn).toBe(1);
    expect(g.clock()).toEqual({ remainingMs: 30_000, totalMs: 30_000 }); // a fresh clock
  });

  it('runs no clock without a timer', () => {
    const { g } = game();
    expect(g.clock()).toBeNull();
  });

  it('hands the screen to the next human who still has to pick (hotseat)', () => {
    const { g } = game({ bots: [2] });
    expect(g.humans).toEqual([0, 1]);
    expect(g.viewer).toBe(0);
    humanPicks(g);
    expect(g.viewer).toBe(1);
    humanPicks(g);
    vi.advanceTimersByTime(100);
    expect(g.state.turn).toBe(1);
    expect(g.viewer).toBe(1); // still waiting this turn: no switch until they pick
  });

  it('stops bots and the clock on dispose', () => {
    const { g, onChange } = game({ pickTimerSec: 30 });
    humanPicks(g);
    const calls = onChange.mock.calls.length;
    g.dispose();
    vi.advanceTimersByTime(60_000);
    expect(onChange.mock.calls.length).toBe(calls);
    expect(g.state.turn).toBe(0);
  });

  it('keys decisions by pick turn and open prompt', () => {
    const s = toy.createGame(toyConfig(3, { opening: true }));
    expect(decisionKey(s)).toBe(`prompt:${s.prompts[0]!.id}`);
    expect(decisionKey(toy.createGame(toyConfig(3)))).toBe('pick:0:0');
  });
});
