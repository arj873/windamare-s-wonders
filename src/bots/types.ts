/**
 * Bot contract. A bot sees ONLY `viewFor(state, seat)` output, never the full state (hidden
 * hands, deck, rng). Everything it needs to act comes from the view through the engine's
 * view-safe `legalActions` / `legalPicks` / `defaultAction` (docs/ENGINE.md §6).
 */
import type { DraftAction, DraftEngine, DraftView, Rng, SeatId } from '../engine';

export interface BotContext<S, T> {
  /** The engine bound to the ruleset. Only call its view-safe functions with `view`. */
  engine: DraftEngine<S, T>;
  /** What this seat may know. */
  view: DraftView<S, T>;
  seat: SeatId;
  /** The bot's own RNG (never `state.rng`). */
  rng: Rng;
}

/** A bot decides one action for a seat that the game is waiting on; null = no legal action. */
export interface Bot<S = unknown, T = unknown> {
  name: string;
  act(ctx: BotContext<S, T>): DraftAction | null;
}
