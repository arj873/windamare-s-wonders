/**
 * E8: log lines a client can read as its viewer ("You sell 1 wax to Player 2", docs/ENGINE.md
 * §4). Ruleset code writes a line as pieces; the entry keeps the plain `text` for old readers.
 */
import type { LogEntry, LogPart, SeatId } from './types';

/** A seat piece: `text` for everyone else, `you` for the seat's own player. */
export const named = (seat: SeatId, text: string, you: string): LogPart => ({ seat, text, you });

/** "A and B" as seat pieces; `start`: the list begins the line ("You and B", else "you and B"). */
export function andList(
  seats: readonly SeatId[],
  name: (seat: SeatId) => string,
  start: boolean,
): LogPart[] {
  return seats.flatMap((s, i) => [
    ...(i > 0 ? [' and '] : []),
    named(s, name(s), start && i === 0 ? 'You' : 'you'),
  ]);
}

/** The line as everyone but the named seats reads it: every seat piece by its `text`. */
export function joinParts(parts: readonly LogPart[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');
}

/**
 * The line as `viewer` reads it: "You ..." where it names the viewer's seat; else `text`. Takes a
 * log entry or anything with its `text` and `parts` (Windamere's `eventsOf` entries).
 */
export function logText(
  entry: Pick<LogEntry, 'text' | 'parts'>,
  viewer: SeatId | 'spectator' | null,
): string {
  if (!entry.parts) return entry.text;
  return entry.parts
    .map((p) => (typeof p === 'string' ? p : p.seat === viewer ? p.you : p.text))
    .join('');
}
