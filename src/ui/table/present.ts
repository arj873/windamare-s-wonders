/**
 * What the draft table needs to know about a ruleset to draw it. The table itself is generic
 * (it reads only the engine's DraftView); a ruleset ships one Presenter with its names, kinds,
 * uses and numbers. The Windamere one comes with E2; dev pages use a toy one.
 */
import type { CardDefId, DraftView, Json, Pick, Prompt, SeatId } from '../../engine';

/** A card category: its icon (URL), with `mark` as the text fallback. */
export interface KindInfo {
  id: string;
  label: string;
  mark: string;
  icon?: string;
}

/** A town's personal monument (Windamere: its Great Work). */
export interface MonumentInfo {
  name: string;
  /** Inline SVG art whose `tier-N` layers fade until done. */
  art?: string;
  tiers: number;
  total: number;
  /** "Labour 5 · tier III at 10". */
  progress: string;
  /** What it does all game (the Perk). */
  perk: string;
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
  /** What the card gives when used another way (Windamere's Spend band), '' = nothing. */
  alt?: string;
}

/** A public number for a seat: coins, score estimate, ... The first one is shown everywhere. */
export interface SeatStat {
  id: string;
  label: string;
  value: string;
  /** Stats of one group render on their own line ('store': a town's goods). */
  group?: string;
  /** Nothing there (0 of a good): drawn faded. */
  dim?: boolean;
  /** Icon URL drawn before the value (the label stays the accessible name). */
  icon?: string;
}

/** One alternative for a choice inside a pick (who to buy a good from, an upgrade or not). */
export interface ChoiceOption {
  /** Stable id for tests and the playtest harness (`data-option`): 'buy-1', 'bank', ... */
  key: string;
  label: string;
  /** The whole pick with this alternative chosen. */
  pick: Pick;
  selected: boolean;
  /** Why this alternative is not possible, or null. */
  why: string | null;
}

export interface ChoiceRow {
  /** Stable id (`data-choice`): 'cover', 'pay-0-reed', ... */
  key: string;
  label: string;
  options: ChoiceOption[];
}

export interface PromptInfo {
  title: string;
  answer(answer: Json): string;
  /** Longer text under an answer (a Great Work's Perk and tiers); '' = none. */
  detail?(answer: Json): string;
  /** Inline SVG art for an answer (a Great Work's picture). */
  art?(answer: Json): string | undefined;
  /** One line under the title ("Hidden until everyone has chosen. You can change it."). */
  hint?: string;
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
  /** Table-wide facts for the top bar (this Season's Raid, Honours, prices). */
  banner?(view: DraftView<S, T>): SeatStat[];
  /** The seat's monument (Great Work), or null when it has none yet. */
  monument?(view: DraftView<S, T>, seat: SeatId): MonumentInfo | null;
  /** One line on what a legal pick costs or gives ("pay 2 Reed · buy 1 Salt from Ana, 2g"). */
  describe?(view: DraftView<S, T>, seat: SeatId, pick: Pick): string;
  /** The choices inside a legal pick the player may change (sellers, upgrade or not). */
  choices?(view: DraftView<S, T>, seat: SeatId, pick: Pick): ChoiceRow[];
  /** A player-facing reason for the engine's refusal `error` of `pick`. */
  whyNot?(view: DraftView<S, T>, seat: SeatId, pick: Pick, error: string): string;
}
