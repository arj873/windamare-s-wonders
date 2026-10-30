/**
 * The seam between the room server and the game engine. docs/ENGINE.md did not exist when this was
 * written, so this is net's *requirement*, not the engine's API: the engine lane (or a thin adapter
 * in src/net) must satisfy it. See docs/MULTIPLAYER.md §6.
 *
 * Everything crossing it must be JSON-safe (state goes into Durable Object snapshots, views and
 * picks go over the wire). Seats are indices 0..n-1.
 */
export type Viewer = number | 'spectator';

export interface DraftEngine<State, View, Pick> {
  /** Fresh game for `names.length` seats. Deterministic in `seed`. */
  create(names: readonly string[], seed: string): State;
  /** Current round number, starting at 1. */
  round(state: State): number;
  isOver(state: State): boolean;
  /** Per-viewer redaction: contains nothing the viewer could not know at a real table. */
  viewFor(state: State, viewer: Viewer): View;
  /** Picks `seat` may submit now (what the HUD enables). */
  legalPicks(state: State, seat: number): Pick[];
  /** Rebuild an untrusted payload into a Pick, or throw. Shape only; legality is `isLegal`. */
  parsePick(raw: unknown): Pick;
  isLegal(state: State, seat: number, pick: Pick): boolean;
  /** Deterministic pick used when the round clock runs out. */
  defaultPick(state: State, seat: number): Pick;
  /** Bot pick from the seat's own redacted view (bots never see the full state). */
  botPick(view: View, seat: number): Pick;
  /** Apply every seat's pick at once. The result must not depend on arrival order. */
  resolveRound(state: State, picks: readonly Pick[]): State;
}
