/**
 * RULES.md R15.3, the turn clock: Normal lengths by turn of the Season and for the Great Work
 * choice come from design's tunables (src/content); Relaxed / Fast scale them, rounded up
 * (Relaxed 68, 60, 53, 45, 38 s; Fast 23, 20, 18, 15, 13 s).
 */
import { TUNABLES } from '../../content/windamere';
import type { WwState } from '../../engine';

const TURNS: readonly number[] = TUNABLES.clockSec.turns;
const CHOICE = TUNABLES.clockSec.greatWorkChoice;

export const windamereClock = {
  /** Seconds for the decision the state waits on: a turn's pick, or the Great Work choice. */
  seconds(state: WwState, scale: number): number {
    const base =
      state.phase.kind === 'prompt' ? CHOICE : (TURNS[state.turn] ?? TURNS[TURNS.length - 1] ?? 30);
    return Math.ceil(base * scale);
  },
  hint(scale: number): string {
    const first = Math.ceil((TURNS[0] ?? 45) * scale);
    const last = Math.ceil((TURNS[TURNS.length - 1] ?? 25) * scale);
    return `${first} s on a fresh hand, down to ${last} s on the last turn of a Season; ${Math.ceil(CHOICE * scale)} s for the Great Work choice`;
  },
};
