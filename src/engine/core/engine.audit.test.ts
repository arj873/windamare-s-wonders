/**
 * QA audit of the draft core (Q0): hidden information, hostile input, determinism.
 * `it.fails` = a known finding (docs/AUDIT.md); the owning lane removes the marker with the fix.
 */
import { describe, expect, it } from 'vitest';
import { createDraftEngine } from './engine';
import { Rng } from './rng';
import { act, newToyGame, pick, pickAll, toy, toyConfig } from './testing/helpers';
import { toyRuleset, type ToyState } from './testing/toy';
import type { DraftAction, Json, Viewer } from './types';

const json = (x: unknown) => JSON.stringify(x);

/** Play a whole game by seeded random legal actions; returns every state on the way. */
function playout(seed: number, gameSeed: number | string = seed): ToyState[] {
  const rng = new Rng(seed);
  let s = newToyGame(4, { opening: true }, gameSeed);
  const states = [s];
  for (let i = 0; i < 400 && s.phase.kind !== 'gameOver'; i++) {
    s = act(s, rng.pick(toy.legalActions(s).filter((a) => a.type !== 'unpick')));
    states.push(s);
  }
  expect(s.phase.kind).toBe('gameOver');
  return states;
}

describe('hidden information', () => {
  it('no view of any state in a full game carries the seed or the rng state', () => {
    const states = playout(3, 'topsecret-seed-xyz');
    const rngWords = (s: ToyState) => json(s.rng);
    for (const s of states) {
      for (const viewer of [0, 1, 2, 3, 'spectator'] as Viewer[]) {
        const text = json(toy.viewFor(s, viewer));
        expect(text).not.toContain('topsecret-seed-xyz');
        // The raw rng words (as a JSON array) never appear in a view.
        expect(text).not.toContain(rngWords(s));
      }
    }
  });

  it("a view never contains another seat's real card ids (hand, stash, deck, box)", () => {
    // Card ids are unique per game, so a hidden card's real id showing up anywhere is a leak.
    const states = playout(5);
    for (const s of states) {
      for (const viewer of [0, 1, 2, 3] as number[]) {
        const v = toy.viewFor(s, viewer);
        const seen = new Set<number>();
        const walk = (x: unknown): void => {
          if (Array.isArray(x)) x.forEach(walk);
          else if (x && typeof x === 'object') {
            const o = x as Record<string, unknown>;
            if (typeof o.id === 'number' && typeof o.def === 'string') seen.add(o.id);
            // lastReveal is public by design; prompts are checked on their own below.
            for (const [k, y] of Object.entries(o))
              if (k !== 'lastReveal' && k !== 'prompts') walk(y);
          }
        };
        walk(v);
        const hidden = new Set<number>();
        for (const seat of s.seats) {
          if (seat.id !== viewer) {
            seat.hand.forEach((c) => hidden.add(c.id));
            // Owner-only zones open to everyone at game over (by design).
            if (s.phase.kind !== 'gameOver') seat.zones.stash!.forEach((c) => hidden.add(c.id));
          }
        }
        s.deck.forEach((c) => hidden.add(c.id));
        s.box.forEach((c) => hidden.add(c.id));
        s.discard.forEach((c) => hidden.add(c.id));
        const publicIds = new Set<number>(s.seats.flatMap((x) => x.tableau.map((c) => c.id)));
        for (const id of seen) {
          if (hidden.has(id) && !publicIds.has(id)) {
            throw new Error(`viewer ${String(viewer)} sees hidden card id ${id}`);
          }
        }
      }
    }
  });

  it('a viewer cannot read a queued prompt that belongs to another seat', () => {
    // Opening prompts are queued for every seat; salvage data is the discard (hidden by default).
    const s = newToyGame(3, { opening: true });
    expect(s.prompts.length).toBe(3);
    for (const viewer of [0, 1, 2] as number[]) {
      const v = toy.viewFor(s, viewer);
      for (const p of v.prompts) {
        if (p.seat !== viewer) expect(p.data).toBeNull();
      }
    }
  });

  it('views are JSON-safe and do not alias state when serialised', () => {
    const s = playout(9)[10]!;
    const v = toy.viewFor(s, 1);
    expect(JSON.parse(json(v))).toEqual(v);
  });
});

describe('hostile input', () => {
  const garbage: unknown[] = [
    null,
    undefined,
    42,
    'pick',
    [],
    {},
    { type: 'pick' },
    { type: 'pick', seat: 0 },
    { type: 'pick', seat: 0, pick: null },
    { type: 'pick', seat: '0', pick: { card: 0, use: 'sell' } },
    { type: 'pick', seat: -1, pick: { card: 0, use: 'sell' } },
    { type: 'pick', seat: 1.5, pick: { card: 0, use: 'sell' } },
    { type: 'pick', seat: Number.NaN, pick: { card: 0, use: 'sell' } },
    { type: 'pick', seat: 99, pick: { card: 0, use: 'sell' } },
    { type: 'pick', seat: 0, pick: { card: '0', use: 'sell' } },
    { type: 'pick', seat: 0, pick: { card: 1.5, use: 'sell' } },
    { type: 'pick', seat: 0, pick: { card: 0, use: 7 } },
    { type: 'pick', seat: 0, pick: { card: 0, use: 'sell', args: { a: undefined } } },
    { type: 'pick', seat: 0, pick: { card: 0, use: 'sell', args: Number.POSITIVE_INFINITY } },
    { type: 'pick', seat: 0, pick: { card: 0, use: '__proto__' } },
    { type: 'unpick', seat: 0 },
    { type: 'answer', seat: 0, prompt: 0, answer: 'none' },
    { type: 'answer', seat: 0, prompt: '0', answer: 'none' },
    { type: '__proto__', seat: 0 },
    { type: 'constructor', seat: 0 },
  ];

  it('malformed actions are rejected, never thrown', () => {
    const s = newToyGame(3);
    for (const a of garbage) {
      let r;
      expect(() => (r = toy.applyAction(s, a as DraftAction)), json(a)).not.toThrow();
      expect((r as unknown as { ok: boolean }).ok, json(a)).toBe(false);
    }
  });

  it('random mutations of legal actions never throw and never corrupt the state', () => {
    const rng = new Rng(77);
    let s = newToyGame(3, { opening: true });
    const junk: Json[] = [null, -1, 1e9, 0.5, 'x', [], {}, [[[]]], { a: [1, { b: null }] }];
    for (let i = 0; i < 300 && s.phase.kind !== 'gameOver'; i++) {
      const legal = toy.legalActions(s).filter((a) => a.type !== 'unpick');
      const base = rng.pick(legal);
      const bad = JSON.parse(json(base)) as Record<string, unknown>;
      const keys = Object.keys(bad);
      bad[rng.pick(keys)] = rng.pick(junk);
      const before = json(s);
      const r = toy.applyAction(s, bad as unknown as DraftAction);
      expect(json(s), 'input state mutated').toBe(before);
      if (r.ok) s = r.state;
      else s = act(s, base);
    }
  });

  // FINDING Q0-E1 (docs/AUDIT.md): cloneJson turns a JSON "__proto__" key into a prototype.
  it.fails('a stored pick never inherits properties from a JSON `__proto__` key', () => {
    // JSON.parse makes "__proto__" an own key; cloneJson assigns it with `out[k] = v`, which sets
    // the clone's prototype instead. The live state then differs from its own JSON round trip.
    const eng = createDraftEngine({ ...toyRuleset, validatePick: () => null });
    const s0 = eng.createGame(toyConfig(2));
    const card = s0.seats[0]!.hand[0]!.id;
    const args = JSON.parse('{"__proto__":{"evil":1}}') as Json;
    const r = eng.applyAction(s0, { type: 'pick', seat: 0, pick: { card, use: 'sell', args } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const stored = r.state.seats[0]!.pick!.args as Record<string, unknown>;
    expect(stored.evil).toBeUndefined();
    expect(json(JSON.parse(json(r.state)))).toBe(json(r.state));
  });
});

describe('determinism', () => {
  it('same seed + same actions = identical state, byte for byte', () => {
    const a = playout(11, 'det');
    const b = playout(11, 'det');
    expect(a.length).toBe(b.length);
    expect(json(a.at(-1))).toBe(json(b.at(-1)));
    expect(a.map(json)).toEqual(b.map(json));
  });

  it('a different seed deals differently', () => {
    const a = newToyGame(4, undefined, 'one');
    const b = newToyGame(4, undefined, 'two');
    expect(json(a.seats.map((s) => s.hand.map((c) => c.def)))).not.toBe(
      json(b.seats.map((s) => s.hand.map((c) => c.def))),
    );
  });

  it('the order seats submit in within a turn does not change the result', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const base = newToyGame(4, undefined, `order-${seed}`);
      const picks = base.seats.map((s) => ({ card: s.hand[0]!.id, use: 'sell' }));
      const rng = new Rng(seed);
      const orders = [
        [0, 1, 2, 3],
        [3, 2, 1, 0],
        rng.shuffle([0, 1, 2, 3]),
        rng.shuffle([0, 1, 2, 3]),
      ];
      const results = orders.map((order) => {
        let s = base;
        for (const seat of order) s = pick(s, seat, picks[seat]!);
        return json(s);
      });
      for (const r of results) expect(r).toBe(results[0]);
    }
  });

  it('changing then restoring a pick before the reveal gives the same state as picking once', () => {
    const base = newToyGame(3, undefined, 'unpick');
    const p = (seat: number) => ({ card: base.seats[seat]!.hand[0]!.id, use: 'sell' });
    let direct = base;
    for (const seat of [0, 1, 2]) direct = pick(direct, seat, p(seat));
    let churn = base;
    churn = pick(churn, 0, { card: base.seats[0]!.hand[1]!.id, use: 'stash' });
    churn = act(churn, { type: 'unpick', seat: 0 });
    for (const seat of [0, 1, 2]) churn = pick(churn, seat, p(seat));
    // seq counts accepted actions (and stamps log lines), so it differs by design.
    const norm = (s: ToyState) => ({
      ...JSON.parse(json(s)),
      seq: 0,
      log: s.log.map((e) => ({ ...e, seq: 0 })),
    });
    expect(norm(churn)).toEqual(norm(direct));
  });

  it('a state resumed from JSON plays on exactly like the live one', () => {
    const states = playout(21, 'resume');
    const mid = states[Math.floor(states.length / 2)]!;
    const revived = JSON.parse(json(mid)) as ToyState;
    const rngA = new Rng(5);
    const rngB = new Rng(5);
    let a = mid;
    let b = revived;
    for (let i = 0; i < 60 && a.phase.kind !== 'gameOver'; i++) {
      const la = toy.legalActions(a).filter((x) => x.type !== 'unpick');
      const lb = toy.legalActions(b).filter((x) => x.type !== 'unpick');
      expect(json(lb)).toBe(json(la));
      a = act(a, rngA.pick(la));
      b = act(b, rngB.pick(lb));
      expect(json(b)).toBe(json(a));
    }
  });

  it('default actions drive a game to the end identically twice', () => {
    const run = () => {
      let s = newToyGame(5, { opening: true }, 'defaults');
      for (let i = 0; i < 500 && s.phase.kind !== 'gameOver'; i++) {
        const seat = toy.waitingOn(s)[0]!;
        s = act(s, toy.defaultAction(s, seat)!);
      }
      return s;
    };
    const a = run();
    expect(a.phase.kind).toBe('gameOver');
    expect(json(run())).toBe(json(a));
    void pickAll;
  });
});
