/**
 * Public types of the game-agnostic draft core. The contract is docs/ENGINE.md: change a type
 * here, update that file in the same commit.
 */
import type { Rng, RngState } from './rng';

/** Plain JSON. States, actions, picks and prompt data hold nothing else. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 0..n-1, clockwise. */
export type SeatId = number;
/** A card's identity in the catalog (ruleset data). */
export type CardDefId = string;
/** One physical copy in this game: unique per game, >= 0. Placeholders in views are < 0. */
export type CardId = number;

export interface Card {
  id: CardId;
  def: CardDefId;
}

export type PassDirection = 'left' | 'right';

export interface GameConfig {
  seed: number | string;
  /** Seat i sits clockwise after seat i-1. */
  seats: { name: string }[];
  /** Ruleset options, checked by `ruleset.validateOptions`. */
  options?: Record<string, Json>;
}

/** A seat's hidden choice for this turn. `use` and `args` are ruleset vocabulary. */
export interface Pick {
  card: CardId;
  use: string;
  args?: Json;
}

/** After which stage a prompt phase was entered: where the flow continues once it is empty. */
export type PromptStage = 'start' | 'turn' | 'roundEnd';

export type Phase = { kind: 'pick' } | { kind: 'prompt'; then: PromptStage } | { kind: 'gameOver' };

/**
 * A follow-up decision for one seat. `data` (its options) and `answer` are visible to that seat
 * only. Prompts with the same `group` are open together and resolve when all are answered.
 */
export interface Prompt {
  id: number;
  seat: SeatId;
  kind: string;
  data: Json;
  /** The id of the group's first prompt; a lone prompt is a group of one. */
  group: number;
  /** Public: this seat has answered (the answer waits for the rest of its group). */
  answered: boolean;
  /** The waiting answer; null until answered. */
  answer: Json;
}

export interface RevealedPick {
  seat: SeatId;
  card: Card;
  use: string;
  args?: Json;
}

export interface Reveal {
  round: number;
  turn: number;
  /** In seat order. */
  picks: RevealedPick[];
}

export interface LogEntry {
  seq: number;
  round: number;
  turn: number;
  /** Who it is about; null = the table. */
  seat: SeatId | null;
  kind: string;
  /** Plain English, safe to show to everyone the entry is shown to. */
  text: string;
  data?: Json;
  /** Private entry: only these seats see it. */
  to?: SeatId[];
}

export interface SeatScore {
  seat: SeatId;
  categories: Record<string, number>;
  total: number;
  /** `ruleset.tiebreak` ([] without one): compared element by element, higher wins. */
  tiebreak: number[];
}

export interface GameResult {
  /** In seat order. */
  scores: SeatScore[];
  /** Best first; tied seats share a group. */
  ranking: SeatId[][];
  winners: SeatId[];
}

export interface SeatState<S = unknown> {
  id: SeatId;
  name: string;
  /** Owner only. */
  hand: Card[];
  /** Submitted, not yet revealed; owner only. References a card still in `hand`. */
  pick: Pick | null;
  /** Public, in the order played. */
  tableau: Card[];
  /** Ruleset zones (`ruleset.zones`), each with its own visibility. */
  zones: Record<string, Card[]>;
  /** Ruleset seat data (JSON). */
  data: S;
}

export interface DraftState<S = unknown, T = unknown> {
  schemaVersion: 1;
  ruleset: { id: string; version: number };
  /** Fixed after createGame; shared between states, never mutate it. */
  config: GameConfig;
  /** +1 per accepted action. */
  seq: number;
  /** 0-based round index. */
  round: number;
  /** 0-based pick number within the round. */
  turn: number;
  /** Picks per seat this round (`RoundSpec.picks`). */
  roundPicks: number;
  passDirection: PassDirection;
  phase: Phase;
  seats: SeatState<S>[];
  /** Undealt cards of this round; hidden from everyone. */
  deck: Card[];
  /** Visibility: `ruleset.discardVisibility` (default hidden). */
  discard: Card[];
  /** Out of the game (e.g. a previous round's undealt cards); hidden from everyone. */
  box: Card[];
  /** Ruleset table data (JSON). */
  table: T;
  /** Pending follow-up decisions, answered in order. */
  prompts: Prompt[];
  nextCardId: number;
  nextPromptId: number;
  lastReveal: Reveal | null;
  log: LogEntry[];
  rng: RngState;
  result: GameResult | null;
}

export type DraftAction =
  | { type: 'pick'; seat: SeatId; pick: Pick }
  | { type: 'unpick'; seat: SeatId }
  | { type: 'answer'; seat: SeatId; prompt: number; answer: Json };

export type ActionResult<S = unknown, T = unknown> =
  { ok: true; state: DraftState<S, T> } | { ok: false; error: string };

/** A seat, or 'spectator' (sees only public information). */
export type Viewer = SeatId | 'spectator';

export interface ViewInfo {
  /** null = spectator. */
  viewer: SeatId | null;
  handCounts: number[];
  /** Per seat: has a pick waiting for the reveal. */
  submitted: boolean[];
  deckCount: number;
  discardCount: number;
}

export interface DraftView<S = unknown, T = unknown> extends DraftState<S, T> {
  view: ViewInfo;
}

// ---------------------------------------------------------------------------
// Rulesets (docs/ENGINE.md §8)
// ---------------------------------------------------------------------------

/** One effect of a card: `type` selects the handler, the other keys are its parameters. */
export interface EffectSpec {
  type: string;
  [param: string]: Json;
}

export interface CardDef {
  id: CardDefId;
  name: string;
  /** Ruleset category. */
  kind: string;
  /** Interpreted by the ruleset. */
  cost?: Json;
  tags?: string[];
  effects: EffectSpec[];
}

export type Visibility = 'public' | 'owner' | 'hidden';

export interface RoundSpec {
  handSize: number;
  /** Picks per seat this round, 1..handSize; leftovers are discarded on the last turn. */
  picks: number;
  pass: PassDirection;
  /** Card faces of this round's deck (unshuffled); the core shuffles and deals. */
  deck: CardDefId[];
}

/** What ruleset code may do to the draft (a private copy: mutate freely). */
export interface Ctx<S = unknown, T = unknown> {
  readonly state: DraftState<S, T>;
  readonly rules: Ruleset<S, T>;
  readonly rng: Rng;
  def(card: Card | CardDefId): CardDef;
  /** Into the seat's tableau, then each of the card's effects' `onPlay` (given `args`). */
  play(seat: SeatId, card: Card, args?: Json): void;
  /** Into a seat zone (no triggers). */
  place(seat: SeatId, zone: string, card: Card): void;
  toDiscard(card: Card): void;
  /** Out of the game. */
  toBox(card: Card): void;
  /** Remove a card from wherever it is; the caller must put it somewhere. */
  take(id: CardId): Card;
  /** Run `onPlay` of arbitrary specs (e.g. a monument stage). */
  trigger(seat: SeatId, specs: readonly EffectSpec[], source: Card | null, args?: Json): void;
  /** Queue a prompt for one seat (a group of one: it resolves when answered). */
  prompt(seat: SeatId, kind: string, data: Json): void;
  /**
   * Queue one group of prompts, at most one per seat, answered at the same time: each answer is
   * hidden and may change until the last one arrives; then all apply in `resolveOrder`.
   */
  promptGroup(entries: readonly { seat: SeatId; kind: string; data: Json }[]): void;
  log(seat: SeatId | null, kind: string, text: string, opts?: { data?: Json; to?: SeatId[] }): void;
  left(seat: SeatId): SeatId;
  right(seat: SeatId): SeatId;
  neighbours(seat: SeatId): SeatId[];
}

export interface EffectHandler<S = unknown, T = unknown> {
  /** Checks a spec's parameters; content tests run it on every card. */
  validate?(spec: EffectSpec): string | null;
  /** `args`: what `ctx.play` / `ctx.trigger` passed (e.g. the pick's choices); may be undefined. */
  onPlay?(
    ctx: Ctx<S, T>,
    seat: SeatId,
    spec: EffectSpec,
    source: Card | null,
    args: Json | undefined,
  ): void;
  onRoundEnd?(ctx: Ctx<S, T>, seat: SeatId, spec: EffectSpec): void;
  score?(state: DraftState<S, T>, seat: SeatId, spec: EffectSpec): Record<string, number>;
}

export interface PromptHandler<S = unknown, T = unknown> {
  /**
   * Fresh `data` for the prompt when it becomes the open one (queued prompts can go stale while
   * earlier ones are answered). With it, `validate` can check answers against `prompt.data`
   * alone, which the prompted seat sees: view-safe.
   */
  refresh?(state: DraftState<S, T>, prompt: Prompt): Json;
  /** Legal answers (each is accepted by `validate`). */
  answers(state: DraftState<S, T>, prompt: Prompt): Json[];
  validate(state: DraftState<S, T>, prompt: Prompt, answer: Json): string | null;
  apply(ctx: Ctx<S, T>, prompt: Prompt, answer: Json): void;
  /** Timeouts; default = answers[0]. */
  defaultAnswer?(state: DraftState<S, T>, prompt: Prompt): Json;
}

/** Runs once per seat per step; steps run step-major (all seats step 1, then step 2, ...). */
export type ResolveStep<S = unknown, T = unknown> = (
  ctx: Ctx<S, T>,
  seat: SeatId,
  pick: Pick,
  card: Card,
) => void;

export interface Ruleset<S = unknown, T = unknown> {
  id: string;
  version: number;
  minSeats: number;
  maxSeats: number;
  cards: readonly CardDef[];
  effects: Record<string, EffectHandler<S, T>>;
  prompts: Record<string, PromptHandler<S, T>>;
  rounds: number | ((config: GameConfig) => number);
  roundSpec(state: DraftState<S, T>, round: number): RoundSpec;
  setupTable(ctx: Ctx<S, T>): T;
  setupSeat(ctx: Ctx<S, T>, seat: SeatId): S;
  onGameStart?(ctx: Ctx<S, T>): void;
  /**
   * true: `onGameStart` and its prompts come before round 0 is dealt (no hands meanwhile).
   * Default false: round 0 is dealt first.
   */
  startBeforeDeal?: boolean;
  /** Runs just before each round is dealt (round 0 included), before `roundSpec`. */
  onRoundStart?(ctx: Ctx<S, T>, round: number): void;
  validateOptions?(options: Record<string, Json>): string | null;
  /**
   * Fill in what the pick left out (default choices) before it is validated and stored; the
   * stored and revealed pick is what this returns. Must keep `card` and `use`, must not throw on
   * junk `args` (return the pick as is and let `validatePick` reject it), and must be view-safe.
   */
  normalizePick?(state: DraftState<S, T>, seat: SeatId, pick: Pick): Pick;
  /** The card is in the seat's hand (the core checked); `pick` is normalized. */
  validatePick(state: DraftState<S, T>, seat: SeatId, pick: Pick): string | null;
  /** Sound; complete up to open-ended `args` (docs/ENGINE.md §6). */
  legalPicks(state: DraftState<S, T>, seat: SeatId): Pick[];
  /** Timeouts; default = legalPicks[0]. */
  defaultPick?(state: DraftState<S, T>, seat: SeatId): Pick;
  /** Default 0..n-1. */
  resolveOrder?(state: DraftState<S, T>): SeatId[];
  resolve: ResolveStep<S, T>[];
  /**
   * The last turn's leftover hand cards, after the reveal and before the resolve steps. Must put
   * every card somewhere (e.g. a zone a resolve step reads). Default: the discard pile.
   */
  onLeftovers?(ctx: Ctx<S, T>, seat: SeatId, cards: Card[]): void;
  onRoundEnd?(ctx: Ctx<S, T>): void;
  /** Score categories; total = their sum. */
  score(state: DraftState<S, T>, seat: SeatId): Record<string, number>;
  /** Tie-breaks in order: the first one that differs decides, higher wins. Same length per seat. */
  tiebreak?(state: DraftState<S, T>, seat: SeatId): number[];
  /** Effect sources beyond tableau cards (e.g. monument stages). */
  activeEffects?(state: DraftState<S, T>, seat: SeatId): EffectSpec[];
  zones?: Record<string, Visibility>;
  /** Default 'hidden'. */
  discardVisibility?: 'public' | 'hidden';
  maskSeat?(data: S, viewer: Viewer, owner: SeatId): S;
  /** The `args` of `owner`'s revealed pick as `viewer` sees it in `lastReveal` (e.g. a secret burn). */
  maskRevealArgs?(args: Json, viewer: Viewer, owner: SeatId): Json;
  maskTable?(table: T, viewer: Viewer): T;
}
