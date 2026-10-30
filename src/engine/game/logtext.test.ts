/**
 * E8: every Windamere log line names its seats as pieces (actor + targets), so a client can say
 * "You" (core/log.ts `logText`). The plain `text` stays as it was.
 */
import { describe, expect, it } from 'vitest';
import { Rng, joinParts, logText, type Card, type LogEntry, type Pick } from '../core';
import { makeCtx } from '../core/ctx';
import { createWindamereEngine } from './engine';
import { EVENT_TYPES, eventsOf } from './events';
import { updateHonourLeaders } from './honours';
import { resolveRaid } from './raid';
import {
  build,
  fx,
  fxRuleset,
  newGame,
  newWwGame,
  playTurn,
  setGreatWork,
  setHand,
  townData,
} from './testing/helpers';
import type { WwState } from './types';

/** 3 towns, Spring turn 1, Stalls in hand, empty stores, 5 coins, no Great Work or Honour. */
function table(): WwState {
  const s = structuredClone(newGame(3, 1));
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
const build1 = (card: Card): Pick => ({ card: card.id, use: 'build' });
const last = (s: WwState, kind: string): LogEntry => s.log.filter((e) => e.kind === kind).at(-1)!;
/** The line as each of the three towns and a spectator reads it. */
const readings = (e: LogEntry) => ([0, 1, 2, 'spectator'] as const).map((v) => logText(e, v));

describe('log lines a viewer reads as "You" (E8)', () => {
  it('a purchase: the seller reads "You sell", the buyer "to you", everyone else the text', () => {
    const s = table();
    Object.assign(townData(s, 1).store, { slate: 2 });
    const apiary = setHand(s, 0, ['tf-apiary'])[0]!; // 2 slate, bought from town 1
    const after = playTurn(s, { 0: build1(apiary) });
    const trade = last(after, 'trade');
    expect([trade.seat, trade.targets]).toEqual([1, [0]]);
    expect(readings(trade)).toEqual([
      'P1 sells 1 slate to you for 1.',
      'You sell 1 slate to P0 for 1.',
      'P1 sells 1 slate to P0 for 1.',
      'P1 sells 1 slate to P0 for 1.',
    ]);
    const pay = last(after, 'pay');
    expect([pay.seat, pay.targets]).toEqual([0, [1]]); // it bought from town 1
    expect(readings(pay)).toEqual([
      'You pay for tf-apiary.',
      'P0 pays for tf-apiary.',
      'P0 pays for tf-apiary.',
      'P0 pays for tf-apiary.',
    ]);
    expect(logText(last(after, 'build'), 0)).toBe('You build tf-apiary.');
    expect(logText(last(after, 'spend'), 2)).toBe('You spend tf-stall.');
  });

  it('a bank fill (R6.7): "You are out of", "you buy it from the bank"', () => {
    const s = table();
    townData(s, 1).store.flint = 1;
    const quarry = setHand(s, 0, ['tf-quarry'])[0]!;
    const own = setHand(s, 1, ['tf-quarry'])[0]!; // town 1 pays its own Quarry first (step 2a)
    const buy: Pick = {
      ...build1(quarry),
      args: { pay: [{ good: 'flint', via: 'buy', from: 1 }] },
    };
    const trade = last(playTurn(s, { 0: buy, 1: build1(own) }), 'trade');
    expect(trade.data).toMatchObject({ filled: false });
    expect(readings(trade)).toEqual([
      'P1 is out of flint: you buy it from the bank for 1.',
      'You are out of flint: P0 buys it from the bank for 1.',
      'P1 is out of flint: P0 buys it from the bank for 1.',
      'P1 is out of flint: P0 buys it from the bank for 1.',
    ]);
  });

  it('a Season end: hold, plunder, bounty, held bonus, Season-end gains', () => {
    let s = table();
    for (let i = 0; i < 4; i++) s = playTurn(s);
    s = structuredClone(s);
    for (let i = 0; i < 2; i++) build(s, 0, 'tf-fence');
    build(s, 0, 'tf-tower'); // guard 4: holds; held +1
    build(s, 1, 'tf-cellar'); // Season end: 1 flint, 2 coins
    const after = playTurn(s);
    const raids = after.log.filter((e) => e.kind === 'raid');
    expect(logText(raids[0]!, 0)).toMatch(/^You hold \(Guard 4 vs \d+\): Valour \d+\.$/);
    expect(logText(raids[1]!, 1)).toMatch(/^You are plundered \(Guard 0 vs \d+\): −\d+ coins?\.$/);
    expect(logText(raids[1]!, 0)).toBe(raids[1]!.text);
    const bounty = after.log.filter((e) => e.kind === 'bounty')[1]!; // town 2 pays town 0
    expect([bounty.seat, bounty.targets]).toEqual([0, [2]]);
    expect(readings(bounty)).toEqual([
      'You take a bounty of 1 from P2.',
      'P0 takes a bounty of 1 from P2.',
      'P0 takes a bounty of 1 from you.',
      'P0 takes a bounty of 1 from P2.',
    ]);
    expect(logText(last(after, 'heldBonus'), 0)).toBe('Your defenders are rewarded.');
    expect(logText(last(after, 'seasonEnd'), 1)).toBe('You gather your stores.');
    // A line that names no town has no pieces: everyone reads the text.
    const raid = last(after, 'raidRevealed');
    expect([raid.parts, raid.targets]).toEqual([undefined, undefined]);
  });

  it('E9 R9.5 plunder reads "−1 coin", "−N coins", and a town with none loses none (R17.6)', () => {
    const s = newWwGame(3);
    s.round = 3; // Winter's Raid, strength 7
    s.seats.forEach((t, i) => (t.data.coins = [0, 1, 100][i]!)); // Guard 0: all plundered
    resolveRaid(fx, makeCtx(fxRuleset, s, new Rng(1)));
    const lines = s.log.filter((e) => e.kind === 'raid');
    const lost = lines.map((e) => (e.data as { lost: number }).lost);
    expect(lost.slice(0, 2)).toEqual([0, 1]);
    expect(lost[2]).toBeGreaterThan(1);
    expect(lines.map((e) => e.text.replace(/^.*\): /, ''))).toEqual([
      'no coins to lose.',
      '−1 coin.',
      `−${lost[2]} coins.`,
    ]);
  });

  it('E9 a town named "You" (the tutorial) reads in the second person: "You yield", "You are plundered"', () => {
    const s = table();
    s.seats[0]!.name = 'You';
    build(s, 0, 'tf-toll'); // 1 coin per neighbour that builds
    build(s, 0, 'tf-apiary'); // yields 1 honey
    Object.assign(townData(s, 1).store, { slate: 2 });
    const apiary = setHand(s, 1, ['tf-apiary'])[0]!; // town 1 builds: town 0 collects a toll
    const after = playTurn(s, { 1: build1(apiary) });
    const mine = after.log.filter((e) => e.seat === 0 && e.seq === after.seq);
    expect(mine.map((e) => e.text)).toEqual([
      'You spend tf-stall.',
      'You collect 1 in tolls.',
      'You yield.',
    ]);
    // The same line for every viewer: the name is "You" whoever reads it.
    for (const e of mine)
      for (const v of [0, 1, 'spectator'] as const) expect(logText(e, v)).toBe(e.text);
    const plunder = newWwGame(3);
    plunder.seats[0]!.name = 'You';
    plunder.seats[0]!.data.coins = 1;
    resolveRaid(fx, makeCtx(fxRuleset, plunder, new Rng(1)));
    expect(plunder.log.find((e) => e.kind === 'raid')!.text).toMatch(
      /^You are plundered \(Guard 0 vs \d+\): −1 coin\.$/,
    );
  });

  it('Honours: "You lead", "P0 and you share", and nobody', () => {
    const s = newWwGame(3);
    s.table.honours = ['th-halls', 'th-coins'];
    s.table.leaders = [];
    build(s, 0, 'tf-shrine');
    const ctx = makeCtx(fxRuleset, s, new Rng(1));
    updateHonourLeaders(fx, ctx);
    const [halls, coins] = s.log.slice(-2) as [LogEntry, LogEntry];
    expect([halls.seat, halls.targets]).toEqual([null, [0]]);
    expect(readings(halls)).toEqual([
      'You lead Halls (1).',
      'P0 leads Halls (1).',
      'P0 leads Halls (1).',
      'P0 leads Halls (1).',
    ]);
    expect(coins.targets).toEqual([0, 1, 2]);
    expect(readings(coins)).toEqual([
      'You and P1 and P2 share Coins (5).',
      'P0 and you and P2 share Coins (5).',
      'P0 and P1 and you share Coins (5).',
      'P0 and P1 and P2 share Coins (5).',
    ]);
    s.seats[0]!.tableau = [];
    updateHonourLeaders(fx, ctx);
    const nobody = s.log.at(-1)!;
    expect([nobody.text, nobody.parts, nobody.targets]).toEqual([
      'Nobody leads Halls.',
      undefined,
      undefined,
    ]);
  });

  it('a Great Work tier and the eventsOf entries carry the pieces too', () => {
    const s = table();
    setGreatWork(s, 0, 'tg-crown'); // tier I at 3 labour
    const hut = setHand(s, 0, ['tf-hut'])[0]!; // Spend: 3 labour
    const after = playTurn(s, { 0: { card: hut.id, use: 'spend' } });
    const tier = eventsOf(after)
      .filter((x) => x.event.type === 'tier')
      .at(-1)!;
    expect(logText(tier, 0)).toBe(`You complete ${fx.greatWork('tg-crown').name} tier 1.`);
    expect(logText(tier, 1)).toBe(tier.text);
  });

  it('whole games: each line joins to its text, names only its actor and targets, and reads "You" for them', () => {
    const e = createWindamereEngine();
    // E9: no "You yields", "you is", "You takes": a verb after "you" never takes an -s.
    const thirdPerson = /\b[Yy]ou \w+s\b/;
    for (const seats of [2, 3, 7]) {
      const rng = new Rng(seats + 40);
      // At 2 and 3 towns, town 0 is named "You", as in the tutorial.
      const name = (i: number) => (i === 0 && seats < 7 ? 'You' : `Player ${i + 1}`);
      let s = e.createGame({
        seed: seats + 40,
        seats: Array.from({ length: seats }, (_, i) => ({ name: name(i) })),
      });
      while (s.phase.kind !== 'gameOver') {
        const seat = rng.pick(e.waitingOn(s));
        const legal = e.legalActions(s, seat).filter((a) => a.type !== 'unpick');
        const r = e.applyAction(s, rng.pick(legal));
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      for (const entry of s.log) {
        const where = `${entry.kind} "${entry.text}"`;
        const involved = [entry.seat, ...(entry.targets ?? [])].filter((x) => x !== null);
        const named = (entry.parts ?? []).flatMap((p) => (typeof p === 'string' ? [] : [p.seat]));
        if (entry.parts) expect(joinParts(entry.parts), where).toBe(entry.text);
        for (const seat of named) expect(involved, where).toContain(seat);
        // Every Windamere event about a town names it (so its player reads "You").
        if ((EVENT_TYPES as readonly string[]).includes(entry.kind) && entry.seat !== null) {
          expect(named, where).toContain(entry.seat);
        }
        expect(entry.text, where).not.toMatch(thirdPerson);
        for (const v of [...Array(seats).keys()]) {
          const line = logText(entry, v);
          expect(line, where).not.toMatch(thirdPerson);
          if (named.includes(v)) expect(line, where).toMatch(/\b(You|you|Your)\b/);
          else expect(line, where).toBe(entry.text);
        }
      }
      // Views carry the same lines.
      expect(e.viewFor(s, 1).log).toEqual(s.log.filter((x) => !x.to));
      const over = s.log.at(-1)!;
      expect(over.targets).toEqual(s.result!.winners);
    }
  });
});
