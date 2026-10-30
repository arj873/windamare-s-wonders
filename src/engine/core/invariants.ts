/** Where cards live, and the state invariants the core checks after every action. */
import type { Card, CardId, DraftState } from './types';

/** Every card list of the state with a name for messages: hands, tableaux, zones, piles. */
export function cardLists(state: DraftState<unknown, unknown>): [string, Card[]][] {
  const out: [string, Card[]][] = [];
  for (const s of state.seats) {
    out.push([`seat ${s.id} hand`, s.hand], [`seat ${s.id} tableau`, s.tableau]);
    for (const [zone, cards] of Object.entries(s.zones)) out.push([`seat ${s.id} ${zone}`, cards]);
  }
  out.push(['deck', state.deck], ['discard', state.discard], ['box', state.box]);
  return out;
}

/** Name of the list holding card `id`, or null if it is nowhere. */
export function locate(state: DraftState<unknown, unknown>, id: CardId): string | null {
  for (const [where, cards] of cardLists(state)) if (cards.some((c) => c.id === id)) return where;
  return null;
}

/**
 * Violations (empty = fine): every card dealt this game (ids 0..nextCardId-1) is in exactly one
 * place; picks point at cards in their seat's hand; phase matches prompts and result.
 */
export function checkInvariants(state: DraftState<unknown, unknown>): string[] {
  const errors: string[] = [];
  const where = new Map<CardId, string>();
  for (const [name, cards] of cardLists(state)) {
    for (const c of cards) {
      if (!Number.isInteger(c.id) || c.id < 0 || c.id >= state.nextCardId) {
        errors.push(`${name}: bad card id ${c.id}`);
      }
      const other = where.get(c.id);
      if (other !== undefined) errors.push(`card ${c.id} is in ${other} and ${name}`);
      where.set(c.id, name);
    }
  }
  for (let id = 0; id < state.nextCardId; id++) {
    if (!where.has(id)) errors.push(`card ${id} is missing`);
  }
  for (const s of state.seats) {
    if (s.pick === null) continue;
    if (state.phase.kind !== 'pick') errors.push(`seat ${s.id} has a pick outside the pick phase`);
    const card = s.pick.card;
    if (!s.hand.some((c) => c.id === card))
      errors.push(`seat ${s.id} picked card ${card} not in hand`);
  }
  const prompting = state.phase.kind === 'prompt';
  if (prompting !== state.prompts.length > 0) {
    errors.push(`phase ${state.phase.kind} with ${state.prompts.length} prompts`);
  }
  if ((state.phase.kind === 'gameOver') !== (state.result !== null)) {
    errors.push(`phase ${state.phase.kind} with result ${state.result === null ? 'null' : 'set'}`);
  }
  return errors;
}
