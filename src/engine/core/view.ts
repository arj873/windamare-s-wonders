/**
 * Per-seat views (docs/ENGINE.md §7): what one seat, or a spectator, may know. A view has the
 * DraftState shape with every secret masked, plus `view` with public counts. It shares unchanged
 * parts with the state: treat it as read-only. Never pass a view to applyAction.
 */
import type { Card, DraftState, DraftView, Ruleset, SeatState, Viewer, Visibility } from './types';

/** `def` of every placeholder card; ids of placeholders are -1, -2, ... within a list. */
export const HIDDEN_CARD = '?';
export const HIDDEN_SEED = 'hidden';

const hide = (cards: readonly Card[]): Card[] =>
  cards.map((_, i) => ({ id: -1 - i, def: HIDDEN_CARD }));

export function isDraftView<S, T>(state: DraftState<S, T>): state is DraftView<S, T> {
  return typeof (state as Partial<DraftView<S, T>>).view === 'object';
}

export function viewFor<S, T>(
  rules: Ruleset<S, T>,
  state: DraftState<S, T>,
  viewer: Viewer,
): DraftView<S, T> {
  if (isDraftView(state)) throw new Error('viewFor: already a view');
  const seat = viewer === 'spectator' ? null : viewer;
  if (seat !== null && !state.seats[seat]) throw new Error(`viewFor: no seat ${String(viewer)}`);
  const over = state.phase.kind === 'gameOver';
  const zoneVisibility = (zone: string): Visibility => rules.zones?.[zone] ?? 'public';

  const seats: SeatState<S>[] = state.seats.map((s) => {
    const own = s.id === seat;
    const zones: Record<string, Card[]> = {};
    for (const [zone, cards] of Object.entries(s.zones)) {
      const vis = zoneVisibility(zone);
      zones[zone] = vis === 'public' || (vis === 'owner' && (own || over)) ? cards : hide(cards);
    }
    return {
      ...s,
      hand: own ? s.hand : hide(s.hand),
      pick: own ? s.pick : null,
      zones,
      data: rules.maskSeat ? rules.maskSeat(s.data, viewer, s.id) : s.data,
    };
  });

  return {
    ...state,
    config: { ...state.config, seed: HIDDEN_SEED },
    seats,
    deck: hide(state.deck),
    discard: rules.discardVisibility === 'public' ? state.discard : hide(state.discard),
    box: hide(state.box),
    table: rules.maskTable ? rules.maskTable(state.table, viewer) : state.table,
    // Others' options and waiting answers are hidden; whether they answered is public.
    prompts: state.prompts.map((p) => (p.seat === seat ? p : { ...p, data: null, answer: null })),
    log: state.log.filter((e) => !e.to || (seat !== null && e.to.includes(seat))),
    rng: [0, 0, 0, 0],
    view: {
      viewer: seat,
      handCounts: state.seats.map((s) => s.hand.length),
      submitted: state.seats.map((s) => s.pick !== null),
      deckCount: state.deck.length,
      discardCount: state.discard.length,
    },
  };
}
