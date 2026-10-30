/** Greedy adapter for the toy ruleset (test fixture ruleset; real adapter comes with E2). */
import type { ToySeat, ToyTable } from '../engine/core/testing/toy';
import type { GreedyAdapter } from './greedy';

// The toy's score is coins/3 + stash count + `points` + `perNeighbourKind`; coin builds do not score.
const SCORING = new Set(['points', 'perNeighbourKind']);

export const toyAdapter: GreedyAdapter<ToySeat, ToyTable> = {
  assess(_view, _seat, pick, def) {
    if (pick.use === 'build') {
      const cost = typeof def?.cost === 'number' ? def.cost : 0;
      const scores = (def?.effects ?? []).some((e) => SCORING.has(e.type));
      return { scoringBuild: scores, cost, value: 0 };
    }
    return { scoringBuild: false, cost: 0, value: pick.use === 'stash' ? 1 : 2 / 3 };
  },
};
