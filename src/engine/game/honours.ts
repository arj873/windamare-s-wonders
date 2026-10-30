/** R11 Honours. Measures are public (R1.11), so these work on views too (R11.3). */
import type { Ctx, SeatId } from '../core';
import type { WwRules } from './content';
import { emit } from './events';
import { measure, townOf } from './town';
import type { WwSeat, WwState, WwTable } from './types';

export interface HonourStanding {
  honour: string;
  /** The highest measure among all towns. */
  best: number;
  /** Towns at `best`; empty when `best` is 0 (R11.2: a measure of 0 never wins). */
  leaders: SeatId[];
}

/** R11.3: the leaders of each revealed Honour, as things stand. */
export function honourStandings(rules: WwRules, state: WwState): HonourStanding[] {
  return state.table.honours.map((id) => {
    const m = rules.honour(id).measure;
    const values = state.seats.map((s) => measure(rules, state, s.id, m));
    const best = Math.max(0, ...values);
    const leaders =
      best > 0 ? state.seats.filter((s) => values[s.id] === best).map((s) => s.id) : [];
    return { honour: id, best, leaders };
  });
}

/** R11.2: Renown from Honours at game end (sole leader 5, each tied leader 2). */
export function honourScore(rules: WwRules, state: WwState, seat: SeatId): number {
  const t = rules.tunables;
  return honourStandings(rules, state).reduce((sum, h) => {
    if (!h.leaders.includes(seat)) return sum;
    return sum + (h.leaders.length === 1 ? t.honourSole : t.honourTied);
  }, 0);
}

const sameSeats = (a: readonly SeatId[], b: readonly SeatId[]) =>
  a.length === b.length && a.every((s, i) => s === b[i]);

/**
 * R11.3: store each Honour's current leaders in `table.leaders`, and record an `honour` event for
 * each one that changed. Called after every turn, the Great Work reveal and every Season end.
 */
export function updateHonourLeaders(rules: WwRules, ctx: Ctx<WwSeat, WwTable>): void {
  const table = ctx.state.table;
  honourStandings(rules, ctx.state).forEach((h, i) => {
    const was = table.leaders[i] ?? [];
    if (sameSeats(was, h.leaders)) return;
    table.leaders[i] = h.leaders;
    const name = rules.honour(h.honour).name;
    const who = h.leaders.map((s) => townOf(ctx.state, s).name).join(' and ');
    emit(
      ctx,
      { type: 'honour', honour: h.honour, leaders: h.leaders, was, best: h.best },
      who
        ? `${who} ${h.leaders.length > 1 ? 'share' : 'leads'} ${name} (${h.best}).`
        : `Nobody leads ${name}.`,
    );
  });
}
