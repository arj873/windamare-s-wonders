/**
 * Ruleset hooks the Windamere game needs: normalizePick (C5), play args (C6), prompt groups (C3),
 * start prompts before the deal (C4), onLeftovers.
 */
import { describe, expect, it } from 'vitest';
import { makeCtx } from './ctx';
import { createDraftEngine } from './engine';
import { Rng } from './rng';
import { newToyGame, sellFirst, toy, toyConfig } from './testing/helpers';
import { toyRuleset, TOY_PICKS, type ToySeat, type ToyState, type ToyTable } from './testing/toy';
import type { Json, Pick, Ruleset } from './types';

const variant = (over: Partial<Ruleset<ToySeat, ToyTable>>) =>
  createDraftEngine({ ...toyRuleset, ...over });

function playRound(e: ReturnType<typeof variant>, s0: ToyState): ToyState {
  let s = s0;
  const round = s.round;
  while (s.round === round && s.phase.kind === 'pick') {
    for (const seat of e.waitingOn(s)) {
      const r = e.applyAction(s, { type: 'pick', seat, pick: sellFirst(s, seat) });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
  }
  return s;
}

describe('normalizePick', () => {
  // Sales must say where the coins go; the ruleset fills the default when the pick does not.
  const e = variant({
    normalizePick: (_s, _seat, p): Pick =>
      p.use === 'sell' && p.args === undefined ? { ...p, args: { to: 'purse' } } : p,
    validatePick: (_s, _seat, p) =>
      p.use !== 'sell' || (p.args as { to?: string } | undefined)?.to === 'purse'
        ? null
        : 'sell needs to: purse',
    legalPicks: (s, seat) => [sellFirst(s as ToyState, seat)],
  });

  it('fills the pick before validation; the stored and revealed pick is the normalized one', () => {
    const s0 = e.createGame(toyConfig(2));
    const p = sellFirst(s0, 0);
    const r = e.applyAction(s0, { type: 'pick', seat: 0, pick: p });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.seats[0]!.pick).toEqual({ ...p, args: { to: 'purse' } });
    const r2 = e.applyAction(r.state, { type: 'pick', seat: 1, pick: sellFirst(s0, 1) });
    expect(r2.ok && r2.state.lastReveal?.picks.map((x) => x.args)).toEqual([
      { to: 'purse' },
      { to: 'purse' },
    ]);
    // Explicit bad args are not overwritten, so validation rejects them.
    expect(
      e.applyAction(s0, { type: 'pick', seat: 0, pick: { ...p, args: { to: 'sea' } } }),
    ).toEqual({ ok: false, error: 'sell needs to: purse' });
  });

  it('legalPicks and defaultPick stay sound with a normalizing ruleset', () => {
    const s0 = e.createGame(toyConfig(3));
    for (const seat of [0, 1, 2]) {
      for (const p of e.legalPicks(s0, seat)) {
        expect(e.applyAction(s0, { type: 'pick', seat, pick: p }).ok).toBe(true);
      }
      expect(e.defaultPick(s0, seat)).not.toBeNull();
    }
  });

  it('a normalizePick that changes the card is a ruleset bug', () => {
    const bad = variant({ normalizePick: (_s, _seat, p) => ({ ...p, card: p.card + 1000 }) });
    const s0 = bad.createGame(toyConfig(2));
    expect(() => bad.applyAction(s0, { type: 'pick', seat: 0, pick: sellFirst(s0, 0) })).toThrow(
      'normalizePick changed the card or use',
    );
  });
});

describe('play and trigger pass args to onPlay (C6)', () => {
  it('onPlay gets the args given to ctx.play / ctx.trigger, else undefined', () => {
    const seen: unknown[] = [];
    const rules: Ruleset<ToySeat, ToyTable> = {
      ...toyRuleset,
      effects: {
        ...toyRuleset.effects,
        coins: { onPlay: (_ctx, _seat, _spec, _source, args) => void seen.push(args) },
      },
    };
    const s = newToyGame(2);
    const ctx = makeCtx(rules, s, new Rng(s.rng));
    ctx.trigger(0, [{ type: 'coins', amount: 1 }], null, { any: ['x'] });
    ctx.trigger(0, [{ type: 'coins', amount: 1 }], null);
    ctx.play(0, { id: s.nextCardId++, def: 'toy-well' }, { pay: 1 });
    expect(seen).toEqual([{ any: ['x'] }, undefined, { pay: 1 }]);
  });
});

describe('prompt groups (C3) and start prompts before the deal (C4)', () => {
  const answer = (s: ToyState, seat: number, a: string) => {
    const p = s.prompts.find((x) => x.seat === seat)!;
    return toy.applyAction(s, { type: 'answer', seat, prompt: p.id, answer: a });
  };
  const ok = (r: ReturnType<typeof answer>): ToyState => {
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };

  it('a group is open for every seat at once; answers stay hidden and may change', () => {
    const s0 = newToyGame(3, { openingGroup: true });
    expect(s0.phase).toEqual({ kind: 'prompt', then: 'start' });
    expect(toy.waitingOn(s0)).toEqual([0, 1, 2]);
    expect(toy.legalActions(s0, 2)).toHaveLength(2);
    const s1 = ok(answer(s0, 1, 'coins'));
    expect(toy.waitingOn(s1)).toEqual([0, 2]);
    expect(s1.seats[1]!.data.opening).toBeNull(); // not applied yet
    expect(toy.viewFor(s1, 0).prompts[1]).toMatchObject({
      answered: true,
      answer: null,
      data: null,
    });
    expect(toy.viewFor(s1, 1).prompts[1]).toMatchObject({ answered: true, answer: 'coins' });
    const s2 = ok(answer(s1, 1, 'none')); // changed
    expect(s2.prompts[1]!.answer).toBe('none');
    expect(toy.legalActions(s2, 1)).toHaveLength(2); // may still change
  });

  it('the last answer applies the whole group in seat order, whatever the arrival order', () => {
    const s0 = newToyGame(3, { openingGroup: true });
    const answers = ['coins', 'none', 'coins'];
    const ends = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
    ].map((order) => order.reduce((s, seat) => ok(answer(s, seat, answers[seat]!)), s0));
    for (const end of ends) {
      expect(end.phase).toEqual({ kind: 'pick' });
      expect(end.table.trace).toEqual(['opening:0', 'opening:1', 'opening:2']);
      expect(end.seats.map((x) => x.data.opening)).toEqual(answers);
      expect({ ...end, seq: 0, log: [] }).toEqual({ ...ends[0]!, seq: 0, log: [] });
    }
  });

  it('startBeforeDeal: start prompts come before the first deal, no hands until they end', () => {
    const late = variant({ startBeforeDeal: true });
    const variants: Record<string, Json>[] = [{ openingGroup: true }, { opening: true }];
    for (const options of variants) {
      let s = late.createGame(toyConfig(3, options));
      expect(s.seats.every((x) => x.hand.length === 0)).toBe(true);
      expect(s.deck).toEqual([]);
      while (s.phase.kind === 'prompt') {
        const seat = late.waitingOn(s)[0]!;
        const r = late.applyAction(s, late.defaultAction(s, seat)!);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      expect(s.seats.map((x) => x.hand.length)).toEqual([4, 4, 4]);
    }
    // Default: round 0 is dealt first, so the hands are there during the start prompts.
    expect(newToyGame(3, { opening: true }).seats.map((x) => x.hand.length)).toEqual([4, 4, 4]);
  });

  it('a group may not hold two prompts for one seat', () => {
    const s = newToyGame(2);
    const ctx = makeCtx(toyRuleset, s, new Rng(s.rng));
    expect(() =>
      ctx.promptGroup([
        { seat: 0, kind: 'opening', data: null },
        { seat: 0, kind: 'opening', data: null },
      ]),
    ).toThrow('two prompts for seat 0 in one group');
  });
});

describe('onLeftovers', () => {
  it("receives each seat's last-turn leftovers before the resolve steps, instead of the discard", () => {
    const order: string[] = [];
    const e = variant({
      rounds: 1,
      onLeftovers: (ctx, seat, cards) => {
        order.push(`left:${seat}:${cards.length}`);
        for (const c of cards) ctx.place(seat, 'stash', c);
      },
      resolve: [
        ...toyRuleset.resolve,
        (ctx, seat) => {
          if (ctx.state.turn === TOY_PICKS - 1) order.push(`step:${seat}`);
        },
      ],
    });
    const end = playRound(e, e.createGame(toyConfig(2, { rounds: 1 })));
    expect(order).toEqual(['left:0:1', 'left:1:1', 'step:0', 'step:1']);
    for (const s of end.seats) expect(s.zones.stash).toHaveLength(1);
    expect(end.log.some((l) => l.kind === 'leftovers')).toBe(false);
  });

  it('a hook that loses a card is a ruleset bug (card conservation)', () => {
    const e = variant({ onLeftovers: () => undefined });
    expect(() => playRound(e, e.createGame(toyConfig(2)))).toThrow();
  });
});
