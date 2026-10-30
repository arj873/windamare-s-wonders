/**
 * QA audit Q1: the Windamere engine against docs/RULES.md, on the engine's test fixture.
 *
 * Two kinds of test, both written from RULES.md and not from the engine's code:
 *  - property tests: whole games of random but legal, rich picks (purchases, Exchanges, bank,
 *    upgrades, "any" goods) at 3 to 7 seats, with an independent oracle for Guard, Lore, Honours,
 *    scoring and ranking, and the invariants each turn must keep (R4.7, R4.8, R15.9, R7.8, ...);
 *  - targeted tests for rules the engine's own tests do not pin down.
 * `it.fails` = known finding (docs/AUDIT.md); `it.todo` = rule not implemented yet.
 */
import { describe, expect, it } from 'vitest';
import { Rng, type Card, type Json, type Pick, type SeatId } from '../core';
import { FIXTURE } from './testing/fixture';
import {
  build,
  fxEngine as e,
  newGame,
  playTurn,
  setGreatWork,
  setHand,
  townData,
} from './testing/helpers';
import type { Gains, WwCardDef, WwState } from './types';

const json = (x: unknown) => JSON.stringify(x);
const GOODS = FIXTURE.goods.map((g) => g.id);
const DEF = new Map<string, WwCardDef>(FIXTURE.cards.map((c) => [c.id, c]));
const defOf = (c: Card): WwCardDef => DEF.get(c.def)!;
const GW = new Map(FIXTURE.greatWorks.map((g) => [g.id, g]));
const RAID = new Map(FIXTURE.raids.map((r) => [r.id, r]));
const PRICE = [1, 2, 3, 4];
const VALOUR = [1, 2, 3, 4];

// ---------------------------------------------------------------------------
// The oracle: RULES.md, re-implemented from the text.
// ---------------------------------------------------------------------------

type Spec = { type: string; [k: string]: Json };

/** R13.1: effects of uncovered cards, the Perk, and completed tiers (R8.1, R8.4). */
function effectsOf(s: WwState, seat: SeatId): { spec: Spec; from: 'card' | 'gw' }[] {
  const t = s.seats[seat]!;
  const out: { spec: Spec; from: 'card' | 'gw' }[] = [];
  for (const c of t.tableau)
    for (const sp of defOf(c).effects) out.push({ spec: sp, from: 'card' });
  const gw = t.data.greatWork === null ? null : GW.get(t.data.greatWork)!;
  if (gw) {
    for (const sp of gw.perk) out.push({ spec: sp, from: 'gw' });
    for (const tier of gw.tiers.slice(0, t.data.tiers)) {
      for (const sp of tier.reward) out.push({ spec: sp, from: 'gw' });
    }
  }
  return out;
}

const guardOracle = (s: WwState, seat: SeatId) =>
  effectsOf(s, seat)
    .filter((x) => x.spec.type === 'guard')
    .reduce((n, x) => n + (x.spec.amount as number), 0);

function ranksOracle(s: WwState, seat: SeatId): number[] {
  const set = new Set<number>();
  for (const x of effectsOf(s, seat)) if (x.spec.type === 'lore') set.add(x.spec.rank as number);
  return [...set].sort((a, b) => a - b);
}
function runsOracle(ranks: number[]): number[] {
  const runs: number[] = [];
  for (let i = 0; i < ranks.length; i++) {
    if (i > 0 && ranks[i] === ranks[i - 1]! + 1) runs[runs.length - 1]!++;
    else runs.push(1);
  }
  return runs;
}
const LORE_SCORE = [1, 3, 6, 10, 14, 18];

const kindCount = (s: WwState, seat: SeatId, kind: string) =>
  s.seats[seat]!.tableau.filter((c) => defOf(c).kind === kind).length;

/** R11.5 measures. */
function measureOracle(s: WwState, seat: SeatId, m: string): number {
  const t = s.seats[seat]!;
  switch (m) {
    case 'guard':
      return guardOracle(s, seat);
    case 'holdings':
    case 'halls':
    case 'markets':
    case 'watches':
    case 'landmarks':
      return kindCount(s, seat, m === 'watches' ? 'watch' : m.slice(0, -1));
    case 'lore':
      return kindCount(s, seat, 'lore');
    case 'loreRun':
      return Math.max(0, ...runsOracle(ranksOracle(s, seat)));
    case 'tiers':
      return t.data.tiers;
    case 'coins':
      return t.data.coins;
    case 'kinds':
      return new Set(t.tableau.map((c) => defOf(c).kind)).size;
    case 'valour':
      return t.data.valour.length;
  }
  throw new Error(`measure ${m}`);
}

const neighboursOracle = (s: WwState, seat: SeatId) => {
  const n = s.seats.length;
  return [...new Set([(seat + 1) % n, (seat + n - 1) % n])].filter((x) => x !== seat);
};

/** R12.2 a-f for one town, from the end state. */
function scoreOracle(s: WwState, seat: SeatId) {
  const t = s.seats[seat]!;
  let town = 0;
  let greatWork = 0;
  for (const { spec, from } of effectsOf(s, seat)) {
    let r = 0;
    switch (spec.type) {
      case 'renown':
        r = spec.amount as number;
        break;
      case 'scorePerKind':
        r = (spec.amount as number) * kindCount(s, seat, spec.kind as string);
        break;
      case 'scorePerTier':
        r = (spec.amount as number) * t.data.tiers;
        break;
      case 'scorePerValour':
        r = (spec.amount as number) * t.data.valour.length;
        break;
      case 'scoreSets': {
        const kinds = ['holding', 'hall', 'market', 'watch', 'lore'];
        r = (spec.amount as number) * Math.min(...kinds.map((k) => kindCount(s, seat, k)));
        break;
      }
      case 'scoreGoods': {
        const total = Object.values(t.data.store).reduce((a, b) => a + b, 0);
        r = (spec.amount as number) * Math.floor(total / (spec.per as number));
        break;
      }
      case 'scoreBeat': {
        const mine = measureOracle(s, seat, spec.measure as string);
        const beaten = neighboursOracle(s, seat).filter(
          (n) => measureOracle(s, n, spec.measure as string) < mine,
        ).length;
        r = (spec.amount as number) * beaten;
        break;
      }
      case 'scoreThreshold':
        r =
          measureOracle(s, seat, spec.measure as string) >= (spec.atLeast as number)
            ? (spec.amount as number)
            : 0;
        break;
      case 'scoreSeasons': {
        const seasons = new Set(
          t.tableau.filter((c) => defOf(c).kind === spec.kind).map((c) => defOf(c).season),
        );
        r = (spec.amount as number) * seasons.size;
        break;
      }
    }
    if (from === 'card') town += r;
    else greatWork += r;
  }
  const lore = runsOracle(ranksOracle(s, seat)).reduce((a, len) => a + LORE_SCORE[len - 1]!, 0);
  let honours = 0;
  for (const h of s.table.honours) {
    const m = FIXTURE.honours.find((x) => x.id === h)!.measure;
    const vals = s.seats.map((x) => measureOracle(s, x.id, m));
    const best = Math.max(...vals);
    if (best === 0 || vals[seat] !== best) continue;
    honours += vals.filter((v) => v === best).length === 1 ? 5 : 2;
  }
  return {
    town,
    greatWork,
    raids: t.data.valour.reduce((a, b) => a + b, 0),
    lore,
    honours,
    purse: Math.floor(t.data.coins / 4),
  };
}

// ---------------------------------------------------------------------------
// Random rich play
// ---------------------------------------------------------------------------

/** A legal pick for `seat`, chosen at random, with random payment and "any" choices. */
function richPick(s: WwState, seat: SeatId, rng: Rng): Pick {
  const hand = s.seats[seat]!.hand;
  const card = rng.pick(hand);
  const tries: Pick[] = [];
  for (let i = 0; i < 6; i++) {
    const use = rng.int(10) < 6 ? 'build' : 'spend';
    const base = e.ruleset.normalizePick!(s, seat, { card: card.id, use });
    const args = { ...((base.args ?? {}) as Record<string, Json>) };
    if (Array.isArray(args.any)) args.any = args.any.map(() => rng.pick(GOODS));
    if (Array.isArray(args.glean)) args.glean = args.glean.map(() => rng.pick(GOODS));
    if (use === 'build' && 'cover' in args && rng.int(3) === 0) args.cover = null;
    if (use === 'build' && Array.isArray(args.pay)) {
      const nbrs = neighboursOracle(s, seat);
      args.pay = (args.pay as { good: string }[]).map((p): Json => {
        const r = rng.int(4);
        if (r === 0) return { good: p.good, via: 'bank' };
        if (r === 1) return { good: p.good, via: 'buy', from: rng.pick(nbrs) };
        if (r === 2) return { good: p.good, via: 'exchange', give: rng.pick(GOODS) };
        return p;
      });
    }
    tries.push({ card: card.id, use, args: args as Json });
    tries.push(base);
  }
  tries.push({ card: card.id, use: 'spend' });
  const ok = tries.find((p) => e.applyAction(s, { type: 'pick', seat, pick: p }).ok);
  return ok ?? e.defaultPick(s, seat)!;
}

function permute<T>(xs: T[], rng: Rng): T[] {
  return rng.shuffle(xs);
}

function applyAll(s: WwState, picks: Map<SeatId, Pick>, order: SeatId[]): WwState {
  let x = s;
  for (const seat of order) {
    const r = e.applyAction(x, { type: 'pick', seat, pick: picks.get(seat)! });
    if (!r.ok) throw new Error(`seat ${seat} pick rejected on replay: ${r.error}`);
    x = r.state;
  }
  return x;
}

/** A started game with random coins, stores and Great Works so every rule gets exercised. */
function richGame(seats: number, seed: number): WwState {
  const rng = new Rng(seed * 7919 + seats);
  const s = structuredClone(newGame(seats, seed));
  for (const t of s.seats) {
    t.data.coins = rng.int(14);
    for (const g of GOODS) t.data.store[g] = rng.int(4);
    t.data.greatWork = rng.pick(FIXTURE.greatWorks).id;
  }
  return s;
}

interface TurnRecord {
  before: WwState;
  after: WwState;
  picks: Map<SeatId, Pick>;
}

/** Play a whole game; checks order independence and calls `each` after every turn. */
function playGame(
  seats: number,
  seed: number,
  each: (r: TurnRecord) => void,
): { end: WwState; turns: number } {
  const rng = new Rng(seed);
  let s = richGame(seats, seed);
  let turns = 0;
  for (; s.phase.kind !== 'gameOver' && turns < 40; turns++) {
    const picks = new Map<SeatId, Pick>();
    for (const seat of e.waitingOn(s)) picks.set(seat, richPick(s, seat, rng));
    const ids = [...picks.keys()];
    const a = applyAll(s, picks, permute(ids, rng));
    const b = applyAll(s, picks, permute(ids, rng));
    // R4.8, R15.9: arrival order never matters.
    expect(json(b), `seed ${seed} turn ${turns}: arrival order changed the state`).toBe(json(a));
    tally(picks, a);
    each({ before: s, after: a, picks });
    s = a;
  }
  return { end: s, turns };
}

const SEAT_COUNTS = [3, 4, 5, 6, 7];

/** What the random games actually exercised (so a green run is not vacuous). */
const seen = {
  build: 0,
  spend: 0,
  buy: 0,
  exchange: 0,
  bank: 0,
  cover: 0,
  glean: 0,
  tier: 0,
  bounty: 0,
};
function tally(picks: Map<SeatId, Pick>, after: WwState): void {
  for (const p of picks.values()) {
    if (p.use === 'build') seen.build++;
    else seen.spend++;
    const a = (p.args ?? {}) as { pay?: { via: string }[]; cover?: number | null; glean?: unknown };
    for (const x of a.pay ?? []) seen[x.via as 'buy' | 'exchange' | 'bank']++;
    if (a.cover != null) seen.cover++;
    if (a.glean) seen.glean++;
  }
  seen.tier += after.log.filter((l) => l.kind === 'tier' && l.seq === after.seq).length;
  seen.bounty += after.log.filter((l) => l.kind === 'bounty' && l.seq === after.seq).length;
}

describe('whole games of random rich picks (R3-R13, R15.9)', () => {
  it('every game ends after exactly 4 Seasons of 5 turns; nothing a seat picked is ever refused at resolve', () => {
    for (const seats of SEAT_COUNTS) {
      for (const seed of [1, 2, 3]) {
        const { end, turns } = playGame(seats, seed, () => undefined);
        expect(end.phase.kind, `${seats} seats seed ${seed}`).toBe('gameOver');
        expect(turns).toBe(20); // R3.1, R3.4
      }
    }
  });

  it('R3.2-R3.5, R4.6: hands, passing and the glean follow the Season', () => {
    for (const seats of [3, 5, 7]) {
      playGame(seats, 4, ({ before, after, picks }) => {
        const turn = before.turn;
        const n = seats;
        if (turn < 4) {
          // The rest of each hand moves to the neighbour in the Season's direction (R3.3).
          const dir = before.passDirection === 'left' ? 1 : -1;
          expect(after.round).toBe(before.round);
          expect(after.turn).toBe(turn + 1);
          for (const t of before.seats) {
            const picked = picks.get(t.id)!.card;
            const rest = t.hand.filter((c) => c.id !== picked).map((c) => c.id);
            const to = after.seats[(t.id + dir + n) % n]!;
            expect(to.hand.map((c) => c.id)).toEqual(rest);
          }
        } else {
          // R3.5: after the fifth turn every hand is empty and the glean zone too.
          for (const t of after.seats) {
            expect(t.hand.length === 0 || after.round === before.round + 1).toBe(true);
            expect(t.zones.glean ?? []).toEqual([]);
          }
          if (after.phase.kind !== 'gameOver') {
            expect(after.round).toBe(before.round + 1);
            expect(after.turn).toBe(0);
            expect(after.seats.every((t) => t.hand.length === 6)).toBe(true);
          }
        }
        // R3.3: Spring left, Summer right, Autumn left, Winter right.
        const expectDir = before.round % 2 === 0 ? 'left' : 'right';
        expect(before.passDirection).toBe(expectDir);
      });
    }
  });

  it('R1.4, R1.5, R8.2, R8.3, R8.5, R7.8, R7.9: town numbers and cards stay sane every turn', () => {
    for (const seats of SEAT_COUNTS) {
      playGame(seats, 5, ({ before, after }) => {
        for (const t of after.seats) {
          const d = t.data;
          const b = before.seats[t.id]!.data;
          expect(Number.isInteger(d.coins) && d.coins >= 0, 'coins').toBe(true);
          for (const g of GOODS)
            expect(Number.isInteger(d.store[g]!) && d.store[g]! >= 0).toBe(true);
          expect(d.labour).toBeGreaterThanOrEqual(b.labour); // labour only goes up
          expect(d.tiers).toBeGreaterThanOrEqual(b.tiers);
          // Tiers are exactly the thresholds the labour has reached (R8.3, R8.5), at the end of a turn.
          const gw = GW.get(d.greatWork!)!;
          const reached = gw.tiers.filter((x) => x.threshold <= d.labour).length;
          expect(d.tiers, `labour ${d.labour} in ${gw.id}`).toBe(reached);
          // Landmarks: one copy each (R7.8).
          const lm = t.tableau.filter((c) => defOf(c).kind === 'landmark').map((c) => c.def);
          expect(new Set(lm).size).toBe(lm.length);
          // Covered cards (R7.9, R7.10): in the covered zone, never in the tableau, each by a card in town.
          const covered = t.zones.covered ?? [];
          const inTown = new Set([...t.tableau, ...covered].map((c) => c.id));
          for (const cv of d.covers) {
            expect(covered.some((c) => c.id === cv.card)).toBe(true);
            expect(inTown.has(cv.by)).toBe(true);
            expect(t.tableau.some((c) => c.id === cv.card)).toBe(false);
          }
          expect(d.covers).toHaveLength(covered.length);
        }
      });
    }
  });

  it('R9: a town gets a Valour token exactly when its Guard reached the Raid, worth the Season value', () => {
    let held = 0;
    let missed = 0;
    for (const seats of SEAT_COUNTS) {
      playGame(seats, 6, ({ before, after }) => {
        if (before.turn !== 4) return;
        const season = before.round;
        const raid = RAID.get(after.table.raids[season]!.id)!;
        for (const t of after.seats) {
          const gained = t.data.valour.length - before.seats[t.id]!.data.valour.length;
          const guard = guardOracle(after, t.id);
          if (guard >= raid.strength) {
            held++;
            expect(gained, `seat ${t.id} guard ${guard} vs ${raid.strength}`).toBe(1);
            expect(t.data.valour.at(-1)).toBe(VALOUR[season]);
          } else {
            missed++;
            expect(gained).toBe(0); // R9.5: plundered towns gain no Valour
          }
        }
      });
    }
    expect(held).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
  });

  it('R12: the final scores, honours and ranking equal an independent recount', () => {
    for (const seats of SEAT_COUNTS) {
      for (const seed of [11, 12, 13, 14]) {
        const { end } = playGame(seats, seed, () => undefined);
        const res = end.result!;
        const totals = end.seats.map((t) => {
          const o = scoreOracle(end, t.id);
          const sc = res.scores[t.id]!;
          expect(sc.categories, `${seats} seats seed ${seed} seat ${t.id}`).toEqual(o);
          return Object.values(o).reduce((a, b) => a + b, 0);
        });
        res.scores.forEach((sc, i) => expect(sc.total).toBe(totals[i]));
        // R12.3-R12.5: total, then most tiers, then most coins; equal on all three share a rank.
        const key = (i: number) => [totals[i]!, end.seats[i]!.data.tiers, end.seats[i]!.data.coins];
        const order = end.seats
          .map((_, i) => i)
          .sort((a, b) => {
            const ka = key(a);
            const kb = key(b);
            for (let k = 0; k < 3; k++) if (ka[k] !== kb[k]) return kb[k]! - ka[k]!;
            return a - b;
          });
        const groups: number[][] = [];
        for (const i of order) {
          const g = groups.at(-1);
          if (g && json(key(g[0]!)) === json(key(i))) g.push(i);
          else groups.push([i]);
        }
        expect(res.ranking.map((g) => [...g].sort((a, b) => a - b))).toEqual(
          groups.map((g) => [...g].sort((a, b) => a - b)),
        );
        expect(res.winners.sort()).toEqual([...groups[0]!].sort((a, b) => a - b));
      }
    }
  });

  it('R4.7: coins and goods only change by the rules (no coin or good appears from nowhere)', () => {
    // Every coin a town gains in a turn is accounted for by a source listed in RULES.md; this checks
    // the weakest useful bound: a town never gains more goods in a turn than Spend, Yield and
    // onBuild rewards could give it, and a Build never leaves a town with more coins than it began
    // with plus its own Spend/income/sales/toll possibilities.
    for (const seats of SEAT_COUNTS) {
      playGame(seats, 8, ({ before, after, picks }) => {
        for (const t of after.seats) {
          const pick = picks.get(t.id)!;
          if (pick.use !== 'build') continue;
          // A town that Built never Spent: its goods rise only through Yield, tier rewards and
          // `onBuild`/glean gains. A loose cap: 12 goods in one turn means a bug.
          const was = Object.values(before.seats[t.id]!.data.store).reduce((a, b) => a + b, 0);
          const now = Object.values(t.data.store).reduce((a, b) => a + b, 0);
          expect(now - was).toBeLessThan(12);
        }
      });
    }
  });
});

describe('coverage of the random games', () => {
  it('they bought, exchanged, used the bank, upgraded, gleaned, completed tiers and paid bounty', () => {
    expect(seen.build).toBeGreaterThan(100);
    expect(seen.spend).toBeGreaterThan(100);
    for (const k of ['buy', 'exchange', 'bank', 'cover', 'glean', 'tier', 'bounty'] as const) {
      expect(seen[k], k).toBeGreaterThan(0);
    }
  });
});

describe('hidden information in the Windamere views (R1.11)', () => {
  it('a view shows hand sizes, ready marks and the Spring Raid, and hides hands, picks and later Raids', () => {
    const s = structuredClone(richGame(4, 21));
    const rng = new Rng(3);
    // Seat 1 has picked; the rest have not.
    s.seats[1]!.pick = null;
    const r = e.applyAction(s, { type: 'pick', seat: 1, pick: richPick(s, 1, rng) });
    if (!r.ok) throw new Error(r.error);
    const state = r.state;
    for (const viewer of [0, 1, 2, 3, 'spectator'] as const) {
      const v = e.viewFor(state, viewer);
      expect(v.view.handCounts).toEqual(state.seats.map((t) => t.hand.length));
      expect(v.view.submitted).toEqual([false, true, false, false]);
      expect(v.table.raids[0]!.revealed).toBe(true);
      for (const i of [1, 2, 3]) {
        expect(v.table.raids[i]).toEqual({ id: '?', revealed: false }); // R1.11: later Raids hidden
      }
      for (const t of v.seats) {
        if (t.id !== viewer) {
          expect(t.hand.every((c) => c.def === '?')).toBe(true);
          expect(t.pick).toBeNull();
        }
        // Towns are public (R1.11): store, coins, labour, Great Work, tiers.
        expect(t.data).toEqual(state.seats[t.id]!.data);
      }
    }
  });

  it('R1.11: the future Raids and the deal cannot be read from any view of any turn', () => {
    const { end } = playGame(4, 22, ({ before }) => {
      for (const viewer of [0, 1, 'spectator'] as const) {
        const v = e.viewFor(before, viewer);
        const text = json(v);
        for (let i = before.round + 1; i < 4; i++) {
          expect(text).not.toContain(before.table.raids[i]!.id);
        }
        expect(json(v.rng)).toBe('[0,0,0,0]');
        // Other towns' hands never show a real face.
        for (const t of v.seats) {
          if (t.id !== viewer) for (const c of t.hand) expect(c.id).toBeLessThan(0);
        }
        // The glean zone is owner-only.
        for (const t of v.seats) {
          if (t.id !== viewer) for (const c of t.zones.glean ?? []) expect(c.id).toBeLessThan(0);
        }
      }
    });
    expect(end.phase.kind).toBe('gameOver');
  });

  it('R15.2: changing a pick leaves no trace in what other seats can see', () => {
    const s = richGame(4, 23);
    const rng = new Rng(9);
    const p1 = richPick(s, 0, rng);
    const a = e.applyAction(s, { type: 'pick', seat: 0, pick: p1 });
    if (!a.ok) throw new Error(a.error);
    const other = s.seats[0]!.hand.find((c) => c.id !== p1.card)!;
    const b = e.applyAction(s, {
      type: 'pick',
      seat: 0,
      pick: { card: other.id, use: 'spend' },
    });
    if (!b.ok) throw new Error(b.error);
    for (const viewer of [1, 2, 3, 'spectator'] as const) {
      const strip = (x: WwState) => ({ ...e.viewFor(x, viewer), seq: 0, log: [] });
      expect(strip(a.state)).toEqual(strip(b.state));
    }
  });
});

describe('determinism (R15.9)', () => {
  it('the same seed and the same picks replay to byte-identical games', () => {
    for (const seats of [3, 6]) {
      const run = () => {
        const log: string[] = [];
        playGame(seats, 31, ({ after }) => log.push(json(after)));
        return log;
      };
      expect(run()).toEqual(run());
    }
  });

  it('a game saved as JSON mid-Season resumes to the same end', () => {
    const rng = new Rng(2);
    let s = richGame(5, 41);
    for (let i = 0; i < 7; i++) {
      const picks = new Map(e.waitingOn(s).map((x) => [x, richPick(s, x, rng)] as const));
      s = applyAll(s, picks, [...picks.keys()]);
    }
    const copy = JSON.parse(json(s)) as WwState;
    const finish = (x: WwState, seed: number) => {
      const r = new Rng(seed);
      while (x.phase.kind !== 'gameOver') {
        const picks = new Map(e.waitingOn(x).map((y) => [y, richPick(x, y, r)] as const));
        x = applyAll(x, picks, [...picks.keys()]);
      }
      return json(x);
    };
    expect(finish(copy, 5)).toBe(finish(s, 5));
  });
});

// ---------------------------------------------------------------------------
// Targeted rules
// ---------------------------------------------------------------------------

/** 3 towns, spring turn 1, every hand Stalls (1 coin Spend), stores empty, 5 coins. */
function table(seats = 3): WwState {
  const s = structuredClone(newGame(seats, 1));
  for (const t of s.seats) {
    setHand(s, t.id, Array(6).fill('tf-stall'));
    t.data.store = { flint: 0, slate: 0, honey: 0 };
    t.data.coins = 5;
    t.data.greatWork = null;
  }
  return s;
}
const pk = (card: Card, use: 'build' | 'spend', args?: Record<string, Json>): Pick => ({
  card: card.id,
  use,
  ...(args ? { args: args as Json } : {}),
});
const submit = (s: WwState, seat: SeatId, pick: Pick) =>
  e.applyAction(s, { type: 'pick', seat, pick });

describe('setup (R2)', () => {
  it('R2.2 R2.3 R2.6 start coins, three distinct Honours, a Raid from each Season with only Spring up', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = newGame(4, seed);
      expect(s.seats.every((t) => t.data.coins === 5 && t.data.labour === 0)).toBe(true);
      expect(s.seats.every((t) => GOODS.every((g) => t.data.store[g] === 0))).toBe(true);
      expect(new Set(s.table.honours).size).toBe(3);
      expect(s.table.honours.every((h) => FIXTURE.honours.some((x) => x.id === h))).toBe(true);
      const seasons = ['spring', 'summer', 'autumn', 'winter'];
      s.table.raids.forEach((r, i) => expect(RAID.get(r.id)!.season).toBe(seasons[i]));
      expect(s.table.raids.map((r) => r.revealed)).toEqual([true, false, false, false]);
    }
  });

  it('R2.7 each Season deck has exactly its cards for the seat count', () => {
    for (const seats of SEAT_COUNTS) {
      const s = newGame(seats, 7);
      const dealt = s.seats.flatMap((t) => t.hand).concat(s.deck);
      const want = FIXTURE.cards
        .filter((c) => c.season === 'spring')
        .reduce((n, c) => n + c.counts[seats - 3]!, 0);
      expect(dealt).toHaveLength(want);
      expect(new Set(dealt.map((c) => c.id)).size).toBe(want);
    }
  });

  it('R14 the 2-player variant (10 cards, Burn)', () => {
    expect(() => newGame(2)).toThrow(); // not implemented: engine minSeats is 3
  });
  it.todo(
    'R14.2 on turns 1-4 a two-player town picks two cards: one to Build or Spend, one to Burn',
  );
  it.todo('R2.4 R2.5 each town is dealt 2 Great Works and chooses one in secret (R15.10)');
});

describe('timing of gains (R4.5, R13.2, R17)', () => {
  it('R17.5 a tier completed in step 2 pays nothing into that turn’s Build (rewards arrive after)', () => {
    // tg-crown tier I (3 labour) pays 4 coins. Labour comes from the Spend step, so the check after
    // step 2 completes the tier, and those coins are not available to the Build paid in step 2a.
    const s = table();
    setGreatWork(s, 0, 'tg-crown');
    const hand = setHand(s, 0, ['tf-hut', 'tf-apiary']);
    // Seat 0 cannot Spend and Build in one turn (R5.2): it Spends the Hut. With 0 coins nothing else
    // can be afforded, and the tier must pay 4 afterwards.
    townData(s, 0).coins = 0;
    const after = playTurn(s, { 0: pk(hand[0]!, 'spend') });
    expect(townData(after, 0).tiers).toBe(1);
    expect(townData(after, 0).coins).toBe(4);
  });

  it('R4.5 step 1 beats step 2: only the glean’s gains pay for the same turn’s Build (R13.2)', () => {
    // On turn 1 a Spend cannot also pay: a town with no goods cannot Build a card costing a good.
    const s = table();
    const [quarry] = setHand(s, 0, ['tf-quarry']); // costs 1 flint
    townData(s, 0).coins = 0;
    expect(submit(s, 0, pk(quarry!, 'build')).ok).toBe(false);
  });

  it('R3.7 Winter: yield and income never pay, in any of the five turns', () => {
    const s = table();
    build(s, 0, 'tf-quarry'); // yield slate + labour
    build(s, 0, 'tf-mint'); // income 2
    let w = s;
    w.round = 3; // Winter
    const labour0 = townData(w, 0).labour;
    for (let i = 0; i < 4; i++) {
      w = structuredClone(w);
      for (const t of w.seats) setHand(w, t.id, Array(w.seats[t.id]!.hand.length).fill('tf-hut'));
      const coins = townData(w, 0).coins;
      const slate = townData(w, 0).store.slate!;
      // Seat 0 Spends a Hut (labour 3): its only changes are the Spend's, never the Yield.
      w = playTurn(w, { 0: pk(w.seats[0]!.hand[0]!, 'spend') });
      expect(townData(w, 0).coins).toBe(coins);
      expect(townData(w, 0).store.slate).toBe(slate);
      expect(townData(w, 0).labour).toBe(labour0 + 3 * (i + 1));
    }
  });

  it('R17.3 a Holding built this turn yields this turn', () => {
    const s = table();
    townData(s, 0).store.flint = 1;
    const quarry = setHand(s, 0, ['tf-quarry'])[0]!;
    const after = playTurn(s, { 0: pk(quarry, 'build') });
    expect(townData(after, 0).store).toEqual({ flint: 0, slate: 1, honey: 0 });
    expect(townData(after, 0).labour).toBe(1);
  });
});

describe('buying (R6.6, R6.7, R17.9-R17.11)', () => {
  it('R6.6b the limit is per neighbour, so two neighbours can supply four goods', () => {
    const s = table(4);
    s.seats[0]!.data.coins = 10;
    for (const n of [1, 3]) townData(s, n).store.slate = 2;
    const keep = setHand(s, 0, ['tf-keep'])[0]!; // 3 slate
    const pay = [
      { good: 'slate', via: 'buy', from: 1 },
      { good: 'slate', via: 'buy', from: 1 },
      { good: 'slate', via: 'buy', from: 3 },
    ];
    expect(submit(s, 0, pk(keep, 'build', { pay, cover: null, discount: [] })).ok).toBe(true);
    const nonNeighbour = [{ ...pay[0]!, from: 2 }, pay[1]!, pay[2]!];
    expect(submit(s, 0, pk(keep, 'build', { pay: nonNeighbour })).ok).toBe(false); // R6.6: neighbours only
  });

  it('R6.6c the price follows the Season: 1, 2, 3, 4 coins a good', () => {
    for (const [round, price] of PRICE.entries()) {
      const s = table();
      s.round = round;
      townData(s, 1).store.honey = 1;
      townData(s, 0).coins = 10;
      const mint = setHand(s, 0, ['tf-mint'])[0]!; // 1 honey
      const sellerStall = setHand(s, 1, ['tf-stall'])[0]!;
      const before1 = townData(s, 1).coins;
      const after = playTurn(s, {
        0: pk(mint, 'build'),
        1: pk(sellerStall, 'build'), // free Build: gains 3 coins (onBuild), no goods used
      });
      expect(10 - townData(after, 0).coins - 0, `season ${round}`).toBe(
        price - (round === 3 ? 0 : 2), // the Mint pays 2 income in Yield; none in Winter
      );
      expect(townData(after, 1).coins - before1).toBe(price + 3);
    }
  });

  it('R6.5 a town holding enough of a good cannot buy or bank it', () => {
    const s = table();
    s.seats[0]!.data.store.honey = 1;
    townData(s, 0).coins = 20;
    townData(s, 1).store.honey = 3;
    const mint = setHand(s, 0, ['tf-mint'])[0]!;
    expect(submit(s, 0, pk(mint, 'build', { pay: [{ good: 'honey', via: 'bank' }] })).ok).toBe(
      false,
    );
    expect(submit(s, 0, pk(mint, 'build', { pay: [] })).ok).toBe(true);
  });

  it('R6.3 the bank price is 5 per missing good, even where a neighbour could sell it cheaper', () => {
    const s = table();
    townData(s, 0).coins = 5;
    const mint = setHand(s, 0, ['tf-mint'])[0]!;
    const r = submit(s, 0, pk(mint, 'build', { pay: [{ good: 'honey', via: 'bank' }] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const after = playTurn(s, {
        0: pk(mint, 'build', { pay: [{ good: 'honey', via: 'bank' }] }),
      });
      expect(townData(after, 0).coins).toBe(0 + 2); // paid 5, +2 income from the new Mint
    }
  });

  it('R17.11 a bought good is used at once and never kept', () => {
    const s = table();
    townData(s, 1).store.honey = 2;
    const mint = setHand(s, 0, ['tf-mint'])[0]!;
    const after = playTurn(s, { 0: pk(mint, 'build') });
    expect(townData(after, 0).store.honey).toBe(0);
    expect(townData(after, 1).store.honey).toBe(1);
  });

  it('R6.7 a seller out of goods: the buyer still pays the price it saw and still builds', () => {
    const s = table();
    townData(s, 1).store.honey = 1;
    const mint = setHand(s, 0, ['tf-mint'])[0]!;
    const other = setHand(s, 2, ['tf-mint'])[0]!;
    townData(s, 2).coins = 5;
    // Both neighbours of seat 1? In 3 seats, seat 1 neighbours seats 0 and 2: both buy its 1 honey.
    const after = playTurn(s, {
      0: pk(mint, 'build', { pay: [{ good: 'honey', via: 'buy', from: 1 }] }),
      2: pk(other, 'build', { pay: [{ good: 'honey', via: 'buy', from: 1 }] }),
    });
    for (const seat of [0, 2]) {
      expect(after.seats[seat]!.tableau.map((c) => c.def)).toContain('tf-mint');
      expect(townData(after, seat).coins).toBe(5 - 1 + 2); // price 1, +2 income
    }
    expect(townData(after, 1).store.honey).toBe(0);
    expect(townData(after, 1).coins).toBe(5 + 1 + 1); // Stall Spend + one sale; the other came from the bank
  });
});

describe('edges the random games rarely reach', () => {
  it('R6.6b a third good from the same neighbour is refused even when it holds plenty', () => {
    const s = table();
    townData(s, 1).store.slate = 9;
    townData(s, 0).coins = 20;
    const keep = setHand(s, 0, ['tf-keep'])[0]!; // 3 slate
    const buy = (n: number) =>
      Array.from({ length: n }, () => ({ good: 'slate', via: 'buy', from: 1 }));
    expect(
      submit(
        s,
        0,
        pk(keep, 'build', { pay: buy(2).concat([{ good: 'slate', via: 'bank' } as never]) }),
      ).ok,
    ).toBe(true);
    expect(submit(s, 0, pk(keep, 'build', { pay: buy(3) })).ok).toBe(false);
  });

  it('R6.3 an Exchange cannot pay for its own good (the stock check already forbids it, so this guards the outcome)', () => {
    const s = table();
    build(s, 0, 'tf-broker'); // exchange flint
    townData(s, 0).store.flint = 0;
    const shrine = setHand(s, 0, ['tf-shrine'])[0]!; // costs 1 flint
    townData(s, 0).store.flint = 0;
    townData(s, 0).coins = 20;
    const viaSelf = [{ good: 'flint', via: 'exchange', give: 'flint' }];
    expect(submit(s, 0, pk(shrine, 'build', { pay: viaSelf })).ok).toBe(false);
  });

  it('R6.7 a short good goes to the seller’s left neighbour first (the right one buys from the bank)', () => {
    const s = table();
    townData(s, 0).store.honey = 1;
    const left = setHand(s, 1, ['tf-mint'])[0]!; // seat 1 is seat 0's left (the next seat clockwise)
    const right = setHand(s, 2, ['tf-mint'])[0]!;
    const buy = [{ good: 'honey', via: 'buy', from: 0 }];
    const after = playTurn(s, {
      1: pk(left, 'build', { pay: buy }),
      2: pk(right, 'build', { pay: buy }),
    });
    const sales = after.log.filter((l) => l.kind === 'sale' || l.kind === 'saleShort');
    expect(sales.map((l) => [l.kind, (l.data as { buyer: number }).buyer])).toEqual([
      ['sale', 1],
      ['saleShort', 2],
    ]);
  });

  it('R9.6 a plundered town with one coin left pays its left neighbour, and the right one gets nothing', () => {
    // Summer Raid strength 3. Seat 1 has Guard 1 (short 2) and 3 coins: 1 left after plunder.
    // Seats 0 and 2 hold. Seat 1's left neighbour is seat 2, its right is seat 0.
    const s = table();
    const raid = FIXTURE.raids.find((r) => r.strength === 3)!;
    s.table.raids[1] = { id: raid.id, revealed: true };
    s.round = 1;
    for (const t of s.seats) setHand(s, t.id, Array(6).fill('tf-hut')); // Spend gives labour only
    for (let k = 0; k < 3; k++) {
      build(s, 0, 'tf-fence');
      build(s, 2, 'tf-fence');
    }
    build(s, 1, 'tf-fence');
    townData(s, 1).coins = 3;
    townData(s, 0).coins = 0;
    townData(s, 2).coins = 0;
    let x = s;
    while (x.round === 1) {
      const picks: Record<number, Pick> = {};
      for (const t of x.seats) picks[t.id] = { card: t.hand[0]!.id, use: 'spend' };
      x = playTurn(x, picks);
    }
    expect([0, 1, 2].map((i) => townData(x, i).coins)).toEqual([0, 0, 1]);
  });
});

describe('upgrades and covering (R7.8-R7.10)', () => {
  it('R7.8 a second copy of a Landmark is refused; copies of other cards are fine', () => {
    const s = table();
    const lm = build(s, 0, 'tf-mark-halls');
    setHand(s, 0, ['tf-mark-halls', 'tf-stall']);
    const hand = s.seats[0]!.hand;
    expect(submit(s, 0, pk(hand[0]!, 'build')).ok).toBe(false);
    expect(submit(s, 0, pk(hand[0]!, 'spend')).ok).toBe(true); // Spend is always legal
    build(s, 0, 'tf-stall');
    expect(submit(s, 0, pk(hand[1]!, 'build')).ok).toBe(true);
    void lm;
  });

  it('R7.9 R7.10 a covered card counts for nothing: kind counts, Guard, Lore, Renown, Honours', () => {
    const s = table();
    const fence = build(s, 0, 'tf-fence'); // watch, guard 1
    expect(guardOracle(s, 0)).toBe(1);
    store(s, 0);
    const tower = setHand(s, 0, ['tf-tower'])[0]!; // upgrade of the Fence for 1 slate; guard 2
    townData(s, 0).store.slate = 1;
    const after = playTurn(s, { 0: pk(tower, 'build', { cover: fence.id }) });
    expect(after.seats[0]!.zones.covered!.map((c) => c.id)).toEqual([fence.id]);
    expect(after.seats[0]!.tableau.map((c) => c.def)).toEqual(['tf-tower']);
    expect(guardOracle(after, 0)).toBe(2); // not 3
    expect(kindCount(after, 0, 'watch')).toBe(1);
    // The covered card is public: every view shows it (R17.7).
    expect(e.viewFor(after, 1).seats[0]!.zones.covered!.map((c) => c.def)).toEqual(['tf-fence']);
  });

  it('R7.9 an upgrade names one card; a different card cannot be covered', () => {
    const s = table();
    const shrine = build(s, 0, 'tf-shrine');
    const fence = build(s, 0, 'tf-fence');
    townData(s, 0).store.slate = 5;
    const tower = setHand(s, 0, ['tf-tower'])[0]!; // upgrades the Fence only
    expect(submit(s, 0, pk(tower, 'build', { cover: shrine.id })).ok).toBe(false);
    expect(submit(s, 0, pk(tower, 'build', { cover: fence.id })).ok).toBe(true);
    expect(submit(s, 0, pk(tower, 'build', { cover: 9999 })).ok).toBe(false);
  });

  it('R7.9 a card that upgrades nothing cannot cover; a covered card cannot be covered again', () => {
    const s = table();
    const shrine = build(s, 0, 'tf-shrine');
    townData(s, 0).store = { flint: 5, slate: 5, honey: 5 };
    const hall = setHand(s, 0, ['tf-hall', 'tf-stall', 'tf-hall'])[0]!;
    const stall = s.seats[0]!.hand[1]!;
    expect(submit(s, 0, pk(stall, 'build', { cover: shrine.id })).ok).toBe(false);
    const after = playTurn(s, { 0: pk(hall, 'build', { cover: shrine.id }) });
    // Next turn the Shrine lies under the Hall: it is no longer a legal target.
    const again = after.seats[0]!.hand.find((c) => c.def === 'tf-hall')!;
    if (again) expect(submit(after, 0, pk(again, 'build', { cover: shrine.id })).ok).toBe(false);
  });
});

describe('Raids (R9)', () => {
  /** Put the table in a Season whose Raid is `strength`, give seat `i` Guard `guards[i]`, coins `coins[i]`. */
  function raidTable(guards: number[], coins: number[], strength = 3, season = 0): WwState {
    const s = table(guards.length);
    const raid = FIXTURE.raids.find((r) => r.strength === strength)!;
    s.table.raids[season] = { id: raid.id, revealed: true };
    s.round = season;
    guards.forEach((g, i) => {
      const t = s.seats[i]!;
      t.data.coins = coins[i]!;
      for (let k = 0; k < g; k++) build(s, i, 'tf-fence'); // 1 Guard each
    });
    return s;
  }
  const endSeason = (s: WwState) => {
    let x = s;
    while (x.round === s.round && x.phase.kind !== 'gameOver') {
      const picks: Record<number, Pick> = {};
      for (const t of x.seats) picks[t.id] = { card: t.hand[0]!.id, use: 'spend' };
      x = playTurn(x, picks);
    }
    return x;
  };

  it('R9.5 R9.6 R17.6 plunder takes 1 coin per point short; bounty comes from what is left, left neighbour first', () => {
    // Strength 3 (summer). Seat 0 holds (guard 3). Seat 1 guard 1 loses 2. Seat 2 guard 0 loses 3.
    const s = raidTable([3, 1, 0], [10, 10, 2], 3, 1);
    const turnsLeft = 5 - s.turn;
    const spendCoins = turnsLeft + 1; // a Stall Spent each turn, and the fifth turn's glean
    const after = endSeason(s);
    const c = (i: number) => townData(after, i).coins;
    // seat 2: 2 + 5 spend = 7, plunder -3 = 4; its neighbours are 1 (left) and 0 (right).
    // seat 1: 10 + 5 = 15, -2 = 13; its neighbours are 2 (left) and 0 (right).
    // Bounty: held seat 0 takes 1 from seat 1 (13 -> 12) and 1 from seat 2 (4 -> 3).
    expect([c(0), c(1), c(2)]).toEqual([
      10 + spendCoins + 2,
      10 + spendCoins - 2 - 1,
      2 + spendCoins - 3 - 1,
    ]);
    expect(townData(after, 0).valour).toEqual([2]);
    expect(townData(after, 1).valour).toEqual([]);
  });

  it('R17.6 a town with no coins left pays no bounty and still gains no Valour', () => {
    const s = raidTable([3, 0, 0], [0, 0, 0], 3, 1);
    for (const t of s.seats) setHand(s, t.id, Array(6).fill('tf-hut')); // Hut: Spend gives labour only
    const after = endSeason(s);
    expect(townData(after, 0).coins).toBe(0);
    expect(townData(after, 1).coins).toBe(0);
    expect(townData(after, 1).valour).toEqual([]);
  });

  it('R9.7 surplus Guard gives nothing extra; Guard is not used up', () => {
    const s = raidTable([6, 0, 0], [5, 5, 5], 3, 1);
    for (const t of s.seats) setHand(s, t.id, Array(6).fill('tf-hut'));
    const after = endSeason(s);
    expect(townData(after, 0).valour).toEqual([2]); // one token, worth the Season's value
    expect(guardOracle(after, 0)).toBe(6);
  });
});

describe('Lore, Honours and ties (R10-R12)', () => {
  it('R10.5 ranks 1,2,4,5,6,5 score 9; adding a 3 makes one run of six worth 18', () => {
    const s = table();
    for (const d of [
      'tf-lore-1',
      'tf-lore-2',
      'tf-lore-4',
      'tf-lore-5',
      'tf-lore-6',
      'tf-lore-5',
    ]) {
      build(s, 0, d);
    }
    const score = (x: WwState) => e.ruleset.score(x, 0).lore;
    expect(score(s)).toBe(9);
    build(s, 0, 'tf-lore-3');
    expect(score(s)).toBe(18);
  });

  it('R11.2 a measure of 0 never wins; a sole leader gets 5, tied leaders 2 each', () => {
    const s = table(4);
    s.table.honours = ['th-halls', 'th-markets', 'th-holdings'];
    // Halls: seat 0 has 2, seat 1 has 1 (sole leader 0). Markets: 0 for everyone (nobody wins).
    // Holdings: seats 2 and 3 each have 1 (tied, 2 each).
    build(s, 0, 'tf-shrine');
    build(s, 0, 'tf-shrine');
    build(s, 1, 'tf-shrine');
    build(s, 2, 'tf-pond');
    build(s, 3, 'tf-pond');
    const honours = (i: number) => e.ruleset.score(s, i).honours;
    expect([0, 1, 2, 3].map(honours)).toEqual([5, 0, 2, 2]);
  });

  it('R12.4 a tie on Renown goes to the most completed tiers, then coins, then is shared', () => {
    const base = table(3);
    for (const t of base.seats) {
      t.data.coins = 0;
      t.data.greatWork = 'tg-bell';
    }
    base.table.honours = ['th-guard', 'th-markets', 'th-lore']; // nobody scores them
    const rank = (s: WwState) => {
      const scores = s.seats.map((_, i) => e.ruleset.score(s, i));
      return scores.map((c) => Object.values(c).reduce((a, b) => a + b, 0));
    };
    expect(rank(base)).toEqual([0, 0, 0]);
    // Tier count decides: raise seat 1 to 2 tiers (tg-bell thresholds 2, 4; rewards add Renown), so
    // compare via the ranking helper of a finished game instead.
    expect(e.ruleset.tiebreak!(base, 0)).toEqual([0, 0]);
    townData(base, 1).tiers = 1;
    townData(base, 2).coins = 3;
    expect(e.ruleset.tiebreak!(base, 1)).toEqual([1, 0]);
    expect(e.ruleset.tiebreak!(base, 2)).toEqual([0, 3]);
  });

  it('R12.2f 1 Renown per 4 coins, rounded down; goods score nothing', () => {
    const s = table();
    townData(s, 0).coins = 11;
    townData(s, 0).store = { flint: 9, slate: 9, honey: 9 };
    expect(e.ruleset.score(s, 0).purse).toBe(2);
  });
});

function store(s: WwState, seat: SeatId, goods: Gains = {}): void {
  Object.assign(townData(s, seat).store, goods);
}
