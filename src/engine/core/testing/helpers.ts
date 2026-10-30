/** Test helpers around the toy ruleset. Test-only, like toy.ts. */
import { createDraftEngine } from '../engine';
import type { Card, DraftAction, GameConfig, Json, Pick, SeatId } from '../types';
import { toyRuleset, type ToyState } from './toy';

export const toy = createDraftEngine(toyRuleset);

export function toyConfig(
  seats: number,
  options?: Record<string, Json>,
  seed: number | string = 7,
): GameConfig {
  return {
    seed,
    seats: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })),
    ...(options ? { options } : {}),
  };
}

export function newToyGame(
  seats = 3,
  options?: Record<string, Json>,
  seed: number | string = 7,
): ToyState {
  return toy.createGame(toyConfig(seats, options, seed));
}

/** applyAction that must succeed. */
export function act(state: ToyState, action: DraftAction): ToyState {
  const r = toy.applyAction(state, action);
  if (!r.ok) throw new Error(`rejected ${JSON.stringify(action)}: ${r.error}`);
  return r.state;
}

export function pick(state: ToyState, seat: SeatId, p: Pick): ToyState {
  return act(state, { type: 'pick', seat, pick: p });
}

/** The seat's hand; throws if the seat does not exist. */
function handOf(state: ToyState, seat: SeatId): Card[] {
  const s = state.seats[seat];
  if (!s) throw new Error(`no seat ${seat}`);
  return s.hand;
}

/** Sell the first card in hand. */
export function sellFirst(state: ToyState, seat: SeatId): Pick {
  const card = handOf(state, seat)[0];
  if (!card) throw new Error(`seat ${seat} holds no cards`);
  return { card: card.id, use: 'sell' };
}

/** Every waiting seat picks `choose(state, seat)` (default: sell its first card). */
export function pickAll(
  state: ToyState,
  choose: (s: ToyState, seat: SeatId) => Pick = sellFirst,
): ToyState {
  let s = state;
  for (const seat of toy.waitingOn(s)) s = pick(s, seat, choose(s, seat));
  return s;
}

/** A copy of `state` whose seat holds these faces (the dealt ids are kept, only faces change). */
export function withHand(state: ToyState, seat: SeatId, defs: string[]): ToyState {
  const s = JSON.parse(JSON.stringify(state)) as ToyState;
  const hand = handOf(s, seat);
  if (defs.length > hand.length) throw new Error('withHand: more faces than cards');
  hand.forEach((card, i) => {
    card.def = defs[i] ?? card.def;
  });
  return s;
}

/** Deep-freeze for purity tests. */
export function deepFreeze<T>(x: T): T {
  if (x !== null && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}
