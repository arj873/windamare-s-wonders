/**
 * Levels 2 and 3 for Windamere (docs/BOTS.md §4). Both rate every legal pick with the one-ply
 * evaluator in `windamereEval.ts` (Renown now, economy, Lore runs, Great Work tiers, Guard against
 * the Raid, Honours, trade through the payment plan the engine proposes) and take the best, with a
 * little noise so repeated games differ. Level 3 also looks at the town it passes its hand to:
 * it charges each of its picks for the best use that neighbour would then have of the remaining
 * cards (denial), using that neighbour's public store, coins and tableau.
 * Hidden information is never read: everything comes from the seat's view.
 */
import {
  createLookahead,
  gleanOf,
  passTarget,
  Rng,
  type DraftAction,
  type DraftState,
  type Pick,
  type SeatId,
  type WwCardDef,
  type WwPickArgs,
} from '../engine';
import type { WwSeat, WwTable } from '../engine';
import { windamere, windamereRules } from './windamere';
import { rateGreatWork } from './windamereAdapter';
import { bestUse, townValue, valueOf } from './windamereEval';
import type { Bot } from './types';

const DENIAL_WEIGHT = 0.7;
const NOISE = { 2: 0.6, 3: 0.15 } as const;

export interface SearchOptions {
  /** Picks (best by the one-ply score) that get play-outs. */
  candidates: number;
  /** Determinized states per decision, shared by all candidates. */
  samples: number;
  /** Seats play out with the one-ply picker (true) or the ruleset's default pick (false). */
  smartPolicy: boolean;
  /** Weight of the mean opponent value subtracted from our own. */
  rivalWeight: number;
  /** Weight of the play-out result (per sample, centred) added to the one-ply score. */
  blend: number;
}
export const SEARCH: SearchOptions = {
  candidates: 4,
  samples: 6,
  smartPolicy: true,
  rivalWeight: 0.25,
  blend: 0.5,
};

export function createWindamereBot(
  level: 2 | 3,
  name?: string,
  denialWeight = DENIAL_WEIGHT,
  search: SearchOptions | null = null,
): Bot<WwSeat, WwTable> {
  const rules = windamereRules;
  const la = createLookahead(windamere.ruleset);
  /** The one-ply picker on a full (determinized) state: a cheap stand-in for every seat. */
  const smart = (state: DraftState<WwSeat, WwTable>, s: SeatId): Pick => {
    const hand = state.seats[s]?.hand ?? [];
    let best: Pick | null = null;
    let bv = -Infinity;
    for (const c of hand) {
      const def = rules.card(c.def);
      for (const role of ['spend', 'build'] as const) {
        const v = valueOf(rules, state, s, { def, role, cardId: c.id });
        if (v !== null && v > bv) {
          bv = v;
          best = { card: c.id, use: role };
        }
      }
    }
    return best ?? (windamere.ruleset.defaultPick?.(state, s) as Pick);
  };
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
      const scored: { a: Extract<DraftAction, { type: 'pick' }>; score: number }[] = [];
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
        scored.push({ a, score });
        if (score > bestScore) {
          bestScore = score;
          best = a;
        }
      }
      if (search && scored.length > 1 && view.view.viewer !== null) {
        scored.sort((x, y) => y.score - x.score);
        const top = scored.slice(0, search.candidates);
        const totals = top.map(() => 0);
        const srng = new Rng((rng.int(1 << 30) + 1) >>> 0);
        for (let k = 0; k < search.samples; k++) {
          const base = la.determinize(view, srng);
          top.forEach((c, i) => {
            const st = la.fork(base);
            const first = st.seats.map((_, s) => (s === seat ? c.a.pick : null));
            la.playTurn(st, first);
            la.playOut(st, 'round', search.smartPolicy ? smart : undefined);
            let rivals = 0;
            for (const o of st.seats) if (o.id !== seat) rivals += townValue(rules, st, o.id);
            const mean = st.seats.length > 1 ? rivals / (st.seats.length - 1) : 0;
            totals[i] = (totals[i] ?? 0) + townValue(rules, st, seat) - search.rivalWeight * mean;
          });
        }
        const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
        let bi = 0;
        let bs = -Infinity;
        totals.forEach((t, i) => {
          const sc = (top[i]?.score ?? 0) + (search.blend * (t - avg)) / search.samples;
          if (sc > bs) {
            bs = sc;
            bi = i;
          }
        });
        return top[bi]?.a ?? best ?? rng.pick(picks);
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
