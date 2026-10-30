/**
 * The draft flow (docs/ENGINE.md §5): deal, reveal + step-major resolution, passing, round end,
 * game end. Everything here runs on applyAction's draft through its Ctx.
 */
import { range } from '../../shared';
import { effectsOf, findDef } from './effects';
import { locate } from './invariants';
import { passTarget } from './seats';
import type {
  Card,
  Ctx,
  DraftState,
  GameConfig,
  GameResult,
  Prompt,
  PromptStage,
  RevealedPick,
  Ruleset,
  SeatId,
  SeatScore,
} from './types';

export function totalRounds<S, T>(rules: Ruleset<S, T>, config: GameConfig): number {
  return typeof rules.rounds === 'number' ? rules.rounds : rules.rounds(config);
}

/** Seats in resolution order: the ruleset's order, checked to be a permutation of all seats. */
export function resolveOrder<S, T>(rules: Ruleset<S, T>, state: DraftState<S, T>): SeatId[] {
  const n = state.seats.length;
  const order = rules.resolveOrder ? rules.resolveOrder(state) : range(n);
  const sorted = [...order].sort((a, b) => a - b);
  if (sorted.length !== n || sorted.some((s, i) => s !== i)) {
    throw new Error(`resolveOrder is not a permutation of the seats: ${JSON.stringify(order)}`);
  }
  return order;
}

/** Deal `round`: the previous round's undealt cards go to the box. */
export function deal<S, T>(ctx: Ctx<S, T>, round: number): void {
  const { state: draft, rules } = ctx;
  const n = draft.seats.length;
  rules.onRoundStart?.(ctx, round);
  const spec = rules.roundSpec(draft, round);
  const { handSize, picks, pass, deck } = spec;
  if (!Number.isInteger(handSize) || handSize < 1)
    throw new Error(`round ${round}: handSize ${handSize}`);
  if (!Number.isInteger(picks) || picks < 1 || picks > handSize) {
    throw new Error(`round ${round}: picks ${picks} not in 1..${handSize}`);
  }
  if (pass !== 'left' && pass !== 'right') throw new Error(`round ${round}: pass ${String(pass)}`);
  if (deck.length < handSize * n) {
    throw new Error(`round ${round}: deck of ${deck.length} < ${handSize} x ${n} seats`);
  }
  for (const def of deck)
    if (!findDef(rules, def)) throw new Error(`round ${round}: unknown card ${def}`);
  for (const s of draft.seats) {
    if (s.hand.length > 0) throw new Error(`round ${round}: seat ${s.id} still holds cards`);
  }

  draft.box.push(...draft.deck.splice(0));
  const cards = ctx.rng.shuffle(deck).map((def) => ({ id: draft.nextCardId++, def }));
  draft.seats.forEach((s, i) => {
    s.hand = cards.slice(i * handSize, (i + 1) * handSize);
  });
  draft.deck = cards.slice(n * handSize);
  draft.round = round;
  draft.turn = 0;
  draft.roundPicks = picks;
  draft.passDirection = pass;
  ctx.log(null, 'deal', `Round ${round + 1} begins: ${handSize} cards each, hands pass ${pass}.`, {
    data: { round, handSize, picks, pass },
  });
}

/** All seats with cards have picked. */
export function allPicked(state: DraftState<unknown, unknown>): boolean {
  return state.seats.every((s) => s.hand.length === 0 || s.pick !== null);
}

/** Reveal every pick and resolve them, then move on (docs/ENGINE.md §5 steps 1-5). */
export function reveal<S, T>(ctx: Ctx<S, T>): void {
  const { state: draft, rules } = ctx;
  const picks: RevealedPick[] = [];
  for (const s of draft.seats) {
    if (s.pick === null) continue;
    const { card: id, use, args } = s.pick;
    const i = s.hand.findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`seat ${s.id} picked card ${id} not in hand`);
    const card = s.hand.splice(i, 1)[0] as Card;
    picks.push({ seat: s.id, card, use, ...(args !== undefined ? { args } : {}) });
    s.pick = null;
  }
  draft.lastReveal = { round: draft.round, turn: draft.turn, picks };
  ctx.log(null, 'reveal', `Round ${draft.round + 1}, pick ${draft.turn + 1}: cards revealed.`, {
    data: picks.map((p) => ({ seat: p.seat, card: p.card.def, use: p.use })),
  });

  if (draft.turn === draft.roundPicks - 1) {
    for (const s of draft.seats) {
      const left = s.hand.splice(0);
      if (left.length === 0) continue;
      if (rules.onLeftovers) {
        rules.onLeftovers(ctx, s.id, left);
        continue;
      }
      draft.discard.push(...left);
      ctx.log(s.id, 'leftovers', `${s.name} discards ${left.length} leftover card(s).`);
    }
  }

  const bySeat = new Map(picks.map((p) => [p.seat, p]));
  const order = resolveOrder(rules, draft);
  for (const step of rules.resolve) {
    for (const seat of order) {
      const p = bySeat.get(seat);
      if (p)
        step(
          ctx,
          seat,
          { card: p.card.id, use: p.use, ...(p.args !== undefined ? { args: p.args } : {}) },
          p.card,
        );
    }
  }
  for (const p of picks) {
    if (locate(draft as DraftState<unknown, unknown>, p.card.id) === null) {
      throw new Error(
        `resolve steps left seat ${p.seat}'s card ${p.card.id} (${p.card.def}) nowhere`,
      );
    }
  }
  afterStage(ctx, 'turn');
}

/** Open the prompt phase if prompts are queued, else continue the flow. */
export function afterStage<S, T>(ctx: Ctx<S, T>, stage: PromptStage): void {
  if (ctx.state.prompts.length > 0) {
    ctx.state.phase = { kind: 'prompt', then: stage };
    openHead(ctx);
  } else {
    continueAfter(ctx, stage);
  }
}

/** The open group: the queue's head and the prompts of its group (they are queued together). */
export function openGroup(state: DraftState<unknown, unknown>): Prompt[] {
  const head = state.prompts[0];
  return head ? state.prompts.filter((p) => p.group === head.group) : [];
}

/** The head group is now the open one: let each prompt's handler refresh its data. */
export function openHead<S, T>(ctx: Ctx<S, T>): void {
  for (const p of openGroup(ctx.state as DraftState<unknown, unknown>)) {
    const refresh = ctx.rules.prompts[p.kind]?.refresh;
    if (refresh) p.data = refresh(ctx.state, p);
  }
}

/** The flow after `stage` and its prompts are done. */
export function continueAfter<S, T>(ctx: Ctx<S, T>, stage: PromptStage): void {
  const draft = ctx.state;
  switch (stage) {
    case 'start':
      // `startBeforeDeal`: the start prompts came before the first deal (docs/ENGINE.md §5).
      if (ctx.rules.startBeforeDeal === true) deal(ctx, 0);
      enterPick(ctx);
      return;
    case 'turn':
      if (draft.turn + 1 < draft.roundPicks) {
        passHands(ctx);
        draft.turn += 1;
        enterPick(ctx);
      } else {
        roundEnd(ctx);
      }
      return;
    case 'roundEnd':
      if (draft.round + 1 < totalRounds(ctx.rules, draft.config)) {
        deal(ctx, draft.round + 1);
        enterPick(ctx);
      } else {
        gameEnd(ctx);
      }
      return;
  }
}

/** Pick phase, or round end if no seat holds a card (a ruleset took them all). */
function enterPick<S, T>(ctx: Ctx<S, T>): void {
  if (ctx.state.seats.every((s) => s.hand.length === 0)) roundEnd(ctx);
  else ctx.state.phase = { kind: 'pick' };
}

function passHands<S, T>(ctx: Ctx<S, T>): void {
  const draft = ctx.state;
  const hands = draft.seats.map((s) => s.hand);
  draft.seats.forEach((s, i) => {
    const target = passTarget(draft, s.id);
    const hand = hands[i] ?? [];
    // Recall: the seat saw this hand as it passed it on (copies; the cards move on).
    if (ctx.rules.recall === true && hand.length > 0) {
      s.recall.push({ turn: draft.turn, to: target, cards: hand.map((c) => ({ ...c })) });
    }
    const to = draft.seats[target];
    if (to) to.hand = hand;
  });
  ctx.log(null, 'pass', `Hands pass ${draft.passDirection}.`);
}

function roundEnd<S, T>(ctx: Ctx<S, T>): void {
  const { state: draft, rules } = ctx;
  ctx.log(null, 'roundEnd', `Round ${draft.round + 1} ends.`);
  for (const s of draft.seats) s.recall = [];
  rules.onRoundEnd?.(ctx);
  for (const s of draft.seats) {
    for (const spec of effectsOf(rules, draft, s.id))
      rules.effects[spec.type]?.onRoundEnd?.(ctx, s.id, spec);
  }
  afterStage(ctx, 'roundEnd');
}

function gameEnd<S, T>(ctx: Ctx<S, T>): void {
  const { state: draft, rules } = ctx;
  const result = scoreGame(rules, draft);
  draft.result = result;
  draft.phase = { kind: 'gameOver' };
  const names = result.winners.map((s) => draft.seats[s]?.name ?? `seat ${s}`).join(' and ');
  ctx.log(null, 'gameOver', `Game over: ${names} ${result.winners.length > 1 ? 'tie' : 'wins'}.`, {
    data: { winners: result.winners },
  });
}

/** b before a: > 0; element by element, higher first. Lengths are equal (checked). */
function compareTiebreaks(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Final scores and ranking: total desc, then tiebreaks desc in order; equal seats share a group. */
export function scoreGame<S, T>(rules: Ruleset<S, T>, state: DraftState<S, T>): GameResult {
  const scores: SeatScore[] = state.seats.map((s) => {
    const categories = rules.score(state, s.id);
    let total = 0;
    for (const [k, v] of Object.entries(categories)) {
      if (!Number.isFinite(v)) throw new Error(`seat ${s.id} score ${k} is ${v}`);
      total += v;
    }
    const tiebreak = [...(rules.tiebreak?.(state, s.id) ?? [])];
    if (!tiebreak.every(Number.isFinite)) {
      throw new Error(`seat ${s.id} tiebreak is ${JSON.stringify(tiebreak)}`);
    }
    return { seat: s.id, categories: { ...categories }, total, tiebreak };
  });
  const len = scores[0]?.tiebreak.length ?? 0;
  if (scores.some((sc) => sc.tiebreak.length !== len)) {
    throw new Error('tiebreak lists differ in length between seats');
  }
  const order = (a: SeatScore, b: SeatScore) =>
    b.total - a.total || compareTiebreaks(a.tiebreak, b.tiebreak);
  const sorted = [...scores].sort((a, b) => order(a, b) || a.seat - b.seat);
  const ranking: SeatId[][] = [];
  let prev: SeatScore | null = null;
  for (const sc of sorted) {
    if (prev && order(prev, sc) === 0) ranking[ranking.length - 1]?.push(sc.seat);
    else ranking.push([sc.seat]);
    prev = sc;
  }
  return { scores, ranking, winners: [...(ranking[0] ?? [])] };
}
