/**
 * What the draft table needs to know about a ruleset to draw it. The table itself is generic
 * (it reads only the engine's DraftView); a ruleset ships one Presenter with its names, kinds,
 * uses and numbers. The Windamere one comes with E2; dev pages use a toy one.
 */
import type { CardDefId, DraftView, Json, Prompt, SeatId } from '../../engine';

/** A card category. `mark` is a text placeholder for the kind's shape until art A3. */
export interface KindInfo {
  id: string;
  label: string;
  mark: string;
}

/** One way to use a hand card (`Pick.use`). */
export interface UseInfo {
  id: string;
  /** Button label: "Build". */
  label: string;
  /** Past tense for the reveal and log: "built". */
  verb: string;
  /** Keyboard shortcut (one lower-case letter). */
  key: string;
}

/** A card face as text, until art A3 draws real faces. */
export interface CardFace {
  name: string;
  kind: string;
  /** Short cost, "2g"; '' = free. */
  cost: string;
  /** One-line effect. */
  text: string;
}

/** A public number for a seat: coins, score estimate, ... The first one is shown everywhere. */
export interface SeatStat {
  id: string;
  label: string;
  value: string;
}

export interface PromptInfo {
  title: string;
  answer(answer: Json): string;
}

export interface Presenter<S = unknown, T = unknown> {
  /** In display order (tableau columns, counts). */
  kinds: readonly KindInfo[];
  /** In button order; the first legal one is the default. */
  uses: readonly UseInfo[];
  card(def: CardDefId): CardFace;
  seatStats(view: DraftView<S, T>, seat: SeatId): SeatStat[];
  /** "Round 1", later "Spring". `rounds` = total rounds. */
  roundName(round: number, rounds: number): string;
  /** Labels for seat zones the table shows ("Stash"); unlisted zones are not drawn. */
  zones?: Readonly<Record<string, string>>;
  prompt(prompt: Prompt): PromptInfo;
  scoreLabel(category: string): string;
}
