/**
 * Lookahead for bots (docs/ENGINE.md §16): sample a full state from one seat's view
 * (`determinize`), copy it cheaply (`fork`), and play turns on the copy in place (`playTurn`,
 * `playOut`). Built for speed, not for real games: picks are trusted, nothing is validated, the
 * log is not written and invariants are not checked. Never pass a lookahead state to
 * `applyAction` or to a client.
 */
import { cloneJson } from './clone';
import { makeCtx } from './ctx';
import { defaultAnswer, openGroup, reveal, settleGroup } from './flow';
import { Rng } from './rng';
import { passTarget } from './seats';
import type {
  Card,
  CardDefId,
  Ctx,
  DraftState,
  DraftView,
  Pick,
  Ruleset,
  SeatId,
  SeatState,
} from './types';
import { isDraftView } from './view';

/** Chooses a seat's pick in a lookahead state (a full, determinized state). */
export type Policy<S, T> = (state: DraftState<S, T>, seat: SeatId) => Pick;

/** How far `playOut` plays: one turn, to the end of this round, or to the end of the game. */
export type Until = 'turn' | 'round' | 'game';

export interface Lookahead<S, T> {
  /**
   * A full state the seat's view allows, with every hidden card and secret sampled with `rng`.
   * Hands the seat passed on (`recall`) are followed through the revealed picks, so those are
   * exact; the other hands are dealt from the cards of this round the seat cannot place. Only
   * in the pick phase. Sampled cards get fresh ids; nobody has picked yet.
   */
  determinize(view: DraftView<S, T>, rng: Rng): DraftState<S, T>;
  /** A private copy to play on: arrays and ruleset data are copied, cards are shared. */
  fork(state: DraftState<S, T>): DraftState<S, T>;
  /**
   * Resolve one turn in place: every seat that holds cards plays `picks[seat]` (null: the
   * ruleset's default pick). A pick with `args` is used as given; one without gets the
   * ruleset's defaults (`normalizePick`). Prompts the turn raises get their default answers.
   * Returns `state`.
   */
  playTurn(state: DraftState<S, T>, picks: readonly (Pick | null)[]): DraftState<S, T>;
  /** Play turns in place with `policy` (default: the ruleset's default pick) until `until`. */
  playOut(state: DraftState<S, T>, until: Until, policy?: Policy<S, T>): DraftState<S, T>;
}

export function createLookahead<S, T>(rules: Ruleset<S, T>): Lookahead<S, T> {
  const fallback: Policy<S, T> = (state, seat) => {
    const pick = rules.defaultPick?.(state, seat) ?? rules.legalPicks(state, seat)[0];
    if (!pick) throw new Error(`lookahead: seat ${seat} has no pick`);
    return pick;
  };

  function fork(state: DraftState<S, T>): DraftState<S, T> {
    if (isDraftView(state)) throw new Error('fork: got a view; determinize it first');
    return copy(state);
  }

  function copy(state: DraftState<S, T>): DraftState<S, T> {
    return {
      ...state,
      seats: state.seats.map(copySeat),
      deck: state.deck.slice(),
      discard: state.discard.slice(),
      box: state.box.slice(),
      table: cloneJson(state.table),
      prompts: state.prompts.map((p) => ({ ...p })),
      log: [],
      rng: [...state.rng],
    };
  }

  function determinize(view: DraftView<S, T>, rng: Rng): DraftState<S, T> {
    if (!isDraftView(view)) throw new Error('determinize: needs a seat view (viewFor)');
    const me = view.view.viewer;
    if (me === null) throw new Error('determinize: a spectator view has no seat');
    if (view.phase.kind !== 'pick') {
      throw new Error(`determinize: only in the pick phase, not ${view.phase.kind}`);
    }
    const { view: info, ...rest } = view;
    const state = copy(rest);
    const mine = state.seats[me];
    if (!mine) throw new Error(`determinize: no seat ${me}`);

    // The faces of this round's deck, less every card the seat can place.
    const pool = new Map<CardDefId, number>();
    const faces = rules.roundSpec(state, state.round).deck;
    for (const def of faces) pool.set(def, (pool.get(def) ?? 0) + 1);
    const place = (def: CardDefId) => {
      const n = pool.get(def) ?? 0;
      if (n === 0) throw new Error(`determinize: card ${def} is not left in the round's deck`);
      pool.set(def, n - 1);
    };
    for (const c of mine.hand) place(c.def);
    const picked = revealedPicks(view);
    for (const turn of picked.values()) for (const def of turn.values()) place(def);

    // Hands the seat passed on, followed through the picks since (the newest pass wins). The log
    // names only faces: of two copies, the one now in sight elsewhere is the one picked.
    const seen = new Set<number>();
    for (const s of state.seats) {
      for (const c of s.tableau) seen.add(c.id);
      for (const cards of Object.values(s.zones)) for (const c of cards) seen.add(c.id);
    }
    for (const c of mine.hand) seen.add(c.id);
    const known = new Map<SeatId, Card[]>();
    for (const entry of mine.recall) {
      const cards = entry.cards.slice();
      let holder = entry.to;
      let ok = true;
      for (let turn = entry.turn + 1; turn < state.turn && ok; turn++) {
        const def = picked.get(turn)?.get(holder);
        const i = cards.findIndex((c) => c.def === def && seen.has(c.id));
        const j = i >= 0 ? i : cards.findIndex((c) => c.def === def);
        if (j < 0) ok = false;
        else cards.splice(j, 1);
        holder = passTarget(state, holder);
      }
      // A hidden removal on the way (a burn) shows as a size mismatch: sample that hand instead.
      if (ok && holder !== me && cards.length === info.handCounts[holder]) known.set(holder, cards);
    }
    for (const [seat, cards] of known) {
      const unique = cards.map((c) => {
        place(c.def);
        // A safety net: an id already in sight gets a fresh one, so ids stay unique.
        if (seen.has(c.id)) return { id: state.nextCardId++, def: c.def };
        seen.add(c.id);
        return c;
      });
      known.set(seat, unique);
    }

    // Deal the hands nobody can know from what is left, in deck order then shuffled.
    const left: CardDefId[] = [];
    for (const def of new Set(faces)) {
      for (let n = pool.get(def) ?? 0; n > 0; n--) left.push(def);
    }
    const deal = rng.shuffle(left);
    let next = 0;
    for (const s of state.seats) {
      s.pick = null;
      if (s.id === me) continue;
      s.recall = [];
      const count = info.handCounts[s.id] ?? 0;
      const hand = known.get(s.id);
      if (hand) {
        s.hand = hand;
        continue;
      }
      if (next + count > deal.length) {
        throw new Error(`determinize: ${deal.length} unplaced cards, seat ${s.id} holds ${count}`);
      }
      s.hand = deal.slice(next, next + count).map((def) => ({ id: state.nextCardId++, def }));
      next += count;
    }

    // Placeholders (ids < 0) stand for cards in hidden places: drop them.
    const real = (cards: Card[]) => cards.filter((c) => c.id >= 0);
    for (const s of state.seats) {
      for (const zone of Object.keys(s.zones)) s.zones[zone] = real(s.zones[zone] ?? []);
    }
    state.deck = real(state.deck);
    state.discard = real(state.discard);
    state.box = real(state.box);
    rules.sampleHidden?.(state, rng);
    state.rng = [rng.nextU32(), rng.nextU32(), rng.nextU32(), rng.nextU32()];
    return state;
  }

  function playTurn(state: DraftState<S, T>, picks: readonly (Pick | null)[]): DraftState<S, T> {
    if (isDraftView(state)) throw new Error('playTurn: got a view; determinize it first');
    if (state.phase.kind !== 'pick') {
      throw new Error(`playTurn: not the pick phase (${state.phase.kind})`);
    }
    for (const s of state.seats) {
      if (s.hand.length === 0) {
        s.pick = null;
        continue;
      }
      const pick = picks[s.id] ?? fallback(state, s.id);
      s.pick =
        pick.args === undefined && rules.normalizePick
          ? rules.normalizePick(state, s.id, pick)
          : pick;
    }
    const rng = new Rng(state.rng);
    const ctx = makeCtx(rules, state, rng, true);
    reveal(ctx);
    settlePrompts(ctx);
    state.rng = rng.state;
    return state;
  }

  /** Answer every prompt with its default answer until the flow leaves the prompt phase. */
  function settlePrompts(ctx: Ctx<S, T>): void {
    const state = ctx.state;
    while (state.phase.kind === 'prompt') {
      const then = state.phase.then;
      const open = openGroup(state as DraftState<unknown, unknown>);
      for (const p of open) {
        const answer = defaultAnswer(rules, state, p);
        if (answer === undefined) throw new Error(`lookahead: prompt ${p.kind} has no answer`);
        p.answer = answer;
        p.answered = true;
      }
      settleGroup(ctx, open, then);
    }
  }

  function playOut(
    state: DraftState<S, T>,
    until: Until,
    policy: Policy<S, T> = fallback,
  ): DraftState<S, T> {
    const round = state.round;
    let turns = 0;
    while (state.phase.kind === 'pick') {
      if (until === 'turn' && turns === 1) break;
      if (until === 'round' && state.round !== round) break;
      playTurn(
        state,
        state.seats.map((s) => (s.hand.length > 0 ? policy(state, s.id) : null)),
      );
      turns += 1;
    }
    return state;
  }

  return { determinize, fork, playTurn, playOut };
}

function copySeat<S>(s: SeatState<S>): SeatState<S> {
  const zones: Record<string, Card[]> = {};
  for (const [zone, cards] of Object.entries(s.zones)) zones[zone] = cards.slice();
  return {
    ...s,
    hand: s.hand.slice(),
    tableau: s.tableau.slice(),
    zones,
    recall: s.recall.slice(),
    data: cloneJson(s.data),
  };
}

/**
 * The faces each seat picked this round, by turn then seat, from the view's public `reveal` log
 * entries. A turn whose entry is missing (a trimmed log) only makes the sample less exact.
 */
function revealedPicks<S, T>(view: DraftView<S, T>): Map<number, Map<SeatId, CardDefId>> {
  const out = new Map<number, Map<SeatId, CardDefId>>();
  for (const e of view.log) {
    if (e.kind !== 'reveal' || e.round !== view.round || !Array.isArray(e.data)) continue;
    const bySeat = new Map<SeatId, CardDefId>();
    for (const p of e.data) {
      if (p === null || typeof p !== 'object' || Array.isArray(p)) continue;
      if (typeof p.seat === 'number' && typeof p.card === 'string') bySeat.set(p.seat, p.card);
    }
    out.set(e.turn, bySeat);
  }
  return out;
}
