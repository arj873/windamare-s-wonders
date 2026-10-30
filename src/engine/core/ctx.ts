/** The `Ctx` ruleset code gets over applyAction's draft (docs/ENGINE.md §8). */
import { defOf } from './effects';
import { cardLists, locate } from './invariants';
import { joinParts } from './log';
import type { Rng } from './rng';
import { isSeat, leftOf, neighboursOf, rightOf } from './seats';
import type { Card, Ctx, DraftState, EffectSpec, Json, LogEntry, Ruleset, SeatId } from './types';

/** `quiet` (lookahead, docs/ENGINE.md §16): no log entries and no card-move checks. */
export function makeCtx<S, T>(
  rules: Ruleset<S, T>,
  draft: DraftState<S, T>,
  rng: Rng,
  quiet = false,
): Ctx<S, T> {
  const seatOf = (seat: SeatId) => {
    const s = isSeat(draft, seat) ? draft.seats[seat] : undefined;
    if (!s) throw new Error(`no seat ${seat}`);
    return s;
  };
  const namedYou = (seat: SeatId) => draft.seats[seat]?.name.trim().toLowerCase() === 'you';
  /** Cards enter a list only from limbo: a card already somewhere must be `take`n first. */
  const loose = (card: Card) => {
    if (quiet) return card;
    const where = locate(draft as DraftState<unknown, unknown>, card.id);
    if (where !== null) throw new Error(`card ${card.id} is already in ${where}`);
    return card;
  };
  const trigger = (
    seat: SeatId,
    specs: readonly EffectSpec[],
    source: Card | null,
    args?: Json,
  ) => {
    for (const spec of specs) {
      const handler = rules.effects[spec.type];
      if (!handler) throw new Error(`unknown effect type: ${spec.type}`);
      handler.onPlay?.(ctx, seat, spec, source, args);
    }
  };

  const ctx: Ctx<S, T> = {
    state: draft,
    rules,
    rng,
    quiet,
    def: (card) => defOf(rules, typeof card === 'string' ? card : card.def),
    play(seat, card, args) {
      seatOf(seat).tableau.push(loose(card));
      trigger(seat, defOf(rules, card.def).effects, card, args);
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
      ctx.promptGroup([{ seat, kind, data }]);
    },
    promptGroup(entries) {
      if (entries.length === 0) return;
      const seats = new Set<SeatId>();
      for (const e of entries) {
        seatOf(e.seat);
        if (!rules.prompts[e.kind]) throw new Error(`unknown prompt kind: ${e.kind}`);
        if (seats.has(e.seat)) throw new Error(`two prompts for seat ${e.seat} in one group`);
        seats.add(e.seat);
      }
      const group = draft.nextPromptId;
      for (const e of entries) {
        draft.prompts.push({
          id: draft.nextPromptId++,
          seat: e.seat,
          kind: e.kind,
          data: e.data,
          group,
          answered: false,
          answer: null,
        });
      }
    },
    log(seat, kind, text, opts = {}) {
      if (quiet) return;
      // E9: a seat named "You" (the tutorial's) reads its second person for everyone.
      const pieces =
        typeof text === 'string'
          ? null
          : text.map((p) =>
              typeof p === 'string' ? p : { ...p, text: namedYou(p.seat) ? p.you : p.text },
            );
      const entry: LogEntry = {
        seq: draft.seq,
        round: draft.round,
        turn: draft.turn,
        seat,
        kind,
        text: pieces ? joinParts(pieces) : (text as string),
      };
      if (opts.data !== undefined) entry.data = opts.data;
      if (opts.to !== undefined) entry.to = [...opts.to];
      if (opts.targets?.length) entry.targets = [...opts.targets];
      if (pieces?.some((p) => typeof p !== 'string')) entry.parts = pieces;
      draft.log.push(entry);
    },
    left: (seat) => leftOf(draft, seat),
    right: (seat) => rightOf(draft, seat),
    neighbours: (seat) => neighboursOf(draft, seat),
  };
  return ctx;
}
