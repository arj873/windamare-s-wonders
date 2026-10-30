/** R14: the 2-player variant, on the real engine (test fixture). */
import { describe, expect, it } from 'vitest';
import type { Pick } from '../core';
import { argsOf } from './pick';
import { FX_CARDS } from './testing/fixture';
import { fxEngine as e, newGame, playTurn, setHand, townData } from './testing/helpers';
import type { WwState } from './types';

const submit = (s: WwState, seat: number, pick: Pick) =>
  e.applyAction(s, { type: 'pick', seat, pick });

describe('2 players (R14)', () => {
  it('R14.1 deal 10 cards each from the 4-seat deck; the rest stays undealt and unseen', () => {
    const s = newGame(2);
    const spring = FX_CARDS.filter((c) => c.season === 'spring');
    const fourSeat = spring.reduce((n, c) => n + (c.counts[1] ?? 0), 0);
    expect(s.seats.map((t) => t.hand.length)).toEqual([10, 10]);
    expect(s.deck).toHaveLength(fourSeat - 20);
    expect(e.viewFor(s, 0).deck.every((c) => c.id < 0)).toBe(true);
  });

  it('R14.2 on turns 1 to 4 a town also burns a second card', () => {
    const s = newGame(2);
    const [a, b] = s.seats[0]!.hand;
    expect(submit(s, 0, { card: a!.id, use: 'spend', args: { burn: null } })).toEqual({
      ok: false,
      error: 'with 2 towns, also burn a card (R14.2)',
    });
    expect(submit(s, 0, { card: a!.id, use: 'spend', args: { burn: a!.id } })).toEqual({
      ok: false,
      error: 'burn a different card from the one you pick',
    });
    const r = submit(s, 0, { card: a!.id, use: 'spend', args: { burn: b!.id } });
    expect(r.ok).toBe(true);
    // A pick without a burn gets the first other card (R15.6 default).
    const d = submit(s, 0, { card: b!.id, use: 'spend' });
    expect(d.ok && argsOf(d.state.seats[0]!.pick!).burn).toBe(a!.id);
  });

  it('R14.3 a burned card is discarded face down with no effect; the other town sees only that', () => {
    const s = structuredClone(newGame(2));
    const [spend, burn] = setHand(s, 0, ['tf-stall', 'tf-quarry']); // Quarry's band: 2 slate
    const slate = townData(s, 0).store.slate ?? 0;
    const after = playTurn(s, { 0: { card: spend!.id, use: 'spend', args: { burn: burn!.id } } });
    expect(after.discard.some((c) => c.id === burn!.id)).toBe(true);
    expect(townData(after, 0).store.slate).toBe(slate); // no effect
    expect(after.seats.every((t) => t.hand.length === 8)).toBe(true);
    const mine = after.lastReveal!.picks.find((p) => p.seat === 0)!;
    expect(argsOf({ ...mine, card: mine.card.id }).burn).toBe(burn!.id);
    const theirs = e.viewFor(after, 1).lastReveal!.picks.find((p) => p.seat === 0)!;
    expect((theirs.args as { burn: number }).burn).toBe(-1);
    // No card object anywhere in the other town's view is the burned card.
    expect(JSON.stringify(e.viewFor(after, 1))).not.toContain(`{"id":${burn!.id},"def"`);
    // The owner sees its own burn; it does not see the other town's.
    const own = e.viewFor(after, 0).lastReveal!.picks;
    expect(own.find((p) => p.seat === 0)).toEqual(mine);
    expect((own.find((p) => p.seat === 1)!.args as { burn: number }).burn).toBe(-1);
  });

  it('R14.4 on the fifth turn: pick one, glean the other, nothing burned; then hands are empty', () => {
    let s = newGame(2);
    for (let t = 0; t < 4; t++) s = playTurn(s);
    expect(s.turn).toBe(4);
    expect(s.seats.map((t) => t.hand.length)).toEqual([2, 2]);
    const [a, b] = s.seats[0]!.hand;
    expect(submit(s, 0, { card: a!.id, use: 'spend', args: { burn: b!.id } })).toEqual({
      ok: false,
      error: 'nothing is burned on the last turn (R14.4)',
    });
    const next = playTurn(s);
    expect(next.round).toBe(1);
    expect(next.log.filter((l) => l.kind === 'glean' && l.round === 0)).toHaveLength(2);
    expect(next.log.filter((l) => l.kind === 'burn' && l.round === 0)).toHaveLength(8);
  });

  it('R14.5 the only neighbour counts once: buying limit 2 a turn in all', () => {
    const s = structuredClone(newGame(2));
    for (const t of s.seats) t.data.greatWork = null;
    Object.assign(townData(s, 1).store, { slate: 5 });
    townData(s, 0).coins = 20;
    const [keep] = setHand(s, 0, ['tf-keep']); // 3 slate
    const r = submit(s, 0, { card: keep!.id, use: 'build' });
    expect(r.ok && argsOf(r.state.seats[0]!.pick!).pay).toEqual([
      { good: 'slate', via: 'buy', from: 1 },
      { good: 'slate', via: 'buy', from: 1 },
      { good: 'slate', via: 'bank' },
    ]);
  });

  it('R14.6 and R15.6 everything else is unchanged; the fallback Spends the first, Burns the second', () => {
    const s = newGame(2, 5);
    const [a, b] = s.seats[1]!.hand;
    expect(e.defaultPick(s, 1)).toMatchObject({ card: a!.id, use: 'spend', args: { burn: b!.id } });
    // Only 2 towns burn.
    const three = newGame(3);
    const [x, y] = three.seats[0]!.hand;
    expect(submit(three, 0, { card: x!.id, use: 'spend', args: { burn: y!.id } })).toEqual({
      ok: false,
      error: 'only 2 towns burn cards (R14.2)',
    });
  });

  it('legalPicks offers each choice with every other card as the Burn', () => {
    const s = newGame(2, 3);
    const picks = e.legalPicks(s, 0);
    const spends = picks.filter((p) => p.use === 'spend');
    expect(spends).toHaveLength(10 * 9);
    for (const p of picks.slice(0, 20)) expect(submit(s, 0, p).ok).toBe(true);
  });
});
