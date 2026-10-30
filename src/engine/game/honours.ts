/** R11 Honours. Measures are public (R1.11), so these work on views too (R11.3). */
import type { SeatId } from '../core';
import type { WwRules } from './content';
import { measure } from './town';
import type { WwState } from './types';

export interface HonourStanding {
  honour: string;
  /** The highest measure among all towns. */
  best: number;
  /** Towns at `best`; empty when `best` is 0 (R11.2: a measure of 0 never wins). */
  leaders: SeatId[];
}

/** R11.3: the leaders of each revealed Honour, as things stand. */
export function honourStandings(rules: WwRules, state: WwState): HonourStanding[] {
  return state.table.honours.map((id) => {
    const m = rules.honour(id).measure;
    const values = state.seats.map((s) => measure(rules, state, s.id, m));
    const best = Math.max(0, ...values);
    const leaders =
      best > 0 ? state.seats.filter((s) => values[s.id] === best).map((s) => s.id) : [];
    return { honour: id, best, leaders };
  });
}

/** R11.2: Renown from Honours at game end (sole leader 5, each tied leader 2). */
export function honourScore(rules: WwRules, state: WwState, seat: SeatId): number {
  const t = rules.tunables;
  return honourStandings(rules, state).reduce((sum, h) => {
    if (!h.leaders.includes(seat)) return sum;
    return sum + (h.leaders.length === 1 ? t.honourSole : t.honourTied);
  }, 0);
}
