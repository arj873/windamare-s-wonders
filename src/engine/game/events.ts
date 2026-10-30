/**
 * E3: the Windamere event log. Every game event is a core log entry (docs/ENGINE.md §4) whose
 * `kind` is the event's `type` and whose `data` is the event itself, so it lives in the state,
 * travels in views and is redacted per seat by the core like every log entry (`to`). Events name
 * only public information (R1.11): a gleaned or burned card is never named, Raids only once
 * revealed, Great Work offers never.
 *
 * Order: the order things happened, so ui can replay a turn: the core's `reveal`, then the
 * resolve steps step-major (R4.8), then Season end. Every event of one action shares its `seq`.
 */
import type { Card, CardId, Ctx, Json, LogEntry, LogPart, SeatId } from '../core';
import type { RaidOutcome } from './raid';
import type { Gains, GoodId, WwSeat, WwState, WwTable } from './types';

export type WwEvent =
  /** R2.5: a town's Great Work, revealed with all the others. */
  | { type: 'greatWork'; seat: SeatId; greatWork: string }
  /** R2.6, R3.2: the Season's Raid turns face up. */
  | { type: 'raidRevealed'; season: number; raid: string; strength: number }
  /** R4.5.1: the Spent card and what it gave (Spend band + spendBonus). */
  | { type: 'spend'; seat: SeatId; card: Card; gains: Gains }
  /** R3.5: the glean's gains (the card stays face down). */
  | { type: 'glean'; seat: SeatId; gains: Gains }
  /** R14.3: a card was burned (not which). */
  | { type: 'burn'; seat: SeatId }
  /** R4.5.2a, R6: how a Build was paid. `buys` are settled by `trade` events. */
  | {
      type: 'pay';
      seat: SeatId;
      card: Card;
      /** Goods taken from the town's own store for the cost. */
      goods: Gains;
      /** Goods given to Exchanges, and the missing goods they paid for. */
      exchanges: { give: GoodId; for: GoodId }[];
      bank: GoodId[];
      buys: { from: SeatId; good: GoodId; price: number }[];
      /** All coins paid: the cost's coins, purchases and the bank. */
      coins: number;
    }
  /** R6.6, R6.7: one good bought from a neighbour; `filled: false` = the bank sold it instead. */
  | {
      type: 'trade';
      seller: SeatId;
      buyer: SeatId;
      good: GoodId;
      price: number;
      filled: boolean;
      /** `sellBonus` coins the seller got from the bank. */
      bonus: number;
    }
  /** R4.5.2c: the Build is placed (covering `cover`), with its "when built" and buildBonus gains. */
  | { type: 'build'; seat: SeatId; card: Card; cover: CardId | null; gains: Gains }
  /** R8.3: a Great Work tier completes, with its one-off reward's gains. */
  | { type: 'tier'; seat: SeatId; greatWork: string; tier: number; gains: Gains }
  /** R13 `toll`: coins for neighbours' Builds. */
  | { type: 'toll'; seat: SeatId; coins: number; from: SeatId[] }
  /** R4.5.4: Yield (yield + income). */
  | { type: 'yield'; seat: SeatId; gains: Gains }
  /** R9.3-R9.5: a town's Raid result. */
  | {
      type: 'raid';
      seat: SeatId;
      raid: string;
      outcome: RaidOutcome;
      guard: number;
      strength: number;
      /** Valour gained (0 if plundered). */
      valour: number;
      /** Coins lost to plunder (0 if held). */
      lost: number;
    }
  /** R9.6: a plundered town pays a neighbour that held. */
  | { type: 'bounty'; from: SeatId; to: SeatId; coins: number }
  /** R13 heldBonus. */
  | { type: 'heldBonus'; seat: SeatId; gains: Gains }
  /** R3.6 `seasonEnd` effects. */
  | { type: 'seasonEnd'; seat: SeatId; gains: Gains }
  /** R11.3: an Honour's leaders changed (empty = nobody leads, R11.2). */
  | { type: 'honour'; honour: string; leaders: SeatId[]; was: SeatId[]; best: number };

export type WwEventType = WwEvent['type'];

export const EVENT_TYPES: readonly WwEventType[] = [
  'greatWork',
  'raidRevealed',
  'spend',
  'glean',
  'burn',
  'pay',
  'trade',
  'build',
  'tier',
  'toll',
  'yield',
  'raid',
  'bounty',
  'heldBonus',
  'seasonEnd',
  'honour',
];

/** The seat a log entry is about: the actor (the seller for a trade, the taker for a bounty). */
function actor(e: WwEvent): SeatId | null {
  switch (e.type) {
    case 'raidRevealed':
    case 'honour':
      return null;
    case 'trade':
      return e.seller;
    case 'bounty':
      return e.to;
    default:
      return e.seat;
  }
}

/** E8: the other seats an entry involves (who bought, who paid, who leads), actor not repeated. */
function targets(e: WwEvent): SeatId[] {
  switch (e.type) {
    case 'trade':
      return [e.buyer];
    case 'bounty':
      return [e.from];
    case 'toll':
      return e.from;
    case 'pay':
      return [...new Set(e.buys.map((b) => b.from))];
    case 'honour':
      return e.leaders;
    default:
      return [];
  }
}

/**
 * Record an event (public unless `to` limits it to some seats). `text` names its seats as
 * pieces (E8, `named`), so a client can say "You".
 */
export function emit(
  ctx: Ctx<WwSeat, WwTable>,
  event: WwEvent,
  text: readonly LogPart[],
  to?: SeatId[],
): void {
  ctx.log(actor(event), event.type, text, {
    data: event as unknown as Json,
    targets: targets(event),
    ...(to ? { to } : {}),
  });
}

/** A town's coins, labour and store, to measure what a step gave it. */
export interface Holdings {
  coins: number;
  labour: number;
  store: Record<GoodId, number>;
}

export function holdings(town: WwSeat): Holdings {
  return { coins: town.coins, labour: town.labour, store: { ...town.store } };
}

/** What changed from `before` to `after`, as gains (nonzero entries; may be negative). */
export function gained(before: Holdings, after: Holdings): Gains {
  const out: Gains = {};
  for (const [g, n] of Object.entries(after.store)) {
    const d = n - (before.store[g] ?? 0);
    if (d !== 0) out[g] = d;
  }
  if (after.coins !== before.coins) out.coins = after.coins - before.coins;
  if (after.labour !== before.labour) out.labour = after.labour - before.labour;
  return out;
}

export const isEmpty = (g: Gains): boolean => Object.keys(g).length === 0;

/** A log entry that is a Windamere event, with its typed event. */
export interface WwEventEntry {
  seq: number;
  round: number;
  turn: number;
  text: string;
  /** E8: the line in pieces, for `logText(entry, viewer)`; absent when it names no seat. */
  parts?: LogPart[];
  /** E8: the other seats it involves (the entry's `seat` is the event's actor). */
  targets?: SeatId[];
  event: WwEvent;
}

const isEvent = (e: LogEntry) => (EVENT_TYPES as readonly string[]).includes(e.kind);

/** Every Windamere event in the state's (or view's) log, in order. */
export function eventsOf(state: WwState): WwEventEntry[] {
  return state.log.filter(isEvent).map((e) => ({
    seq: e.seq,
    round: e.round,
    turn: e.turn,
    text: e.text,
    ...(e.parts ? { parts: e.parts } : {}),
    ...(e.targets ? { targets: e.targets } : {}),
    event: e.data as unknown as WwEvent,
  }));
}

/**
 * The events of the latest action that produced any (a reveal and its resolution, a Season
 * end, the Great Work choice): what ui animates. Works on views.
 */
export function latestEvents(state: WwState): WwEventEntry[] {
  const last = state.log.at(-1);
  return last ? eventsOf(state).filter((e) => e.seq === last.seq) : [];
}
