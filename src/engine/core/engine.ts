/**
 * The draft engine bound to one ruleset (docs/ENGINE.md §2, §6). Pure: no input is mutated, all
 * randomness comes from `state.rng`.
 */
import { checkRuleset } from './effects';
import { cloneJson, cloneState, isJson } from './clone';
import { makeCtx } from './ctx';
import {
  afterStage,
  allPicked,
  continueAfter,
  deal,
  openGroup,
  openHead,
  resolveOrder,
  reveal,
  totalRounds,
} from './flow';
import { checkInvariants } from './invariants';
import { Rng } from './rng';
import { isSeat } from './seats';
import type {
  ActionResult,
  DraftAction,
  DraftState,
  DraftView,
  GameConfig,
  Json,
  Pick,
  Ruleset,
  SeatId,
  Viewer,
} from './types';
import { isDraftView, viewFor } from './view';

export interface DraftEngine<S, T> {
  readonly ruleset: Ruleset<S, T>;
  validateConfig(config: GameConfig): string | null;
  createGame(config: GameConfig): DraftState<S, T>;
  applyAction(state: DraftState<S, T>, action: DraftAction): ActionResult<S, T>;
  legalActions(state: DraftState<S, T>, seat?: SeatId): DraftAction[];
  legalPicks(state: DraftState<S, T>, seat: SeatId): Pick[];
  defaultPick(state: DraftState<S, T>, seat: SeatId): Pick | null;
  defaultAction(state: DraftState<S, T>, seat: SeatId): DraftAction | null;
  waitingOn(state: DraftState<S, T>): SeatId[];
  viewFor(state: DraftState<S, T>, viewer: Viewer): DraftView<S, T>;
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Bind the core to a ruleset. Throws if `checkRuleset` finds problems. */
export function createDraftEngine<S, T>(rules: Ruleset<S, T>): DraftEngine<S, T> {
  const problems = checkRuleset(rules);
  if (problems.length > 0) throw new Error(`ruleset ${rules.id}: ${problems.join('; ')}`);

  function validateConfig(config: GameConfig): string | null {
    if (!isRecord(config)) return 'config is not an object';
    const { seed, seats, options } = config;
    if (
      typeof seed === 'number' ? !Number.isFinite(seed) : typeof seed !== 'string' || seed === ''
    ) {
      return 'seed must be a finite number or a non-empty string';
    }
    if (!Array.isArray(seats)) return 'seats must be an array';
    if (seats.length < rules.minSeats || seats.length > rules.maxSeats) {
      return `${seats.length} seats; this game takes ${rules.minSeats}-${rules.maxSeats}`;
    }
    for (const [i, s] of seats.entries()) {
      if (!isRecord(s) || typeof s.name !== 'string' || s.name.trim() === '') {
        return `seat ${i} needs a name`;
      }
    }
    if (options !== undefined) {
      if (!isRecord(options) || !isJson(options)) return 'options must be a JSON object';
      const err = rules.validateOptions?.(options);
      if (err) return err;
    }
    const rounds = totalRounds(rules, config);
    if (!Number.isInteger(rounds) || rounds < 1)
      return `rounds must be a positive integer, got ${rounds}`;
    return null;
  }

  function createGame(input: GameConfig): DraftState<S, T> {
    const err = validateConfig(input);
    if (err) throw new Error(`createGame: ${err}`);
    const config = cloneJson(input);
    const rng = Rng.fromSeed(config.seed);
    const zoneNames = Object.keys(rules.zones ?? {});
    const draft: DraftState<S, T> = {
      schemaVersion: 1,
      ruleset: { id: rules.id, version: rules.version },
      config,
      seq: 0,
      round: 0,
      turn: 0,
      roundPicks: 0,
      passDirection: 'left',
      phase: { kind: 'pick' },
      seats: config.seats.map((s, id) => ({
        id,
        name: s.name,
        hand: [],
        pick: null,
        tableau: [],
        zones: Object.fromEntries(zoneNames.map((z) => [z, []])),
        recall: [],
        data: null as S,
      })),
      deck: [],
      discard: [],
      box: [],
      table: null as T,
      prompts: [],
      nextCardId: 0,
      nextPromptId: 0,
      lastReveal: null,
      log: [],
      rng: rng.state,
      result: null,
    };
    const ctx = makeCtx(rules, draft, rng);
    draft.table = rules.setupTable(ctx);
    for (const s of draft.seats) s.data = rules.setupSeat(ctx, s.id);
    ctx.log(null, 'start', `Game started with ${draft.seats.length} players.`);
    if (rules.startBeforeDeal !== true) deal(ctx, 0);
    rules.onGameStart?.(ctx);
    afterStage(ctx, 'start'); // with startBeforeDeal, round 0 is dealt once start prompts end
    draft.rng = rng.state;
    assertInvariants(draft);
    return draft;
  }

  /**
   * The pick `applyAction` would store for `seat` now (only `card`, `use`, `args`, after
   * `ruleset.normalizePick`), or why it is not acceptable. Works on a view for the viewer.
   */
  function acceptPick(
    state: DraftState<S, T>,
    seat: SeatId,
    pick: unknown,
  ): { pick: Pick } | { error: string } {
    if (state.phase.kind !== 'pick') return { error: 'not the pick phase' };
    if (!isRecord(pick)) return { error: 'pick must be an object' };
    const { card, use, args } = pick;
    if (typeof card !== 'number' || !Number.isInteger(card)) {
      return { error: 'pick.card must be a card id' };
    }
    if (typeof use !== 'string' || use === '') return { error: 'pick.use must be a string' };
    if (args !== undefined && !isJson(args)) return { error: 'pick.args must be JSON' };
    const s = state.seats[seat];
    if (!s || s.hand.length === 0) return { error: 'you hold no cards' };
    if (!s.hand.some((c) => c.id === card)) return { error: `card ${card} is not in your hand` };
    const clean: Pick = { card, use, ...(args !== undefined ? { args: cloneJson(args) } : {}) };
    const normal = rules.normalizePick ? rules.normalizePick(state, seat, clean) : clean;
    if (normal.card !== card || normal.use !== use) {
      throw new Error(`ruleset ${rules.id}: normalizePick changed the card or use`);
    }
    if (normal.args !== undefined && !isJson(normal.args)) {
      throw new Error(`ruleset ${rules.id}: normalizePick returned non-JSON args`);
    }
    const err = rules.validatePick(state, seat, normal);
    return err ? { error: err } : { pick: normal };
  }

  /** Why `pick` is not acceptable for `seat` now, or null. */
  function checkPick(state: DraftState<S, T>, seat: SeatId, pick: unknown): string | null {
    const r = acceptPick(state, seat, pick);
    return 'error' in r ? r.error : null;
  }

  function applyAction(state: DraftState<S, T>, action: DraftAction): ActionResult<S, T> {
    if (state.ruleset.id !== rules.id) {
      throw new Error(`state of ruleset ${state.ruleset.id}, engine of ${rules.id}`);
    }
    if (isDraftView(state)) throw new Error('applyAction: got a view, not a state');
    if (!isRecord(action)) return fail('action must be an object');
    const seat = action.seat;
    if (!isSeat(state, seat)) return fail(`invalid seat: ${String(seat)}`);
    if (state.phase.kind === 'gameOver') return fail('game is over');

    const draft = cloneState(state);
    const rng = new Rng(draft.rng);
    const ctx = makeCtx(rules, draft, rng);
    const me = draft.seats[seat];
    if (!me) return fail(`invalid seat: ${seat}`);

    switch (action.type) {
      case 'pick': {
        const r = acceptPick(draft, seat, action.pick);
        if ('error' in r) return fail(r.error);
        draft.seq += 1;
        me.pick = r.pick;
        if (allPicked(draft)) reveal(ctx);
        break;
      }
      case 'unpick': {
        if (draft.phase.kind !== 'pick') return fail('not the pick phase');
        if (me.pick === null) return fail('nothing to unpick');
        draft.seq += 1;
        me.pick = null;
        break;
      }
      case 'answer': {
        const phase = draft.phase;
        const open = openGroup(draft as DraftState<unknown, unknown>);
        if (phase.kind !== 'prompt' || open.length === 0) return fail('no prompt is open');
        const p = open.find((x) => x.id === action.prompt);
        if (!p) return fail(`prompt ${String(action.prompt)} is not open`);
        if (seat !== p.seat) return fail('the open prompt is not yours');
        if (!isJson(action.answer)) return fail('answer must be JSON');
        const handler = rules.prompts[p.kind];
        if (!handler) throw new Error(`unknown prompt kind: ${p.kind}`);
        const err = handler.validate(draft, p, action.answer);
        if (err) return fail(err);
        draft.seq += 1;
        // Hidden until the group is complete; a seat may answer again until then.
        p.answer = cloneJson(action.answer);
        p.answered = true;
        if (!open.every((x) => x.answered)) break;
        // The whole group applies at once, in resolve order: arrival order never matters.
        draft.prompts.splice(0, open.length);
        for (const s of resolveOrder(rules, draft)) {
          for (const q of open) {
            if (q.seat !== s) continue;
            const h = rules.prompts[q.kind];
            if (!h) throw new Error(`unknown prompt kind: ${q.kind}`);
            h.apply(ctx, q, q.answer);
          }
        }
        if (draft.prompts.length === 0) continueAfter(ctx, phase.then);
        else openHead(ctx);
        break;
      }
      default:
        return fail(`unknown action type: ${String((action as { type?: unknown }).type)}`);
    }
    draft.rng = rng.state;
    assertInvariants(draft);
    return { ok: true, state: draft };
  }

  /** On a view only the viewer's own seat is known well enough to list its moves. */
  const knows = (state: DraftState<S, T>, seat: SeatId) =>
    !isDraftView(state) || state.view.viewer === seat;

  function legalPicks(state: DraftState<S, T>, seat: SeatId): Pick[] {
    const s = state.seats[seat];
    if (state.phase.kind !== 'pick' || !s || s.hand.length === 0 || !knows(state, seat)) return [];
    return rules.legalPicks(state, seat).filter((p) => checkPick(state, seat, p) === null);
  }

  /** The seat's prompt in the open group, if any. */
  function openPromptOf(state: DraftState<S, T>, seat: SeatId) {
    if (state.phase.kind !== 'prompt') return undefined;
    return openGroup(state as DraftState<unknown, unknown>).find((p) => p.seat === seat);
  }

  function legalAnswers(state: DraftState<S, T>, seat: SeatId): DraftAction[] {
    const p = openPromptOf(state, seat);
    const handler = p && rules.prompts[p.kind];
    if (!p || !handler) return [];
    return handler
      .answers(state, p)
      .filter((a) => handler.validate(state, p, a) === null)
      .map((answer) => ({ type: 'answer', seat, prompt: p.id, answer }));
  }

  function legalActions(state: DraftState<S, T>, seat?: SeatId): DraftAction[] {
    if (state.phase.kind === 'gameOver') return [];
    const seats = seat === undefined ? state.seats.map((s) => s.id) : [seat];
    const out: DraftAction[] = [];
    for (const s of seats) {
      if (!state.seats[s] || !knows(state, s)) continue;
      if (state.phase.kind === 'pick') {
        for (const pick of legalPicks(state, s)) out.push({ type: 'pick', seat: s, pick });
        if (state.seats[s]?.pick) out.push({ type: 'unpick', seat: s });
      } else {
        out.push(...legalAnswers(state, s));
      }
    }
    return out;
  }

  function defaultPick(state: DraftState<S, T>, seat: SeatId): Pick | null {
    const legal = legalPicks(state, seat);
    if (legal.length === 0) return null;
    const preferred = rules.defaultPick?.(state, seat);
    if (preferred && checkPick(state, seat, preferred) === null) return preferred;
    return legal[0] ?? null;
  }

  function waitingOn(state: DraftState<S, T>): SeatId[] {
    switch (state.phase.kind) {
      case 'gameOver':
        return [];
      case 'prompt':
        return openGroup(state as DraftState<unknown, unknown>)
          .filter((p) => !p.answered)
          .map((p) => p.seat);
      case 'pick': {
        const submitted = (i: number) =>
          isDraftView(state) ? state.view.submitted[i] === true : state.seats[i]?.pick !== null;
        return state.seats.filter((s) => s.hand.length > 0 && !submitted(s.id)).map((s) => s.id);
      }
    }
  }

  function defaultAction(state: DraftState<S, T>, seat: SeatId): DraftAction | null {
    if (!waitingOn(state).includes(seat)) return null;
    if (state.phase.kind === 'pick') {
      const pick = defaultPick(state, seat);
      return pick ? { type: 'pick', seat, pick } : null;
    }
    const p = openPromptOf(state, seat);
    const handler = p && rules.prompts[p.kind];
    if (!p || !handler) return null;
    const answers = legalAnswers(state, seat);
    const preferred: Json | undefined = handler.defaultAnswer?.(state, p);
    if (preferred !== undefined && handler.validate(state, p, preferred) === null) {
      return { type: 'answer', seat, prompt: p.id, answer: preferred };
    }
    return answers[0] ?? null;
  }

  return {
    ruleset: rules,
    validateConfig,
    createGame,
    applyAction,
    legalActions,
    legalPicks,
    defaultPick,
    defaultAction,
    waitingOn,
    viewFor: (state, viewer) => viewFor(rules, state, viewer),
  };
}

/** Ruleset code broke a core invariant: a bug, not a bad action. */
function assertInvariants(state: DraftState<unknown, unknown>): void {
  const errors = checkInvariants(state);
  if (errors.length > 0) throw new Error(`engine invariant broken: ${errors.join('; ')}`);
}
