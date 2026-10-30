import { describe, expect, it } from 'vitest';
import { checkRuleset, effectsOf } from './effects';
import { createDraftEngine } from './engine';
import { checkInvariants } from './invariants';
import {
  act,
  deepFreeze,
  newToyGame,
  pick,
  pickAll,
  sellFirst,
  toy,
  toyConfig,
  withHand,
} from './testing/helpers';
import { toyRuleset, TOY_HAND, type ToySeat, type ToyState, type ToyTable } from './testing/toy';
import type { DraftAction, Ruleset } from './types';

const variant = (over: Partial<Ruleset<ToySeat, ToyTable>>) =>
  createDraftEngine({ ...toyRuleset, ...over });

/** Play whole turns (everyone sells) until the phase or round changes `n` times. */
function sellTurns(state: ToyState, n: number): ToyState {
  let s = state;
  for (let i = 0; i < n; i++) s = pickAll(s);
  return s;
}

describe('createGame', () => {
  it('deals round 0 and waits for every seat to pick', () => {
    const s = newToyGame(3);
    expect(s.schemaVersion).toBe(1);
    expect(s.ruleset).toEqual({ id: 'toy', version: 1 });
    expect(s.phase).toEqual({ kind: 'pick' });
    expect([s.seq, s.round, s.turn, s.roundPicks, s.passDirection]).toEqual([0, 0, 0, 3, 'left']);
    expect(s.seats.map((x) => x.hand.length)).toEqual([TOY_HAND, TOY_HAND, TOY_HAND]);
    expect(s.deck).toHaveLength(2);
    expect(s.nextCardId).toBe(14);
    expect(s.seats.map((x) => x.data)).toEqual([0, 1, 2].map(() => ({ coins: 2, opening: null })));
    expect(toy.waitingOn(s)).toEqual([0, 1, 2]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('assigns ids after the shuffle, in deal order', () => {
    const s = newToyGame(3);
    expect(s.seats[0]!.hand.map((c) => c.id)).toEqual([0, 1, 2, 3]);
    expect(s.seats[2]!.hand.map((c) => c.id)).toEqual([8, 9, 10, 11]);
    expect(s.deck.map((c) => c.id)).toEqual([12, 13]);
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(newToyGame(4, undefined, 'a')).toEqual(newToyGame(4, undefined, 'a'));
    const faces = (seed: number) =>
      newToyGame(4, undefined, seed).seats.map((x) => x.hand.map((c) => c.def));
    expect(
      new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(faces(seed)))).size,
    ).toBeGreaterThan(1);
  });

  it('is plain JSON', () => {
    const s = newToyGame(3);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('does not keep a reference to the caller config', () => {
    const config = toyConfig(3);
    const s = toy.createGame(config);
    config.seats[0]!.name = 'changed';
    expect(s.config.seats[0]!.name).toBe('P0');
  });

  it('validates the config', () => {
    expect(toy.validateConfig(toyConfig(3))).toBeNull();
    expect(toy.validateConfig(toyConfig(1))).toMatch(/2-5/);
    expect(toy.validateConfig(toyConfig(6))).toMatch(/2-5/);
    expect(toy.validateConfig({ seed: Number.NaN, seats: toyConfig(3).seats })).toMatch(/seed/);
    expect(toy.validateConfig({ seed: '', seats: toyConfig(3).seats })).toMatch(/seed/);
    expect(toy.validateConfig({ seed: 1, seats: [{ name: 'a' }, { name: ' ' }] })).toMatch(
      /seat 1/,
    );
    expect(toy.validateConfig(toyConfig(3, { rounds: -1 }))).toMatch(/rounds/);
    expect(toy.validateConfig(toyConfig(3, { rounds: 0 }))).toMatch(/rounds/);
    expect(() => toy.createGame(toyConfig(1))).toThrow(/2-5/);
  });
});

describe('hidden simultaneous picks', () => {
  it('stores a pick without revealing it', () => {
    const s0 = newToyGame(3);
    const s1 = pick(s0, 0, sellFirst(s0, 0));
    expect(s1.seq).toBe(1);
    expect(s1.phase).toEqual({ kind: 'pick' });
    expect(s1.seats[0]!.pick).toEqual(sellFirst(s0, 0));
    expect(s1.seats[0]!.hand).toHaveLength(TOY_HAND);
    expect(toy.waitingOn(s1)).toEqual([1, 2]);
    expect(s1.lastReveal).toBeNull();
    const other = toy.viewFor(s1, 1);
    expect(other.seats[0]!.pick).toBeNull();
    expect(other.view.submitted).toEqual([true, false, false]);
    expect(toy.viewFor(s1, 0).seats[0]!.pick).toEqual(sellFirst(s0, 0));
  });

  it('lets a seat replace or withdraw its pick before the reveal', () => {
    const s0 = newToyGame(3);
    const hand = s0.seats[0]!.hand;
    const s1 = pick(s0, 0, { card: hand[0]!.id, use: 'sell' });
    const s2 = pick(s1, 0, { card: hand[1]!.id, use: 'stash' });
    expect(s2.seats[0]!.pick).toEqual({ card: hand[1]!.id, use: 'stash' });
    const s3 = act(s2, { type: 'unpick', seat: 0 });
    expect(s3.seats[0]!.pick).toBeNull();
    expect(toy.waitingOn(s3)).toEqual([0, 1, 2]);
    expect(toy.applyAction(s3, { type: 'unpick', seat: 0 })).toEqual({
      ok: false,
      error: 'nothing to unpick',
    });
  });

  it('reveals when the last seat picks, resolves step-major, passes left', () => {
    const s0 = newToyGame(3);
    const hands = s0.seats.map((x) => x.hand);
    const s1 = pickAll(s0);
    expect(s1.turn).toBe(1);
    expect(s1.seq).toBe(3);
    expect(s1.lastReveal).toEqual({
      round: 0,
      turn: 0,
      picks: [0, 1, 2].map((seat) => ({ seat, card: hands[seat]![0], use: 'sell' })),
    });
    // Hand of seat s goes to seat s + 1.
    expect(s1.seats[1]!.hand).toEqual(hands[0]!.slice(1));
    expect(s1.seats[2]!.hand).toEqual(hands[1]!.slice(1));
    expect(s1.seats[0]!.hand).toEqual(hands[2]!.slice(1));
    expect(s1.discard).toHaveLength(3);
    expect(s1.seats.map((x) => x.data.coins)).toEqual([4, 4, 4]);
    expect(s1.table.trace).toEqual(['pay:0', 'pay:1', 'pay:2', 'place:0', 'place:1', 'place:2']);
    expect(s1.seats.every((x) => x.pick === null)).toBe(true);
    expect(s1.log.map((e) => e.kind)).toContain('reveal');
  });

  it('follows the ruleset resolveOrder', () => {
    const e = variant({ resolveOrder: () => [2, 0, 1] });
    let s = e.createGame(toyConfig(3));
    for (const seat of [0, 1, 2]) {
      const r = e.applyAction(s, { type: 'pick', seat, pick: sellFirst(s, seat) });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s.table.trace).toEqual(['pay:2', 'pay:0', 'pay:1', 'place:2', 'place:0', 'place:1']);
  });

  it('rejects a resolveOrder that is not a permutation', () => {
    const e = variant({ resolveOrder: () => [0, 0, 1] });
    let s = e.createGame(toyConfig(3));
    const last = (seat: number) => () =>
      e.applyAction(s, { type: 'pick', seat, pick: sellFirst(s, seat) });
    for (const seat of [0, 1]) {
      const r = last(seat)();
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(last(2)).toThrow(/permutation/);
  });
});

describe('rounds', () => {
  it('discards leftovers on the last pick, boxes the undealt deck, deals the next round passing right', () => {
    const s = sellTurns(newToyGame(3), 3);
    expect(s.round).toBe(1);
    expect(s.turn).toBe(0);
    expect(s.passDirection).toBe('right');
    expect(s.seats.map((x) => x.hand.length)).toEqual([4, 4, 4]);
    expect(s.discard).toHaveLength(3 * 3 + 3);
    expect(s.box).toHaveLength(2);
    expect(s.deck).toHaveLength(2);
    expect(s.nextCardId).toBe(28);
    expect(s.seats.map((x) => x.data.coins)).toEqual([8, 8, 8]);
    expect(s.log.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['leftovers', 'roundEnd', 'deal']),
    );
    expect(checkInvariants(s)).toEqual([]);
  });

  it('passes right in round 1', () => {
    const s0 = sellTurns(newToyGame(3), 3);
    const hands = s0.seats.map((x) => x.hand);
    const s1 = pickAll(s0);
    // Hand of seat s goes to seat s - 1.
    expect(s1.seats[2]!.hand).toEqual(hands[0]!.slice(1));
    expect(s1.seats[0]!.hand).toEqual(hands[1]!.slice(1));
    expect(s1.seats[1]!.hand).toEqual(hands[2]!.slice(1));
  });

  it('ends the game after the last round with scores and a ranking', () => {
    const s = sellTurns(newToyGame(3), 6);
    expect(s.phase).toEqual({ kind: 'gameOver' });
    // 2 coins + 6 sales x 2 = 14 coins -> 4 treasury points each; all tied.
    expect(s.result?.scores.map((x) => x.total)).toEqual([4, 4, 4]);
    expect(s.result?.scores[0]).toEqual({
      seat: 0,
      categories: { treasury: 4, stash: 0 },
      total: 4,
      tiebreak: [14],
    });
    expect(s.result?.ranking).toEqual([[0, 1, 2]]);
    expect(s.result?.winners).toEqual([0, 1, 2]);
    expect(s.log.at(-1)?.kind).toBe('gameOver');
    expect(toy.applyAction(s, { type: 'unpick', seat: 0 })).toEqual({
      ok: false,
      error: 'game is over',
    });
    expect(toy.legalActions(s)).toEqual([]);
    expect(toy.waitingOn(s)).toEqual([]);
    expect(toy.defaultAction(s, 0)).toBeNull();
  });

  it('ranks by total, then tiebreaks in order; equal seats share a place', () => {
    const totals = [5, 7, 7, 3];
    const run = (tiebreaks: number[][]) => {
      const e = variant({
        score: (_s, seat) => ({ base: totals[seat]! }),
        tiebreak: (_s, seat) => tiebreaks[seat]!,
      });
      let s = e.createGame(toyConfig(4, { rounds: 1 }));
      while (s.phase.kind !== 'gameOver') {
        for (const seat of e.waitingOn(s)) {
          const r = e.applyAction(s, { type: 'pick', seat, pick: sellFirst(s, seat) });
          if (!r.ok) throw new Error(r.error);
          s = r.state;
        }
      }
      return s.result!;
    };
    expect(run([[0], [1], [1], [0]]).ranking).toEqual([[1, 2], [0], [3]]);
    expect(run([[0], [1], [1], [0]]).winners).toEqual([1, 2]);
    expect(run([[0], [1], [2], [0]]).ranking).toEqual([[2], [1], [0], [3]]);
    // The second tie-break decides only when the first is equal.
    expect(
      run([
        [0, 9],
        [1, 0],
        [1, 5],
        [0, 0],
      ]).ranking,
    ).toEqual([[2], [1], [0], [3]]);
    expect(
      run([
        [0, 0],
        [2, 0],
        [1, 9],
        [0, 0],
      ]).ranking,
    ).toEqual([[1], [2], [0], [3]]);
    expect(
      run([
        [0, 0],
        [1, 3],
        [1, 3],
        [0, 0],
      ]).ranking,
    ).toEqual([[1, 2], [0], [3]]);
    // No tiebreak: equal totals share a place.
    const e = variant({ score: (_s, seat) => ({ base: totals[seat]! }), tiebreak: undefined });
    let s = e.createGame(toyConfig(4, { rounds: 1 }));
    while (s.phase.kind !== 'gameOver') {
      for (const seat of e.waitingOn(s)) {
        const r = e.applyAction(s, { type: 'pick', seat, pick: sellFirst(s, seat) });
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
    }
    expect(s.result!.ranking).toEqual([[1, 2], [0], [3]]);
    expect(s.result!.scores[0]!.tiebreak).toEqual([]);
  });

  it('calls onRoundStart before each deal, round 0 included', () => {
    const seen: string[] = [];
    const e = variant({
      onRoundStart: (ctx, round) => {
        seen.push(`${round}:${ctx.state.seats[0]!.hand.length}`);
      },
    });
    let s = e.createGame(toyConfig(2, { rounds: 2 }));
    expect(seen).toEqual(['0:0']);
    while (s.round === 0) {
      for (const seat of e.waitingOn(s)) {
        const r = e.applyAction(s, { type: 'pick', seat, pick: sellFirst(s, seat) });
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
    }
    expect(seen).toEqual(['0:0', '1:0']);
  });
});

describe('card effects (data-driven)', () => {
  it('runs onPlay effects when a card is built', () => {
    const s0 = withHand(newToyGame(3), 0, ['toy-well', 'toy-mill', 'toy-statue', 'toy-lamp']);
    const well = s0.seats[0]!.hand[0]!;
    const s1 = pickAll(s0, (s, seat) =>
      seat === 0 ? { card: well.id, use: 'build' } : sellFirst(s, seat),
    );
    expect(s1.seats[0]!.tableau).toEqual([well]);
    expect(s1.seats[0]!.data.coins).toBe(3); // 2 - 0 cost + 1
  });

  it('checks costs and duplicates in validatePick and legalPicks', () => {
    const s0 = withHand(newToyGame(3), 0, ['toy-mill', 'toy-statue', 'toy-lamp']);
    const [mill, statue] = s0.seats[0]!.hand;
    expect(toy.legalPicks(s0, 0)).toContainEqual({ card: statue!.id, use: 'build' });
    const s1 = pickAll(s0, (s, seat) =>
      seat === 0 ? { card: mill!.id, use: 'build' } : sellFirst(s, seat),
    );
    // Seat 0 now holds seat 2's old hand; give it back faces to test against.
    const s2 = withHand(s1, 0, ['toy-statue', 'toy-mill']);
    const [statueB, millB] = s2.seats[0]!.hand;
    expect(s2.seats[0]!.data.coins).toBe(1);
    expect(
      toy.applyAction(s2, { type: 'pick', seat: 0, pick: { card: statueB!.id, use: 'build' } }),
    ).toEqual({
      ok: false,
      error: 'not enough coins',
    });
    expect(
      toy.applyAction(s2, { type: 'pick', seat: 0, pick: { card: millB!.id, use: 'build' } }),
    ).toEqual({
      ok: false,
      error: 'already built',
    });
    const legal = toy.legalPicks(s2, 0);
    expect(legal).not.toContainEqual({ card: statueB!.id, use: 'build' });
    expect(legal).toContainEqual({ card: statueB!.id, use: 'sell' });
  });

  it('runs onRoundEnd effects at the end of the round', () => {
    const s0 = withHand(newToyGame(3), 0, ['toy-mill']);
    const mill = s0.seats[0]!.hand[0]!;
    const s1 = pickAll(s0, (s, seat) =>
      seat === 0 ? { card: mill.id, use: 'build' } : sellFirst(s, seat),
    );
    const before = s1.seats[0]!.data.coins; // 2 - 1
    const s2 = sellTurns(s1, 2);
    expect(s2.round).toBe(1);
    expect(s2.seats[0]!.data.coins).toBe(before + 2 * 2 + 1); // two sales, then 1 income
  });

  it('scores effects at game end', () => {
    const s0 = withHand(newToyGame(3), 0, ['toy-statue']);
    const statue = s0.seats[0]!.hand[0]!;
    const s1 = pickAll(s0, (s, seat) =>
      seat === 0 ? { card: statue.id, use: 'build' } : sellFirst(s, seat),
    );
    const end = sellTurns(s1, 5);
    expect(end.result?.scores[0]?.categories.civic).toBe(3);
    expect(end.result?.winners).toEqual([0]);
  });

  it('effectsOf lists tableau effects in play order, then ruleset extras', () => {
    const rules = { ...toyRuleset, activeEffects: () => [{ type: 'points', amount: 9 }] };
    const s0 = withHand(newToyGame(3), 0, ['toy-well']);
    const s1 = pickAll(s0, (s, seat) =>
      seat === 0 ? { card: s.seats[0]!.hand[0]!.id, use: 'build' } : sellFirst(s, seat),
    );
    expect(effectsOf(rules, s1, 0)).toEqual([
      { type: 'coins', amount: 1 },
      { type: 'points', amount: 9 },
    ]);
    expect(effectsOf(rules, s1, 0, 'points')).toEqual([{ type: 'points', amount: 9 }]);
  });

  it('checkRuleset reports catalog problems and the engine refuses a broken ruleset', () => {
    expect(checkRuleset(toyRuleset)).toEqual([]);
    const broken = {
      ...toyRuleset,
      cards: [
        ...toyRuleset.cards,
        { id: 'toy-well', name: 'Dup', kind: 'basic', effects: [] },
        { id: 'toy-x', name: 'X', kind: 'basic', effects: [{ type: 'nope' }] },
        { id: 'toy-y', name: 'Y', kind: 'basic', effects: [{ type: 'coins', amount: -1 }] },
      ],
    };
    expect(checkRuleset(broken)).toEqual([
      'duplicate card id: toy-well',
      'toy-x: unknown effect type nope',
      'toy-y: coins: amount must be a count',
    ]);
    expect(() => createDraftEngine(broken)).toThrow(/duplicate card id/);
  });
});

describe('prompts', () => {
  /** Turn 0: everyone sells; turn 1: seat 0 builds a scout and gets a salvage prompt. */
  function salvageState(): ToyState {
    const s1 = sellTurns(newToyGame(3), 1);
    const s2 = withHand(s1, 0, ['toy-scout']);
    const scout = s2.seats[0]!.hand[0]!;
    return pickAll(s2, (s, seat) =>
      seat === 0 ? { card: scout.id, use: 'build' } : sellFirst(s, seat),
    );
  }

  it('pauses the flow for a prompt raised during resolution', () => {
    const s = salvageState();
    expect(s.phase).toEqual({ kind: 'prompt', then: 'turn' });
    expect(s.turn).toBe(1); // hands not passed yet
    expect(toy.waitingOn(s)).toEqual([0]);
    const prompt = s.prompts[0]!;
    expect(prompt.kind).toBe('salvage');
    // Data is refreshed when the prompt opens, after the whole turn resolved: turn 0's three
    // sales plus seats 1 and 2's sales this turn.
    expect((prompt.data as { cards: unknown[] }).cards).toHaveLength(5);
    expect(toy.legalActions(s)).toHaveLength(6);
    expect(toy.legalActions(s, 1)).toEqual([]);
  });

  it('hides prompt options from other seats', () => {
    const s = salvageState();
    expect(toy.viewFor(s, 1).prompts[0]).toEqual({ ...s.prompts[0], data: null });
    expect(toy.viewFor(s, 0).prompts[0]).toEqual(s.prompts[0]);
  });

  it('rejects answers from the wrong seat, to the wrong prompt, and picks meanwhile', () => {
    const s = salvageState();
    const id = s.prompts[0]!.id;
    expect(toy.applyAction(s, { type: 'answer', seat: 1, prompt: id, answer: null })).toEqual({
      ok: false,
      error: 'the open prompt is not yours',
    });
    expect(
      toy.applyAction(s, { type: 'answer', seat: 0, prompt: id + 1, answer: null }),
    ).toMatchObject({ ok: false });
    expect(toy.applyAction(s, { type: 'answer', seat: 0, prompt: id, answer: 12345 })).toEqual({
      ok: false,
      error: 'not offered',
    });
    expect(toy.applyAction(s, { type: 'pick', seat: 1, pick: sellFirst(s, 1) })).toEqual({
      ok: false,
      error: 'not the pick phase',
    });
  });

  it('applies the answer and continues the flow', () => {
    const s = salvageState();
    const offered = (s.prompts[0]!.data as { cards: { id: number }[] }).cards[0]!;
    const next = act(s, { type: 'answer', seat: 0, prompt: s.prompts[0]!.id, answer: offered.id });
    expect(next.phase).toEqual({ kind: 'pick' });
    expect(next.turn).toBe(2);
    expect(next.prompts).toEqual([]);
    expect(next.seats[0]!.tableau.map((c) => c.id)).toContain(offered.id);
    expect(next.discard.map((c) => c.id)).not.toContain(offered.id);
  });

  it('asks setup prompts one seat at a time before the first pick', () => {
    let s = newToyGame(3, { opening: true });
    expect(s.phase).toEqual({ kind: 'prompt', then: 'start' });
    expect(s.prompts.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(toy.waitingOn(s)).toEqual([0]);
    expect(toy.defaultAction(s, 1)).toBeNull();
    expect(toy.defaultAction(s, 0)).toEqual({ type: 'answer', seat: 0, prompt: 0, answer: 'none' });
    s = act(s, { type: 'answer', seat: 0, prompt: 0, answer: 'coins' });
    expect(s.seats[0]!.data).toEqual({ coins: 3, opening: 'coins' });
    s = act(s, { type: 'answer', seat: 1, prompt: 1, answer: 'none' });
    s = act(s, { type: 'answer', seat: 2, prompt: 2, answer: 'coins' });
    expect(s.phase).toEqual({ kind: 'pick' });
    expect(s.round).toBe(0);
    expect(s.seats.map((x) => x.hand.length)).toEqual([4, 4, 4]);
  });
});

describe('applyAction contract', () => {
  it('rejects malformed actions with an error, not a throw', () => {
    const s = newToyGame(3);
    const bad: unknown[] = [
      null,
      { type: 'pick', seat: 9, pick: sellFirst(s, 0) },
      { type: 'pick', seat: -1, pick: sellFirst(s, 0) },
      { type: 'pick', seat: 0.5, pick: sellFirst(s, 0) },
      { type: 'zap', seat: 0 },
      { type: 'pick', seat: 0 },
      { type: 'pick', seat: 0, pick: { card: 'x', use: 'sell' } },
      { type: 'pick', seat: 0, pick: { card: s.seats[0]!.hand[0]!.id, use: '' } },
      { type: 'pick', seat: 0, pick: { card: s.seats[1]!.hand[0]!.id, use: 'sell' } },
      {
        type: 'pick',
        seat: 0,
        pick: { card: s.seats[0]!.hand[0]!.id, use: 'sell', args: { x: undefined } },
      },
      { type: 'pick', seat: 0, pick: { card: s.seats[0]!.hand[0]!.id, use: 'burn' } },
      { type: 'answer', seat: 0, prompt: 0, answer: null },
    ];
    for (const a of bad) {
      const r = toy.applyAction(s, a as DraftAction);
      expect(r.ok, JSON.stringify(a)).toBe(false);
    }
  });

  it('stores only the known fields of a pick', () => {
    const s = newToyGame(3);
    const raw = { ...sellFirst(s, 0), extra: 'ignored' };
    const next = pick(s, 0, raw);
    expect(next.seats[0]!.pick).toEqual(sellFirst(s, 0));
  });

  it('never mutates its input', () => {
    let s = newToyGame(3, { opening: true });
    const steps: DraftAction[][] = [];
    for (let i = 0; i < 40 && s.phase.kind !== 'gameOver'; i++) {
      const frozen = deepFreeze(JSON.parse(JSON.stringify(s)) as ToyState);
      const text = JSON.stringify(frozen);
      const legal = toy.legalActions(frozen);
      for (const a of legal) toy.applyAction(frozen, a); // all of them, on the frozen state
      expect(JSON.stringify(frozen)).toBe(text);
      const choice = legal.find((a) => a.type !== 'unpick')!;
      steps.push([choice]);
      s = act(frozen, choice);
    }
    expect(steps.length).toBeGreaterThan(10);
  });

  it('refuses states of another ruleset and views', () => {
    const s = newToyGame(3);
    expect(() =>
      toy.applyAction({ ...s, ruleset: { id: 'other', version: 1 } }, { type: 'unpick', seat: 0 }),
    ).toThrow(/ruleset other/);
    expect(() => toy.applyAction(toy.viewFor(s, 0), { type: 'unpick', seat: 0 })).toThrow(/view/);
  });

  it('throws when ruleset code loses a card (a bug, not a bad action)', () => {
    const e = variant({ resolve: [() => undefined] });
    let s = e.createGame(toyConfig(2));
    const r = e.applyAction(s, { type: 'pick', seat: 0, pick: sellFirst(s, 0) });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(() => e.applyAction(s, { type: 'pick', seat: 1, pick: sellFirst(s, 1) })).toThrow(
      /nowhere/,
    );
  });

  it('defaultAction gives a deterministic accepted move for a waiting seat only', () => {
    const s0 = newToyGame(3);
    const a = toy.defaultAction(s0, 1);
    expect(a).toEqual({ type: 'pick', seat: 1, pick: sellFirst(s0, 1) });
    const s1 = act(s0, a!);
    expect(toy.defaultAction(s1, 1)).toBeNull();
    expect(toy.defaultPick(s1, 1)).toEqual(sellFirst(s0, 1));
  });
});
