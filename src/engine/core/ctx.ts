/** The `Ctx` ruleset code gets over applyAction's draft (docs/ENGINE.md §8). */
import { defOf } from './effects';
import { cardLists, locate } from './invariants';
import type { Rng } from './rng';
import { isSeat, leftOf, neighboursOf, rightOf } from './seats';
import type { Card, Ctx, DraftState, EffectSpec, LogEntry, Ruleset, SeatId } from './types';

export function makeCtx<S, T>(rules: Ruleset<S, T>, draft: DraftState<S, T>, rng: Rng): Ctx<S, T> {
  const seatOf = (seat: SeatId) => {
    const s = isSeat(draft, seat) ? draft.seats[seat] : undefined;
    if (!s) throw new Error(`no seat ${seat}`);
    return s;
  };
  /** Cards enter a list only from limbo: a card already somewhere must be `take`n first. */
  const loose = (card: Card) => {
    const where = locate(draft as DraftState<unknown, unknown>, card.id);
    if (where !== null) throw new Error(`card ${card.id} is already in ${where}`);
    return card;
  };
  const trigger = (seat: SeatId, specs: readonly EffectSpec[], source: Card | null) => {
    for (const spec of specs) {
      const handler = rules.effects[spec.type];
      if (!handler) throw new Error(`unknown effect type: ${spec.type}`);
      handler.onPlay?.(ctx, seat, spec, source);
    }
  };

  const ctx: Ctx<S, T> = {
    state: draft,
    rules,
    rng,
    def: (card) => defOf(rules, typeof card === 'string' ? card : card.def),
    play(seat, card) {
      seatOf(seat).tableau.push(loose(card));
      trigger(seat, defOf(rules, card.def).effects, card);
    },
    place(seat, zone, card) {
      const cards = seatOf(seat).zones[zone];
      if (!cards) throw new Error(`no zone ${zone}`);
      cards.push(loose(card));
    },
    toDiscard(card) {
      draft.discard.push(loose(card));
    },
    toBox(card) {
      draft.box.push(loose(card));
    },
    take(id) {
      for (const [, cards] of cardLists(draft as DraftState<unknown, unknown>)) {
        const i = cards.findIndex((c) => c.id === id);
        if (i >= 0) return cards.splice(i, 1)[0] as Card;
      }
      throw new Error(`card ${id} is nowhere`);
    },
    trigger,
    prompt(seat, kind, data) {
      seatOf(seat);
      if (!rules.prompts[kind]) throw new Error(`unknown prompt kind: ${kind}`);
      draft.prompts.push({ id: draft.nextPromptId++, seat, kind, data });
    },
    log(seat, kind, text, opts = {}) {
      const entry: LogEntry = {
        seq: draft.seq,
        round: draft.round,
        turn: draft.turn,
        seat,
        kind,
        text,
      };
      if (opts.data !== undefined) entry.data = opts.data;
      if (opts.to !== undefined) entry.to = [...opts.to];
      draft.log.push(entry);
    },
    left: (seat) => leftOf(draft, seat),
    right: (seat) => rightOf(draft, seat),
    neighbours: (seat) => neighboursOf(draft, seat),
  };
  return ctx;
}
