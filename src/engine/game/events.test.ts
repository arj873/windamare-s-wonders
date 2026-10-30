/** E3: the per-turn event log (events.ts), on the real engine and the test fixture. */
import { describe, expect, it } from 'vitest';
import { Rng, type Card, type Pick } from '../core';
import { eventsOf, latestEvents, type WwEvent } from './events';
import { offersOf } from './greatWork';
import {
  atChoice,
  build,
  fxEngine as e,
  newGame,
  playTurn,
  setGreatWork,
  setHand,
  townData,
} from './testing/helpers';
import type { WwState } from './types';

/** 3 towns, Spring turn 1, Stalls in hand, empty stores, 5 coins, no Great Work or Honour. */
function table(seats = 3): WwState {
  const s = structuredClone(newGame(seats, 1));
  for (const t of s.seats) {
    setHand(s, t.id, Array(6).fill('tf-stall') as string[]);
    t.data.store = { flint: 0, slate: 0, honey: 0 };
    t.data.coins = 5;
    t.data.greatWork = null;
  }
  s.table.honours = [];
  s.table.leaders = [];
  return s;
}
const types = (s: WwState) => latestEvents(s).map((x) => x.event.type);
const ofType = <K extends WwEvent['type']>(s: WwState, type: K) =>
  latestEvents(s).flatMap((x) =>
    x.event.type === type ? [x.event as Extract<WwEvent, { type: K }>] : [],
  );
const build1 = (card: Card): Pick => ({ card: card.id, use: 'build' });

describe('the event log (E3)', () => {
  it('records a turn in the order it resolved: Spend, Pay, trades, Build, Tolls, Yield', () => {
    const s = table();
    build(s, 1, 'tf-seller'); // +1 coin per good sold
    build(s, 2, 'tf-toll'); // 1 coin per neighbour that builds
    Object.assign(townData(s, 1).store, { slate: 2 });
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!; // 2 slate; yields 1 honey
    const after = playTurn(s, { 0: build1(apiary) });
    expect(types(after)).toEqual([
      'spend',
      'spend',
      'pay',
      'trade',
      'trade',
      'build',
      'toll',
      'yield',
    ]);
    const [pay] = ofType(after, 'pay');
    expect(pay).toEqual({
      type: 'pay',
      seat: 0,
      card: apiary,
      goods: {},
      exchanges: [],
      bank: [],
      buys: [
        { from: 1, good: 'slate', price: 1 },
        { from: 1, good: 'slate', price: 1 },
      ],
      coins: 2,
    });
    expect(ofType(after, 'trade')).toEqual([
      { type: 'trade', seller: 1, buyer: 0, good: 'slate', price: 1, filled: true, bonus: 1 },
      { type: 'trade', seller: 1, buyer: 0, good: 'slate', price: 1, filled: true, bonus: 1 },
    ]);
    expect(ofType(after, 'build')).toEqual([
      { type: 'build', seat: 0, card: apiary, cover: null, gains: {} },
    ]);
    expect(ofType(after, 'toll')).toEqual([{ type: 'toll', seat: 2, coins: 1, from: [0] }]);
    expect(ofType(after, 'yield')).toEqual([{ type: 'yield', seat: 0, gains: { honey: 1 } }]);
    expect(ofType(after, 'spend').map((x) => [x.seat, x.gains])).toEqual([
      [1, { coins: 1 }],
      [2, { coins: 1 }],
    ]);
    // Every event of the turn shares the action's seq; the human text is there too.
    expect(new Set(latestEvents(after).map((x) => x.seq))).toEqual(new Set([after.seq]));
    expect(latestEvents(after)[2]!.text).toBe('P0 pays for tf-apiary.');
  });

  it("records Exchanges, the bank, a cover and a Build's own gains", () => {
    const s = table();
    build(s, 0, 'tf-broker'); // exchange flint
    const shrine = build(s, 0, 'tf-shrine');
    Object.assign(townData(s, 0).store, { flint: 2 });
    townData(s, 0).coins = 10;
    const hall = setHand(s, 0, ['tf-hall'])[0]!; // upgrade of the Shrine: 1 slate
    const after = playTurn(s, { 0: { card: hall.id, use: 'build' } });
    expect(ofType(after, 'pay')[0]).toMatchObject({
      goods: {},
      exchanges: [{ give: 'flint', for: 'slate' }],
      bank: [],
      coins: 0,
    });
    expect(ofType(after, 'build')[0]).toMatchObject({ cover: shrine.id });
    const gift = table();
    const g = setHand(gift, 0, ['tf-gift'])[0]!; // when built: 2 "any"
    const a2 = playTurn(gift, {
      0: { card: g.id, use: 'build', args: { any: ['slate', 'slate'] } },
    });
    expect(ofType(a2, 'build')[0]!.gains).toEqual({ slate: 2 });
  });

  it('records Great Work tiers with their one-off gains', () => {
    const s = table();
    setGreatWork(s, 0, 'tg-crown'); // tier I at 3 labour: +4 coins
    const hut = setHand(s, 0, ['tf-hut'])[0]!; // Spend: 3 labour
    const after = playTurn(s, { 0: { card: hut.id, use: 'spend' } });
    expect(ofType(after, 'tier')).toEqual([
      { type: 'tier', seat: 0, greatWork: 'tg-crown', tier: 1, gains: { coins: 4 } },
    ]);
  });

  it('records a Season end: Raid results, bounties, held bonuses, Season-end gains, Honours, the next Raid', () => {
    let s = table();
    for (let i = 0; i < 4; i++) s = playTurn(s);
    s = structuredClone(s);
    for (let i = 0; i < 2; i++) build(s, 0, 'tf-fence');
    build(s, 0, 'tf-tower'); // guard 4 in all: holds; held +1
    build(s, 1, 'tf-cellar'); // Season end: 1 flint, 2 coins
    s.table.honours = ['th-guard'];
    s.table.leaders = [[]];
    const after = playTurn(s);
    expect(after.round).toBe(1);
    const t = types(after);
    const seasonPart = t.slice(t.indexOf('raid'));
    expect(seasonPart).toEqual([
      'raid',
      'raid',
      'raid',
      'bounty',
      'bounty',
      'heldBonus',
      'seasonEnd',
      'raidRevealed',
    ]);
    expect(ofType(after, 'raid').map((r) => [r.seat, r.outcome])).toEqual([
      [0, 'held'],
      [1, 'plundered'],
      [2, 'plundered'],
    ]);
    expect(ofType(after, 'bounty')).toEqual([
      { type: 'bounty', from: 1, to: 0, coins: 1 },
      { type: 'bounty', from: 2, to: 0, coins: 1 },
    ]);
    expect(ofType(after, 'seasonEnd')).toEqual([
      { type: 'seasonEnd', seat: 1, gains: { flint: 1, coins: 2 } },
    ]);
    expect(ofType(after, 'raidRevealed')[0]).toMatchObject({ season: 1, raid: 'tr-summer' });
    // The guard Honour changed at the end of the turn, before the Raid.
    expect(ofType(after, 'honour')).toEqual([
      { type: 'honour', honour: 'th-guard', leaders: [0], was: [], best: 4 },
    ]);
    expect(t.indexOf('honour')).toBeLessThan(t.indexOf('raid'));
    expect(after.table.leaders).toEqual([[0]]);
  });

  it('records the Great Work reveal, all towns together, then the Spring Raid', () => {
    let s = atChoice(3);
    for (const t of s.seats) {
      const p = s.prompts.find((x) => x.seat === t.id)!;
      const r = e.applyAction(s, {
        type: 'answer',
        seat: t.id,
        prompt: p.id,
        answer: offersOf(p.data)[0]!,
      });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const t = types(s);
    expect(t.slice(0, 3)).toEqual(['greatWork', 'greatWork', 'greatWork']);
    expect(t.at(-1)).toBe('raidRevealed');
    expect(ofType(s, 'greatWork').map((g) => g.greatWork)).toEqual(
      s.seats.map((x) => x.data.greatWork),
    );
  });

  it('is in every view, the same for every seat, and names no hidden card', () => {
    // A whole random game: every card an event names was revealed in a pick first (R1.11).
    const rng = new Rng(77);
    let s = newGame(4, 77);
    const revealed = new Set<number>();
    while (s.phase.kind !== 'gameOver') {
      const seat = rng.pick(e.waitingOn(s));
      const r = e.applyAction(
        s,
        rng.pick(e.legalActions(s, seat).filter((a) => a.type !== 'unpick')),
      );
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      for (const p of s.lastReveal?.picks ?? []) revealed.add(p.card.id);
      for (const viewer of [0, 3, 'spectator'] as const) {
        expect(latestEvents(e.viewFor(s, viewer))).toEqual(latestEvents(s));
      }
    }
    const all = eventsOf(s).map((x) => x.event);
    for (const ev of all) {
      if ('card' in ev)
        expect(revealed.has(ev.card.id), `${ev.type} names card ${ev.card.id}`).toBe(true);
    }
    for (const ev of all) {
      if (ev.type === 'glean' || ev.type === 'burn')
        expect(Object.keys(ev).sort()).toEqual(
          ev.type === 'glean' ? ['gains', 'seat', 'type'] : ['seat', 'type'],
        );
    }
    const kinds = new Set(all.map((x) => x.type));
    for (const k of [
      'spend',
      'pay',
      'build',
      'yield',
      'raid',
      'raidRevealed',
      'greatWork',
      'honour',
    ]) {
      expect(kinds.has(k as WwEvent['type']), k).toBe(true);
    }
  });

  it('a 2-player burn event names no card', () => {
    const s = newGame(2);
    const after = playTurn(s);
    expect(ofType(after, 'burn')).toEqual([
      { type: 'burn', seat: 0 },
      { type: 'burn', seat: 1 },
    ]);
  });
});
