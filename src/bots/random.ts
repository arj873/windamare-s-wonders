import type { DraftAction } from '../engine';
import type { Bot } from './types';

/**
 * Uniform over the seat's legal `pick` / `answer` actions. It never `unpick`s (that would only
 * stall a simulation), so every decision moves the game forward.
 */
export function createRandomBot<S, T>(): Bot<S, T> {
  return {
    name: 'random',
    act({ engine, view, seat, rng }) {
      const moves: DraftAction[] = engine
        .legalActions(view, seat)
        .filter((a) => a.type !== 'unpick');
      return moves.length === 0 ? null : rng.pick(moves);
    },
  };
}
