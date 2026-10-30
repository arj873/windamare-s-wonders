/**
 * Test helpers for the Windamere unchanged systems. Test-only, like fixture.ts. Until the turn
 * structure exists (D2c) `createGame` cannot run, so `newWwGame` builds the same starting state
 * by hand: setup, then `onRoundStart(0)`, with empty hands.
 */
import {
  Rng,
  type Card,
  type CardDefId,
  type CardId,
  type Ctx,
  type Pick,
  type SeatId,
} from '../../core';
import { makeCtx } from '../../core/ctx';
import { placeBuild } from '../build';
import { compileContent, type WwRules } from '../content';
import { createWindamereEngine } from '../engine';
import { windamereRuleset } from '../ruleset';
import type { WwContent, WwSeat, WwState, WwTable } from '../types';
import { FIXTURE } from './fixture';

export const fx = compileContent(FIXTURE);
export const fxRuleset = windamereRuleset(fx);

export function newWwGame(seats = 3, seed: number | string = 1, rules: WwRules = fx): WwState {
  const ruleset = rules === fx ? fxRuleset : windamereRuleset(rules);
  const rng = Rng.fromSeed(seed);
  const state: WwState = {
    schemaVersion: 1,
    ruleset: { id: ruleset.id, version: ruleset.version },
    config: { seed, seats: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })) },
    seq: 0,
    round: 0,
    turn: 0,
    roundPicks: 4,
    passDirection: 'left',
    phase: { kind: 'pick' },
    seats: Array.from({ length: seats }, (_, id) => ({
      id,
      name: `P${id}`,
      hand: [],
      pick: null,
      tableau: [],
      zones: Object.fromEntries(Object.keys(ruleset.zones ?? {}).map((z) => [z, []])),
      data: null as unknown as WwSeat,
    })),
    deck: [],
    discard: [],
    box: [],
    table: null as unknown as WwTable,
    prompts: [],
    nextCardId: 0,
    nextPromptId: 0,
    lastReveal: null,
    log: [],
    rng: rng.state,
    result: null,
  };
  const ctx = makeCtx(ruleset, state, rng);
  state.table = ruleset.setupTable(ctx);
  for (const s of state.seats) s.data = ruleset.setupSeat(ctx, s.id);
  ruleset.onRoundStart?.(ctx, 0);
  state.rng = rng.state;
  return state;
}

/** A ctx over `state` itself (tests mutate their own states freely). */
export function ctxOf(state: WwState, rules: WwRules = fx): Ctx<WwSeat, WwTable> {
  return makeCtx(rules === fx ? fxRuleset : windamereRuleset(rules), state, new Rng(state.rng));
}

export function townData(state: WwState, seat: SeatId): WwSeat {
  const s = state.seats[seat];
  if (!s) throw new Error(`no seat ${seat}`);
  return s.data;
}

/** Place a Build (no payment: that is the turn structure), covering `cover` if given. */
export function build(
  state: WwState,
  seat: SeatId,
  def: CardDefId,
  cover: CardId | null = null,
): Card {
  const card = { id: state.nextCardId++, def };
  placeBuild(fx, ctxOf(state), seat, card, cover);
  return card;
}

export function setGreatWork(state: WwState, seat: SeatId, id: string): void {
  townData(state, seat).greatWork = id;
}

/** Move to Season `season` the way the flow would: its Raid is revealed (R3.2). */
export function toSeason(state: WwState, season: number): void {
  const ctx = ctxOf(state);
  for (let r = state.round + 1; r <= season; r++) fxRuleset.onRoundStart?.(ctx, r);
  state.round = season;
}

/** The real engine over the test fixture (the turn, R3-R6). */
export const fxEngine = createWindamereEngine(FIXTURE);

/** A new game in the Great Work choice (R2.4, R2.5): no hands yet. */
export function atChoice(seats = 3, seed: number | string = 1): WwState {
  return fxEngine.createGame({
    seed,
    seats: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })),
  });
}

/** A new game at its first pick: every town took its first offered Great Work. */
export function newGame(seats = 3, seed: number | string = 1): WwState {
  let s = atChoice(seats, seed);
  while (s.phase.kind === 'prompt') {
    const seat = fxEngine.waitingOn(s)[0];
    const action = seat === undefined ? null : fxEngine.defaultAction(s, seat);
    if (!action) throw new Error('newGame: stuck in the Great Work choice');
    const r = fxEngine.applyAction(s, action);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

/** Give the seat's hand these faces (the dealt ids stay; only faces change). Mutates `state`. */
export function setHand(state: WwState, seat: SeatId, defs: CardDefId[]): Card[] {
  const hand = state.seats[seat]?.hand ?? [];
  if (defs.length > hand.length) throw new Error('setHand: more faces than cards');
  defs.forEach((def, i) => {
    const c = hand[i];
    if (c) c.def = def;
  });
  return hand;
}

/** The first card with face `def` in the seat's hand. */
export function inHand(state: WwState, seat: SeatId, def: CardDefId): Card {
  const c = state.seats[seat]?.hand.find((x) => x.def === def);
  if (!c) throw new Error(`seat ${seat} holds no ${def}`);
  return c;
}

/** Every seat picks (the given pick, else the default pick); returns the state after the reveal. */
export function playTurn(state: WwState, picks: Partial<Record<SeatId, Pick>> = {}): WwState {
  let s = state;
  for (const seat of fxEngine.waitingOn(s)) {
    const pick = picks[seat] ?? fxEngine.defaultPick(s, seat);
    if (!pick) throw new Error(`seat ${seat} has no pick`);
    const r = fxEngine.applyAction(s, { type: 'pick', seat, pick });
    if (!r.ok) throw new Error(`seat ${seat}: ${r.error}`);
    s = r.state;
  }
  return s;
}

/** The fixture with some fields replaced (e.g. tunables). */
export function fixtureWith(over: Partial<WwContent>): WwRules {
  return compileContent({ ...FIXTURE, ...over });
}
