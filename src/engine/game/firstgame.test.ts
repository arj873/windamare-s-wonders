/** R19, the First game option (`options: { firstGame: true }`), on the test fixture. */
import { describe, expect, it } from 'vitest';
import { createLookahead, Rng, type DraftEngine, type Pick } from '../core';
import { checkContent, DEFAULT_FIRST_GAME } from './content';
import { createWindamereEngine } from './engine';
import { eventsOf } from './events';
import { FIRST_GAME_OPTION, isFirstGame } from './options';
import { argsOf } from './pick';
import { SHIPPED_FIRST_GAME } from './shipped';
import { FIXTURE } from './testing/fixture';
import { build, fixtureWith, fxEngine as e, setHand, townData } from './testing/helpers';
import type { WwSeat, WwState, WwTable } from './types';

const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
const config = (n: number, seed = 1, firstGame = true) => ({
  seed,
  seats: seatsOf(n),
  options: { [FIRST_GAME_OPTION]: firstGame },
});
const firstGame = (n = 3, seed = 1): WwState => e.createGame(config(n, seed));

/** A random First game to its end; returns every state on the way. */
function playout(engine: DraftEngine<WwSeat, WwTable>, n: number, seed: number): WwState[] {
  const rng = new Rng(seed * 17 + n);
  const states = [engine.createGame(config(n, seed))];
  for (let s = states[0]!; s.phase.kind !== 'gameOver';) {
    const seat = rng.pick(engine.waitingOn(s));
    const legal = engine.legalActions(s, seat).filter((a) => a.type !== 'unpick');
    const r = engine.applyAction(s, rng.pick(legal));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    states.push(s);
  }
  return states;
}

describe('R19 First game', () => {
  it('R19.1 the option is { firstGame: true }, off by default, and every seat sees it', () => {
    expect(e.validateConfig(config(3))).toBeNull();
    expect(e.validateConfig(config(3, 1, false))).toBeNull();
    expect(e.validateConfig({ seed: 1, seats: seatsOf(3), options: { firstGame: 'yes' } })).toBe(
      'option firstGame must be true or false',
    );
    expect(e.validateConfig({ seed: 1, seats: seatsOf(3), options: { firstgame: true } })).toBe(
      'unknown option firstgame (options: firstGame)',
    );
    // Off: the full game, with its Honours and the Great Work choice.
    const off = e.createGame({ seed: 1, seats: seatsOf(3) });
    expect(isFirstGame(off)).toBe(false);
    expect(off.table.honours).toHaveLength(3);
    expect(off.phase.kind).toBe('prompt');
    expect(e.createGame(config(3, 1, false)).phase.kind).toBe('prompt');
    const on = firstGame();
    expect(isFirstGame(on)).toBe(true);
    for (const viewer of [0, 1, 2, 'spectator'] as const) {
      expect(isFirstGame(e.viewFor(on, viewer))).toBe(true);
    }
  });

  it('R19.2 no Honours: none are dealt, none lead, none score', () => {
    const states = playout(e, 4, 2);
    expect(states[0]!.table.honours).toEqual([]);
    expect(states[0]!.table.leaders).toEqual([]);
    const end = states.at(-1)!;
    expect(end.result?.scores.map((sc) => sc.categories.honours)).toEqual([0, 0, 0, 0]);
    expect(eventsOf(end).filter((x) => x.event.type === 'honour')).toEqual([]);
  });

  it('R19.3 no upgrades: an upgrade card is built at full cost and covers nothing', () => {
    const s = structuredClone(firstGame(3, 4));
    townData(s, 0).greatWork = null; // no Perk discount in the way
    const shrine = build(s, 0, 'tf-shrine');
    townData(s, 0).store = { flint: 2, slate: 1, honey: 0 }; // tf-hall: flint 2, slate 1
    const hall = setHand(s, 0, ['tf-hall'])[0]!;
    const picks = e.legalPicks(s, 0).filter((p) => p.card === hall.id && p.use === 'build');
    expect(picks.map((p) => argsOf(p).cover)).toEqual([null]);
    const cover: Pick = { card: hall.id, use: 'build', args: { cover: shrine.id } };
    expect(e.applyAction(s, { type: 'pick', seat: 0, pick: cover })).toEqual({
      ok: false,
      error: 'a First game has no upgrades: build at full cost',
    });
    let after = s;
    for (const seat of e.waitingOn(s)) {
      const pick = seat === 0 ? { card: hall.id, use: 'build' } : e.defaultPick(after, seat)!;
      const r = e.applyAction(after, { type: 'pick', seat, pick });
      if (!r.ok) throw new Error(r.error);
      after = r.state;
    }
    expect(after.seats[0]!.zones.covered).toEqual([]);
    expect(townData(after, 0).covers).toEqual([]);
    expect(townData(after, 0).store).toMatchObject({ flint: 0, slate: 0 }); // full cost
    expect(after.seats[0]!.tableau.map((c) => c.def)).toEqual(['tf-shrine', 'tf-hall']);
  });

  it('R19.4 and R15.10 one Great Work each, kept with no choice: no decision outside a pick', () => {
    const s = firstGame(5, 3);
    expect(s.phase.kind).toBe('pick');
    expect(s.prompts).toEqual([]);
    expect(s.seats.every((x) => x.hand.length === 6)).toBe(true);
    const works = s.seats.map((x) => x.data.greatWork);
    expect(works.every((g) => g !== null)).toBe(true);
    expect(new Set(works).size).toBe(5);
    // Revealed from the start, with the same event as the choice's reveal; the Perk is active.
    expect(eventsOf(s).map((x) => x.event)).toEqual(
      expect.arrayContaining(
        s.seats.map((x) => ({ type: 'greatWork', seat: x.id, greatWork: works[x.id] })),
      ),
    );
    for (const x of s.seats) {
      const perk = FIXTURE.greatWorks.find((g) => g.id === x.data.greatWork)!.perk;
      expect(e.ruleset.activeEffects?.(s, x.id)).toEqual(perk);
    }
    expect(playout(e, 3, 5).every((st) => st.phase.kind !== 'prompt')).toBe(true);
  });

  for (const n of [2, 3, 5, 7]) {
    it(`R19.6 ${n} towns: a First game plays to a scored end, tie-break by tiers as usual`, () => {
      const states = playout(e, n, n);
      const end = states.at(-1)!;
      expect(end.result?.scores).toHaveLength(n);
      for (const sc of end.result?.scores ?? []) {
        expect(sc.tiebreak).toEqual([townData(end, sc.seat).tiers, townData(end, sc.seat).coins]);
      }
      expect(states.every((st) => st.seats.every((x) => x.zones.covered?.length === 0))).toBe(true);
    });
  }

  it('R19.6 the shipped content plays a First game, and a lookahead keeps the option', () => {
    const shipped = createWindamereEngine();
    const end = playout(shipped, 4, 9).at(-1)!;
    expect(end.table.honours).toEqual([]);
    expect(end.result?.scores).toHaveLength(4);
    const la = createLookahead(shipped.ruleset);
    const sample = la.determinize(shipped.viewFor(shipped.createGame(config(4, 9)), 0), new Rng(1));
    expect(isFirstGame(la.playOut(sample, 'game'))).toBe(true);
    expect(sample.seats.every((x) => x.zones.covered?.length === 0)).toBe(true);
  });

  it('R16 the First game numbers are data: defaults, overrides, checks, shipped values', () => {
    expect(DEFAULT_FIRST_GAME).toEqual({
      honoursPerGame: 0,
      greatWorksOffered: 1,
      upgrades: false,
    });
    expect(SHIPPED_FIRST_GAME).toEqual(DEFAULT_FIRST_GAME); // design's FIRST_GAME today
    expect(fixtureWith({ firstGame: { honoursPerGame: 1 } }).firstGame).toEqual({
      ...DEFAULT_FIRST_GAME,
      honoursPerGame: 1,
    });
    expect(checkContent({ ...FIXTURE, firstGame: { greatWorksOffered: 0 } })).toContain(
      `${FIXTURE.greatWorks.length} Great Works: 7 towns need 0 (R19.4)`,
    );
    expect(checkContent({ ...FIXTURE, firstGame: { honoursPerGame: 99 } })).toContain(
      `${FIXTURE.honours.length} Honours, fewer than firstGame honoursPerGame 99`,
    );
  });
});
