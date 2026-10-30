/** R2.4, R2.5, R15.10: the Great Work choice, on the real engine. */
import { describe, expect, it } from 'vitest';
import type { WwState } from './types';
import { GREAT_WORK_CHOICE, offersOf } from './greatWork';
import { atChoice, fx, fxEngine as e } from './testing/helpers';
import { guardOf } from './town';

const answer = (s: WwState, seat: number, gw: string): WwState => {
  const p = s.prompts.find((x) => x.seat === seat)!;
  const r = e.applyAction(s, { type: 'answer', seat, prompt: p.id, answer: gw });
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const offers = (s: WwState, seat: number) => offersOf(s.prompts.find((p) => p.seat === seat)!.data);

describe('the Great Work choice (R2.4, R2.5)', () => {
  it('R2.4 each town is dealt 2 Great Works from the shuffled pool, all different', () => {
    const s = atChoice(7, 4);
    expect(s.phase).toEqual({ kind: 'prompt', then: 'start' });
    expect(s.prompts.every((p) => p.kind === GREAT_WORK_CHOICE)).toBe(true);
    expect(new Set(s.prompts.map((p) => p.group)).size).toBe(1); // one group: all at once
    const all = s.seats.flatMap((t) => offers(s, t.id));
    expect(all).toHaveLength(14);
    expect(new Set(all).size).toBe(14);
    expect(atChoice(7, 4).prompts).toEqual(s.prompts); // seeded
    expect(atChoice(7, 5).prompts).not.toEqual(s.prompts);
  });

  it('R2.5 and R1.11 the offers and the choice stay hidden until every town has chosen', () => {
    let s = atChoice(3);
    expect(e.viewFor(s, 1).prompts[0]).toMatchObject({ data: null, answer: null, answered: false });
    s = answer(s, 0, offers(s, 0)[1]!);
    expect(s.seats[0]!.data.greatWork).toBeNull();
    expect(e.viewFor(s, 1).prompts[0]).toMatchObject({ data: null, answer: null, answered: true });
    expect(e.waitingOn(s)).toEqual([1, 2]);
  });

  it('R2.5 a choice may change until the last town has chosen; then all are revealed together', () => {
    let s = atChoice(3);
    const picked = [offers(s, 0)[1]!, offers(s, 1)[0]!, offers(s, 2)[1]!];
    const unchosen = [offers(s, 0)[0]!, offers(s, 1)[1]!, offers(s, 2)[0]!];
    s = answer(s, 0, offers(s, 0)[0]!);
    s = answer(s, 0, picked[0]!); // changed
    s = answer(s, 2, picked[2]!);
    s = answer(s, 1, picked[1]!);
    expect(s.seats.map((t) => t.data.greatWork)).toEqual(picked);
    expect(s.log.filter((l) => l.kind === 'greatWork').map((l) => l.seat)).toEqual([0, 1, 2]);
    // The ones not chosen leave the game unseen: nothing in the state names them any more.
    const json = JSON.stringify(s);
    for (const id of unchosen) expect(json).not.toContain(`"${id}"`);
  });

  it('R2.5 Perks are active from the reveal', () => {
    // The first seed whose deal offers tg-crown (guard 1 Perk) to some town.
    const seed = Array.from({ length: 50 }, (_, i) => i + 1).find((n) =>
      atChoice(3, n).prompts.some((p) => offersOf(p.data).includes('tg-crown')),
    );
    expect(seed).toBeDefined();
    let s = atChoice(3, seed);
    const crown = s.seats.find((t) => offers(s, t.id).includes('tg-crown'))!;
    s = answer(s, crown.id, 'tg-crown');
    expect(guardOf(fx, s, crown.id)).toBe(0); // not before the reveal
    for (const t of s.seats) if (t.id !== crown.id) s = answer(s, t.id, offers(s, t.id)[0]!);
    expect(guardOf(fx, s, crown.id)).toBe(1);
  });

  it('only an offered Great Work may be chosen', () => {
    const s = atChoice(3);
    const other = offers(s, 1)[0]!;
    expect(
      e.applyAction(s, { type: 'answer', seat: 0, prompt: s.prompts[0]!.id, answer: other }),
    ).toEqual({ ok: false, error: 'choose one of your offered Great Works' });
  });

  it('R15.6 and R15.10 the timeout choice is the first offered', () => {
    const s = atChoice(4);
    for (const t of s.seats) {
      expect(e.defaultAction(s, t.id)).toMatchObject({
        type: 'answer',
        answer: offers(s, t.id)[0],
      });
    }
  });

  it('R2.5 then R2.6 and R3.2: no hands during the choice; then the Spring deal and Raid', () => {
    let s = atChoice(3);
    expect(s.seats.every((t) => t.hand.length === 0)).toBe(true);
    expect(s.table.raids[0]!.revealed).toBe(false);
    for (const t of s.seats) s = answer(s, t.id, offers(s, t.id)[0]!);
    expect(s.phase).toEqual({ kind: 'pick' });
    expect(s.seats.every((t) => t.hand.length === 6)).toBe(true);
    expect(s.table.raids[0]!.revealed).toBe(true);
  });
});
