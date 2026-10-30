/**
 * Seating: seats sit clockwise; the left neighbour is the next seat clockwise (s + 1), the right
 * neighbour the previous one (s - 1). Hands pass 'left' (to s + 1) or 'right' (to s - 1).
 */
import { seatOffset } from '../../shared';
import type { PassDirection, SeatId } from './types';

interface Seated {
  seats: readonly unknown[];
}

export function leftOf(state: Seated, seat: SeatId): SeatId {
  return seatOffset(seat, 1, state.seats.length);
}

export function rightOf(state: Seated, seat: SeatId): SeatId {
  return seatOffset(seat, -1, state.seats.length);
}

/** `[left, right]`, without duplicates (2 seats) and without the seat itself (1 seat). */
export function neighboursOf(state: Seated, seat: SeatId): SeatId[] {
  const out: SeatId[] = [];
  for (const s of [leftOf(state, seat), rightOf(state, seat)]) {
    if (s !== seat && !out.includes(s)) out.push(s);
  }
  return out;
}

/** The seat that receives `seat`'s hand this round. */
export function passTarget(state: Seated & { passDirection: PassDirection }, seat: SeatId): SeatId {
  return state.passDirection === 'left' ? leftOf(state, seat) : rightOf(state, seat);
}

export function isSeat(state: Seated, seat: unknown): seat is SeatId {
  return (
    typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < state.seats.length
  );
}
