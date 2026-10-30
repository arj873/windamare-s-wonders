/**
 * Pure derivation of everything the draft table draws (UX.md §7, §8) from one engine view.
 * Legality comes from the engine only (legalPicks / legalActions / the ruleset's validatePick
 * for the reason a use is not possible), never re-derived here. No DOM.
 */
import {
  HIDDEN_CARD,
  leftOf,
  rightOf,
  type Card,
  type CardId,
  type DraftEngine,
  type DraftView,
  type Json,
  type PassDirection,
  type Pick,
  type Prompt,
  type SeatId,
} from '../../engine';
import type { CardFace, ChoiceRow, KindInfo, Presenter, SeatStat, UseInfo } from './present';

/** Per seat, from the setup screen: what the engine does not know. */
export interface SeatLook {
  color: string;
  bot: boolean;
}

export interface TableInput<S, T> {
  view: DraftView<S, T>;
  engine: DraftEngine<S, T>;
  present: Presenter<S, T>;
  looks: readonly SeatLook[];
}

/** ✓ picked, ⋯ still choosing (or answering a prompt), idle = nothing to do now. */
export type SeatStatus = 'picked' | 'thinking' | 'idle';

export interface TableauCard {
  id: CardId;
  face: CardFace;
  kind: KindInfo;
  /** Arrived in the latest reveal. */
  fresh: boolean;
}

export interface ZoneModel {
  id: string;
  label: string;
  count: number;
  /** null = hidden from this viewer (only the count shows). */
  cards: TableauCard[] | null;
}

export interface SeatModel {
  seat: SeatId;
  name: string;
  you: boolean;
  bot: boolean;
  color: string;
  status: SeatStatus;
  handCount: number;
  stats: SeatStat[];
  /** Kinds with at least one card, in presenter order. */
  counts: { kind: KindInfo; n: number }[];
  /** Tableau grouped by kind (presenter order), play order within a kind. */
  columns: { kind: KindInfo; cards: TableauCard[] }[];
  zones: ZoneModel[];
}

export interface UseOption {
  use: UseInfo;
  /** The legal pick for this use (with the ruleset's default args), or null. */
  pick: Pick | null;
  /** Why the use is not possible now (P7), or null when it is. */
  why: string | null;
  /** What the pick costs or gives, one line ('' when the presenter says nothing). */
  detail: string;
  /** Choices inside the pick the player may change (sellers, upgrade or not). */
  choices: ChoiceRow[];
}

export interface HandCard {
  id: CardId;
  face: CardFace;
  kind: KindInfo;
  options: UseOption[];
  /** At least one use is legal. */
  playable: boolean;
  /** This is the viewer's submitted pick (it stays in the hand until the reveal). */
  staged: boolean;
}

export interface RevealLine {
  seat: SeatId;
  name: string;
  you: boolean;
  face: CardFace;
  kind: KindInfo;
  verb: string;
}

export interface PromptModel {
  id: number;
  title: string;
  hint: string;
  answers: { label: string; detail: string; answer: Json; chosen: boolean }[];
  /** The viewer answered; the group waits for the others (the answer may still change). */
  answered: boolean;
}

export interface ResultColumn {
  seat: SeatId;
  name: string;
  you: boolean;
  color: string;
  total: number;
  /** 1 = best; tied seats share a rank. */
  rank: number;
  winner: boolean;
}

export interface ResultModel {
  /** Best first. */
  columns: ResultColumn[];
  /** One row per score category, values in `columns` order. */
  rows: { category: string; label: string; values: number[] }[];
  headline: string;
}

export interface TableModel {
  phase: 'pick' | 'prompt' | 'gameOver';
  viewer: SeatId | null;
  /** "Round 1 of 2 · Pick 2 of 3". */
  round: string;
  /** Where your hand goes after this pick (null for a spectator). */
  pass: { dir: PassDirection; arrow: '◀' | '▶'; to: string } | null;
  /** Header line: "Choose a card", "Waiting for Ana and Cy", ... */
  status: string;
  /** Table order. */
  seats: SeatModel[];
  me: SeatModel | null;
  /** The left neighbour sits on the left of the screen. */
  left: SeatModel | null;
  /** null with two seats (both neighbours are the same seat) or for a spectator. */
  right: SeatModel | null;
  hand: HandCard[];
  staged: { card: HandCard; use: UseInfo | null } | null;
  canUnpick: boolean;
  /** The open prompt, when it is the viewer's. */
  prompt: PromptModel | null;
  reveal: { title: string; lines: RevealLine[] } | null;
  log: { key: string; text: string }[];
  result: ResultModel | null;
  /** Table-wide facts for the top bar (Raid, Honours, prices). */
  banner: SeatStat[];
  /**
   * Re-check a pick the player changed inside the popover (another seller, no upgrade): the
   * engine's verdict plus the presenter's detail and choices for it. null outside a pick.
   */
  refine(pick: Pick): UseOption | null;
}

/** How many log entries the sidebar keeps. */
export const LOG_LINES = 12;

const UNKNOWN_MARK = '◇';
const DEFAULT_LOOK: SeatLook = { color: '#9aa3ad', bot: false };

/** "a", "a and b", "a, b and c". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The open prompt group (docs/ENGINE.md §6: prompts with the first prompt's group answer
 * together, hidden; a seat may change its answer until the last one is in).
 */
export function openPrompts<S, T>(view: DraftView<S, T>): Prompt[] {
  const head = view.prompts[0];
  if (view.phase.kind !== 'prompt' || !head) return [];
  return view.prompts.filter((p) => p.group === head.group);
}

export function totalRounds<S, T>(engine: DraftEngine<S, T>, view: DraftView<S, T>): number {
  const r = engine.ruleset.rounds;
  return typeof r === 'number' ? r : r(view.config);
}

export function tableModel<S, T>(input: TableInput<S, T>): TableModel {
  const { view, engine, present } = input;
  const viewer = view.view.viewer;
  const phase = view.phase.kind;
  const kinds = new Map(present.kinds.map((k) => [k.id, k]));
  const kindOf = (id: string): KindInfo =>
    kinds.get(id) ?? { id, label: capitalize(id), mark: UNKNOWN_MARK };
  const useOf = (id: string): UseInfo | undefined => present.uses.find((u) => u.id === id);
  const nameOf = (seat: SeatId): string => view.seats[seat]?.name ?? `Seat ${seat + 1}`;
  const fresh = new Set(view.lastReveal?.picks.map((p) => p.card.id) ?? []);
  const open = openPrompts(view);

  const statusOf = (seat: SeatId): SeatStatus => {
    if (phase === 'prompt') {
      const p = open.find((x) => x.seat === seat);
      return !p ? 'idle' : p.answered ? 'picked' : 'thinking';
    }
    if (phase !== 'pick') return 'idle';
    if (view.view.submitted[seat]) return 'picked';
    return (view.view.handCounts[seat] ?? 0) > 0 ? 'thinking' : 'idle';
  };

  const tableauCard = (c: Card): TableauCard => {
    const face = present.card(c.def);
    return { id: c.id, face, kind: kindOf(face.kind), fresh: fresh.has(c.id) };
  };

  const seats: SeatModel[] = view.seats.map((s) => {
    const look = input.looks[s.id] ?? DEFAULT_LOOK;
    const cards = s.tableau.map(tableauCard);
    const order = [...present.kinds.map((k) => k.id)];
    for (const c of cards) if (!order.includes(c.kind.id)) order.push(c.kind.id);
    const columns = order
      .map((id) => ({ kind: kindOf(id), cards: cards.filter((c) => c.kind.id === id) }))
      .filter((col) => col.cards.length > 0);
    const zones = Object.entries(present.zones ?? {}).map(([id, label]): ZoneModel => {
      const list = s.zones[id] ?? [];
      const hidden = list.some((c) => c.def === HIDDEN_CARD);
      return { id, label, count: list.length, cards: hidden ? null : list.map(tableauCard) };
    });
    return {
      seat: s.id,
      name: s.name,
      you: s.id === viewer,
      bot: look.bot,
      color: look.color,
      status: statusOf(s.id),
      handCount: view.view.handCounts[s.id] ?? 0,
      stats: present.seatStats(view, s.id),
      counts: columns.map((col) => ({ kind: col.kind, n: col.cards.length })),
      columns,
      zones,
    };
  });

  const me = viewer === null ? null : (seats[viewer] ?? null);
  const leftSeat = viewer === null ? null : leftOf(view, viewer);
  const rightSeat = viewer === null ? null : rightOf(view, viewer);
  const left = leftSeat === null || leftSeat === viewer ? null : (seats[leftSeat] ?? null);
  const right =
    rightSeat === null || rightSeat === viewer || rightSeat === leftSeat
      ? null
      : (seats[rightSeat] ?? null);

  const hand = viewer === null ? [] : handCards(input, viewer, kindOf);
  const ownPick = viewer === null ? null : (view.seats[viewer]?.pick ?? null);
  const stagedCard = ownPick ? hand.find((c) => c.id === ownPick.card) : undefined;
  const staged =
    ownPick && stagedCard ? { card: stagedCard, use: useOf(ownPick.use) ?? null } : null;

  return {
    phase,
    viewer,
    // Before the first deal (a start prompt such as the Great Work choice) there are no picks yet.
    round:
      present.roundName(view.round, totalRounds(engine, view)) +
      (view.roundPicks > 0 ? ` · Pick ${view.turn + 1} of ${view.roundPicks}` : ''),
    pass:
      viewer === null
        ? null
        : {
            dir: view.passDirection,
            arrow: view.passDirection === 'left' ? '◀' : '▶',
            to: nameOf(
              view.passDirection === 'left' ? leftOf(view, viewer) : rightOf(view, viewer),
            ),
          },
    status: statusLine(input, seats),
    seats,
    me,
    left,
    right,
    hand,
    staged,
    canUnpick: phase === 'pick' && ownPick !== null,
    prompt: promptModel(input),
    reveal: view.lastReveal && {
      title: `Revealed: pick ${view.lastReveal.turn + 1}`,
      lines: view.lastReveal.picks.map((p) => {
        const face = present.card(p.card.def);
        return {
          seat: p.seat,
          name: nameOf(p.seat),
          you: p.seat === viewer,
          face,
          kind: kindOf(face.kind),
          verb: useOf(p.use)?.verb ?? p.use,
        };
      }),
    },
    log: view.log.slice(-LOG_LINES).map((e, i) => ({ key: `${e.seq}-${i}`, text: e.text })),
    result: resultModel(input, seats),
    banner: present.banner?.(view) ?? [],
    refine: (pick) => (viewer === null ? null : useOption(input, viewer, pick)),
  };
}

/** The engine's verdict on `pick` for `viewer`, with the presenter's words for it. */
function useOption<S, T>(input: TableInput<S, T>, viewer: SeatId, raw: Pick): UseOption | null {
  const { view, engine, present } = input;
  const use = present.uses.find((u) => u.id === raw.use);
  if (!use) return null;
  if (view.phase.kind !== 'pick')
    return { use, pick: null, why: 'Not the pick phase', detail: '', choices: [] };
  const pick = engine.ruleset.normalizePick?.(view, viewer, raw) ?? raw;
  const err = engine.ruleset.validatePick(view, viewer, pick);
  if (err) {
    const why = present.whyNot?.(view, viewer, pick, err) ?? capitalize(err);
    return { use, pick: null, why, detail: '', choices: [] };
  }
  return {
    use,
    pick,
    why: null,
    detail: present.describe?.(view, viewer, pick) ?? '',
    choices: present.choices?.(view, viewer, pick) ?? [],
  };
}

function handCards<S, T>(
  input: TableInput<S, T>,
  viewer: SeatId,
  kindOf: (id: string) => KindInfo,
): HandCard[] {
  const { view, engine, present } = input;
  const seat = view.seats[viewer];
  if (!seat) return [];
  const picking = view.phase.kind === 'pick';
  const legal = picking ? engine.legalPicks(view, viewer) : [];
  return seat.hand.map((c) => {
    const face = present.card(c.def);
    const options = present.uses.map((use): UseOption => {
      const none = { use, pick: null, detail: '', choices: [] };
      if (!picking) return { ...none, why: 'Not the pick phase' };
      const pick = legal.find((p) => p.card === c.id && p.use === use.id);
      const option = useOption(input, viewer, pick ?? { card: c.id, use: use.id });
      if (option?.pick && pick) return option;
      // Not among the legal picks: say why (the engine's reason, in the presenter's words).
      return { ...none, why: option?.why ?? 'Not possible now' };
    });
    return {
      id: c.id,
      face,
      kind: kindOf(face.kind),
      options,
      playable: options.some((o) => o.pick !== null),
      staged: seat.pick?.card === c.id,
    };
  });
}

function statusLine<S, T>(input: TableInput<S, T>, seats: SeatModel[]): string {
  const { view, present } = input;
  const viewer = view.view.viewer;
  const others = (pred: (s: SeatModel) => boolean) =>
    seats.filter((s) => !s.you && pred(s)).map((s) => s.name);
  switch (view.phase.kind) {
    case 'gameOver':
      return 'Game over';
    case 'prompt': {
      const open = openPrompts(view);
      const mine = open.find((p) => p.seat === viewer);
      if (mine && !mine.answered) return present.prompt(mine).title;
      const waiting = open.filter((p) => !p.answered && p.seat !== viewer);
      const names = waiting.map((p) => seats[p.seat]?.name ?? 'a player');
      return names.length ? `Waiting for ${listNames(names)}` : '';
    }
    case 'pick': {
      const mine = viewer === null ? null : seats[viewer];
      if (mine && mine.status === 'thinking') return 'Choose a card';
      const waiting = others((s) => s.status === 'thinking');
      return waiting.length ? `Waiting for ${listNames(waiting)}` : 'Revealing';
    }
  }
}

function promptModel<S, T>(input: TableInput<S, T>): PromptModel | null {
  const { view, engine, present } = input;
  const viewer = view.view.viewer;
  const mine = openPrompts(view).find((p) => p.seat === viewer);
  if (!mine || viewer === null) return null;
  const info = present.prompt(mine);
  const answers = engine.legalActions(view, viewer).flatMap((a) =>
    a.type === 'answer'
      ? [
          {
            label: info.answer(a.answer),
            detail: info.detail?.(a.answer) ?? '',
            answer: a.answer,
            chosen: mine.answered && JSON.stringify(mine.answer) === JSON.stringify(a.answer),
          },
        ]
      : [],
  );
  return {
    id: mine.id,
    title: info.title,
    hint: info.hint ?? '',
    answers,
    answered: mine.answered,
  };
}

function resultModel<S, T>(input: TableInput<S, T>, seats: SeatModel[]): ResultModel | null {
  const { view, present } = input;
  const result = view.result;
  if (view.phase.kind !== 'gameOver' || !result) return null;
  const rankOf = new Map<SeatId, number>();
  result.ranking.forEach((group, i) => group.forEach((s) => rankOf.set(s, i + 1)));
  const order = result.ranking.flat();
  const scoreOf = new Map(result.scores.map((s) => [s.seat, s]));
  const columns = order.map((seat): ResultColumn => {
    const s = seats[seat];
    return {
      seat,
      name: s?.name ?? `Seat ${seat + 1}`,
      you: s?.you ?? false,
      color: s?.color ?? DEFAULT_LOOK.color,
      total: scoreOf.get(seat)?.total ?? 0,
      rank: rankOf.get(seat) ?? order.length,
      winner: result.winners.includes(seat),
    };
  });
  const categories: string[] = [];
  for (const s of result.scores) {
    for (const c of Object.keys(s.categories)) if (!categories.includes(c)) categories.push(c);
  }
  const rows = categories.map((category) => ({
    category,
    label: present.scoreLabel(category),
    values: columns.map((col) => scoreOf.get(col.seat)?.categories[category] ?? 0),
  }));
  const winners = columns.filter((c) => c.winner);
  const headline =
    winners.length === 1
      ? winners[0]?.you
        ? 'You win!'
        : `${winners[0]?.name ?? ''} wins`
      : `${listNames(winners.map((w) => (w.you ? 'you' : w.name)))} share the win`;
  return { columns, rows, headline: capitalize(headline) };
}
