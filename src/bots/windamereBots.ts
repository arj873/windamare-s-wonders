/**
 * Levels 2 and 3 for Windamere (docs/BOTS.md §4). Both rate every legal pick with the one-ply
 * evaluator in `windamereEval.ts` (Renown now, economy, Lore runs, Great Work tiers, Guard against
 * the Raid, Honours, trade through the payment plan the engine proposes) and take the best, with a
 * little noise so repeated games differ. Level 3 also looks at the town it passes its hand to:
 * it charges each of its picks for the best use that neighbour would then have of the remaining
 * cards (denial), using that neighbour's public store, coins and tableau.
 * Hidden information is never read: everything comes from the seat's view.
 */
import { gleanOf, passTarget, type DraftAction, type WwCardDef, type WwPickArgs } from '../engine';
import type { WwSeat, WwTable } from '../engine';
import { windamereRules } from './windamere';
import { rateGreatWork } from './windamereAdapter';
import { bestUse, valueOf } from './windamereEval';
import type { Bot } from './types';

const DENIAL_WEIGHT = 0.7;
const NOISE = { 2: 0.6, 3: 0.15 } as const;

export function createWindamereBot(
  level: 2 | 3,
  name?: string,
  denialWeight = DENIAL_WEIGHT,
): Bot<WwSeat, WwTable> {
  const rules = windamereRules;
  return {
    name: name ?? `level${level}`,
    act({ engine, view, seat, rng }) {
      const moves = engine.legalActions(view, seat).filter((a) => a.type !== 'unpick');
      if (moves.length === 0) return null;
      const picks = moves.filter(
        (a): a is Extract<DraftAction, { type: 'pick' }> => a.type === 'pick',
      );
      if (picks.length === 0) return answer(moves, view, rng);

      const hand = view.seats[seat]?.hand ?? [];
      const defOf = (id: number): WwCardDef | undefined => {
        const c = hand.find((x) => x.id === id);
        return c ? rules.card(c.def) : undefined;
      };

      // Level 3 denial: what the next town could do with each other card of this hand.
      let neighbourValue: Map<number, number> | null = null;
      if (level === 3 && view.turn < view.roundPicks - 1 && view.seats.length > 1) {
        const to = passTarget(view, seat);
        neighbourValue = new Map();
        for (const c of hand) neighbourValue.set(c.id, bestUse(rules, view, to, rules.card(c.def)));
      }

      let best: DraftAction | null = null;
      let bestScore = -Infinity;
      for (const a of picks) {
        const def = defOf(a.pick.card);
        if (!def) continue;
        const glean = gleanOf(view, seat, a.pick.card);
        const v = valueOf(rules, view, seat, {
          def,
          role: a.pick.use === 'build' ? 'build' : 'spend',
          cover: (a.pick.args as WwPickArgs | undefined)?.cover ?? null,
          cardId: a.pick.card,
          args: a.pick.args as WwPickArgs | undefined,
          glean: glean ? rules.card(glean.def) : null,
        });
        if (v === null) continue;
        let score = v;
        if (neighbourValue) {
          let leftBehind = 0;
          for (const [id, nv] of neighbourValue)
            if (id !== a.pick.card) leftBehind = Math.max(leftBehind, nv);
          score -= denialWeight * leftBehind;
        }
        score += (rng.float() - 0.5) * 2 * NOISE[level];
        if (score > bestScore) {
          bestScore = score;
          best = a;
        }
      }
      return best ?? rng.pick(picks);
    },
  };
}

/** A prompt (the Great Work choice): the offer the rating rule likes best, ties at random. */
function answer(
  moves: DraftAction[],
  view: { prompts: { id: number; kind: string }[] },
  rng: { pick<T>(xs: readonly T[]): T },
): DraftAction {
  const rated = moves.flatMap((a) => {
    if (a.type !== 'answer') return [];
    const kind = view.prompts.find((p) => p.id === a.prompt)?.kind;
    return kind === 'greatWork' && typeof a.answer === 'string'
      ? [{ a, score: rateGreatWork(windamereRules.content, a.answer) }]
      : [];
  });
  if (rated.length === 0) return rng.pick(moves);
  const top = Math.max(...rated.map((r) => r.score));
  return rng.pick(rated.filter((r) => r.score === top)).a;
}
