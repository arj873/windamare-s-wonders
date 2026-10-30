import type { CardDef, DraftAction, Json, DraftView, Pick, SeatId } from '../engine';
import { findDef, type Rng } from '../engine';
import type { Bot } from './types';

/** What a ruleset adapter says about one legal pick. */
export interface PickAssessment {
  /** True for a Build that adds to the final score (the bot builds these first). */
  scoringBuild: boolean;
  /** What the pick costs (goods + coins, in one number); lower is cheaper. */
  cost: number;
  /** Worth of the pick otherwise, e.g. a Spend's gain. Higher is better. */
  value: number;
}

/** The only ruleset-specific part of the level-1 bot. */
export interface GreedyAdapter<S, T> {
  /** `def` is the picked card's catalog entry (undefined for a hidden or unknown card). */
  /**
   * Optional: how good an answer to an open prompt is (higher = better), e.g. the Great Work
   * choice. Without it, or when it returns null, the bot answers at random.
   */
  rateAnswer?(view: DraftView<S, T>, seat: SeatId, kind: string, answer: Json): number | null;
  assess(view: DraftView<S, T>, seat: SeatId, pick: Pick, def: CardDef | undefined): PickAssessment;
}

/**
 * Level 1 heuristic: the cheapest legal Build that scores; otherwise the best Spend (highest
 * `value`). Ties break at random. Prompts are answered at random. Never `unpick`s.
 */
export function createGreedyBot<S, T>(adapter: GreedyAdapter<S, T>, name = 'greedy'): Bot<S, T> {
  return {
    name,
    act({ engine, view, seat, rng }) {
      const moves = engine.legalActions(view, seat).filter((a) => a.type !== 'unpick');
      if (moves.length === 0) return null;
      const scored: { action: DraftAction; a: PickAssessment }[] = [];
      for (const action of moves) {
        if (action.type !== 'pick') continue;
        const card = view.seats[seat]?.hand.find((c) => c.id === action.pick.card);
        const def = card ? findDef(engine.ruleset, card.def) : undefined;
        scored.push({ action, a: adapter.assess(view, seat, action.pick, def) });
      }
      if (scored.length === 0) return answerPrompt(adapter, view, seat, moves, rng);
      const builds = scored.filter((x) => x.a.scoringBuild);
      const pool = builds.length > 0 ? builds : scored;
      const key = (x: { a: PickAssessment }) => (builds.length > 0 ? -x.a.cost : x.a.value);
      const best = Math.max(...pool.map(key));
      return rng.pick(pool.filter((x) => key(x) === best)).action;
    },
  };
}

/** A prompt: the best-rated answer if the adapter can rate them, else a random one. */
function answerPrompt<S, T>(
  adapter: GreedyAdapter<S, T>,
  view: DraftView<S, T>,
  seat: SeatId,
  moves: DraftAction[],
  rng: Rng,
): DraftAction {
  const rated: { action: DraftAction; score: number }[] = [];
  for (const action of moves) {
    if (action.type !== 'answer') continue;
    const kind = view.prompts.find((p) => p.id === action.prompt)?.kind;
    const score = kind === undefined ? null : adapter.rateAnswer?.(view, seat, kind, action.answer);
    if (score != null) rated.push({ action, score });
  }
  if (rated.length === 0) return rng.pick(moves);
  const best = Math.max(...rated.map((r) => r.score));
  return rng.pick(rated.filter((r) => r.score === best)).action;
}
