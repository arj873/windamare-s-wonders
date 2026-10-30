/**
 * QA audit Q3, on the SHIPPED content (`windamereContent()`, not the engine fixture):
 *  - R19 First game: no Honours, no upgrades, one Great Work with no choice, nothing else changed.
 *  - The `scoreBeat` rivalry cards (D10): Renown per neighbour whose measure is strictly lower
 *    (R13), checked against a small oracle written from RULES.md R11.5/R13, over 2 to 7 seats.
 */
import { describe, expect, it } from 'vitest';
import { Rng, type Card, type CardId, type SeatId } from '../core';
import { compileContent } from './content';
import { createWindamereEngine } from './engine';
import { scoreTown } from './score';
import { windamereContent } from './shipped';
import type { WwCardDef, WwState } from './types';

const content = windamereContent();
const rules = compileContent(content);
const engine = createWindamereEngine(content);
const DEF = new Map<string, WwCardDef>(content.cards.map((c) => [c.id, c]));
const defOf = (c: Card): WwCardDef => {
  const d = DEF.get(c.def);
  if (!d) throw new Error(`unknown card ${c.def}`);
  return d;
};
const json = (x: unknown) => JSON.stringify(x);
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
const first = (n: number, seed: number | string = 1, on = true): WwState =>
  engine.createGame({ seed, seats: seats(n), options: { firstGame: on } });
const town = (s: WwState, seat: SeatId) => {
  const t = s.seats[seat];
  if (!t) throw new Error(`no seat ${seat}`);
  return t;
};

/** Resolve the Great Work choice with each seat's default answer (full game only). */
function settle(s0: WwState): WwState {
  let s = s0;
  while (s.phase.kind === 'prompt') {
    const seat = engine.waitingOn(s)[0];
    const a = seat === undefined ? null : engine.defaultAction(s, seat);
    if (!a) throw new Error('stuck in a prompt');
    const r = engine.applyAction(s, a);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// R19 First game
// ---------------------------------------------------------------------------------------------

describe('R19 First game on the shipped content', () => {
  it('R19.2/R19.4 setup at 2 to 7 seats: no Honours, no choice, each town holds its own Great Work', () => {
    for (let n = 2; n <= 7; n++) {
      for (const seed of [1, 2, 3]) {
        const s = first(n, seed);
        const ctx = `${n} seats, seed ${seed}`;
        expect(s.table.honours, ctx).toEqual([]);
        expect(s.table.leaders, ctx).toEqual([]);
        expect(s.prompts, ctx).toEqual([]);
        expect(s.phase.kind, ctx).toBe('pick');
        const works = s.seats.map((t) => t.data.greatWork);
        expect(
          works.every((w) => typeof w === 'string'),
          ctx,
        ).toBe(true);
        expect(new Set(works).size, `${ctx}: towns share a Great Work`).toBe(n);
        for (const t of s.seats)
          expect(content.greatWorks.map((g) => g.id)).toContain(t.data.greatWork);
        // Nobody is asked anything; every seat can pick at once.
        expect(engine.waitingOn(s).sort(), ctx).toEqual(s.seats.map((t) => t.id));
        // The Great Work is public from the start, for every viewer.
        for (const viewer of [0, 'spectator'] as const) {
          const v = engine.viewFor(s, viewer);
          expect(
            v.seats.map((t) => t.data.greatWork),
            ctx,
          ).toEqual(works);
        }
      }
    }
  });

  it('R19.1 off (or absent) is the full game: 3 Honours, a prompt per town, 2 offers each', () => {
    for (const s of [first(4, 1, false), engine.createGame({ seed: 1, seats: seats(4) })]) {
      expect(s.table.honours).toHaveLength(content.tunables?.honoursPerGame ?? 3);
      expect(s.phase.kind).toBe('prompt');
      expect(s.prompts).toHaveLength(4);
      expect(s.seats.every((t) => t.data.greatWork === null)).toBe(true);
    }
  });

  it('R19.6 everything else is unchanged: same hands, Raids and starting coins as the full game', () => {
    for (const n of [2, 3, 5]) {
      const a = first(n, 9, true);
      const b = settle(first(n, 9, false));
      // Same seed deals the same Season-1 hands (the Honour and Great Work deals differ).
      expect(a.seats.map((t) => t.hand.map((c) => c.def)).length).toBe(n);
      expect(a.seats.map((t) => t.data.coins)).toEqual(b.seats.map((t) => t.data.coins));
      expect(a.seats.map((t) => t.hand.length)).toEqual(b.seats.map((t) => t.hand.length));
      expect(a.roundPicks).toBe(b.roundPicks);
      expect(a.passDirection).toBe(b.passDirection);
    }
  });

  it('R19.3 no upgrades: a cover pick is refused, the full-cost Build works; the full game allows it', () => {
    const upgrade = content.cards.find((c) => c.upgrade);
    if (!upgrade?.upgrade) throw new Error('the shipped content has no upgrade card');
    const base = upgrade.upgrade.of[0];
    const baseDef = base === undefined ? undefined : DEF.get(base);
    if (!baseDef) throw new Error('upgrade base missing');

    const attempt = (on: boolean, cover: boolean) => {
      const s = on ? first(3, 4) : settle(first(3, 4, false));
      const t = town(s, 0);
      const baseCard: Card = { id: s.nextCardId++, def: baseDef.id };
      t.tableau.push(baseCard);
      const hand = t.hand[0];
      if (!hand) throw new Error('empty hand');
      hand.def = upgrade.id;
      // Rich enough that cost is never the reason for a refusal.
      t.data.coins = 30;
      for (const g of rules.goods) t.data.store[g] = 6;
      const args = cover ? { cover: baseCard.id } : { cover: null };
      const r = engine.applyAction(s, {
        type: 'pick',
        seat: 0,
        pick: { card: hand.id, use: 'build', args },
      });
      return { r, baseCard };
    };

    // Control: the full game accepts the upgrade, so a refusal below is about the option.
    expect(attempt(false, true).r.ok).toBe(true);
    const refused = attempt(true, true).r;
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/upgrade|cover/i);
    expect(attempt(true, false).r.ok).toBe(true);
  });

  it('R19 whole games at 2 to 7 seats never show an Honour, a prompt, a cover or a changed Great Work', () => {
    let finished = 0;
    for (let n = 2; n <= 7; n++) {
      for (const seed of [1, 2]) {
        const rng = new Rng(seed * 101 + n);
        let s = first(n, seed);
        const works = s.seats.map((t) => t.data.greatWork);
        for (let step = 0; step < 2000 && s.phase.kind !== 'gameOver'; step++) {
          const ctx = `${n} seats, seed ${seed}, step ${step}`;
          expect(s.phase.kind, ctx).toBe('pick');
          expect(s.prompts, ctx).toEqual([]);
          const seat = rng.pick(engine.waitingOn(s));
          const legal = engine.legalActions(s, seat).filter((a) => a.type !== 'unpick');
          // Nothing offers a cover and nothing asks a question.
          for (const a of legal) {
            expect(a.type, ctx).toBe('pick');
            if (a.type === 'pick') {
              const cover = (a.pick.args as { cover?: CardId | null } | undefined)?.cover;
              expect(cover ?? null, ctx).toBeNull();
            }
          }
          const r = engine.applyAction(s, rng.pick(legal));
          if (!r.ok) throw new Error(`${ctx}: ${r.error}`);
          s = r.state;
          expect(s.table.honours, ctx).toEqual([]);
          expect(s.table.leaders, ctx).toEqual([]);
          for (const t of s.seats) {
            expect(t.data.covers, ctx).toEqual([]);
            expect(t.zones.covered ?? [], ctx).toEqual([]);
          }
          expect(
            s.seats.map((t) => t.data.greatWork),
            ctx,
          ).toEqual(works);
        }
        expect(s.phase.kind).toBe('gameOver');
        finished++;
        const result = s.result;
        if (!result) throw new Error('no result');
        for (const sc of result.scores) {
          expect(sc.categories.honours ?? 0, `${n} seats seed ${seed}`).toBe(0);
          expect(sc.total).toBe(Object.values(sc.categories).reduce((a, b) => a + b, 0));
        }
        // The tie-break still uses Great Work tiers (R19.6, R12.4).
        expect(result.scores[0]?.tiebreak.length).toBeGreaterThan(0);
      }
    }
    expect(finished).toBe(12);
  });

  it('R19 is deterministic: one seed, one game, byte for byte', () => {
    const run = () => {
      const rng = new Rng(5);
      let s = first(4, 5);
      while (s.phase.kind !== 'gameOver') {
        const seat = rng.pick(engine.waitingOn(s));
        const legal = engine.legalActions(s, seat).filter((a) => a.type !== 'unpick');
        const r = engine.applyAction(s, rng.pick(legal));
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      return json(s);
    };
    expect(run()).toBe(run());
  });
});

// ---------------------------------------------------------------------------------------------
// scoreBeat rivalry cards
// ---------------------------------------------------------------------------------------------

type Spec = { type: string; [k: string]: unknown };
const RIVALS = content.cards.filter((c) => c.effects.some((e) => e.type === 'scoreBeat'));

/** Effects of a town's uncovered cards (R13.1). Great Works are blanked in these scenarios. */
function active(s: WwState, seat: SeatId): Spec[] {
  const t = town(s, seat);
  const covered = new Set(t.data.covers.map((c) => c.card));
  return t.tableau.filter((c) => !covered.has(c.id)).flatMap((c) => defOf(c).effects as Spec[]);
}
const kindCount = (s: WwState, seat: SeatId, kind: string) => {
  const t = town(s, seat);
  const covered = new Set(t.data.covers.map((c) => c.card));
  return t.tableau.filter((c) => !covered.has(c.id) && defOf(c).kind === kind).length;
};
const KIND_OF: Record<string, string> = {
  holdings: 'holding',
  halls: 'hall',
  markets: 'market',
  watches: 'watch',
  landmarks: 'landmark',
  lore: 'lore',
};

/** R11.5 measures the rivalry cards use, from the text of the rule. */
function measure(s: WwState, seat: SeatId, m: string): number {
  if (m === 'guard') {
    return active(s, seat)
      .filter((e) => e.type === 'guard')
      .reduce((n, e) => n + Number(e.amount), 0);
  }
  if (m === 'valour') return town(s, seat).data.valour.length;
  if (m === 'loreRun') {
    const ranks = [
      ...new Set(
        active(s, seat)
          .filter((e) => e.type === 'lore')
          .map((e) => Number(e.rank)),
      ),
    ].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    ranks.forEach((r, i) => {
      run = i > 0 && r === (ranks[i - 1] ?? 0) + 1 ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return best;
  }
  const kind = KIND_OF[m];
  if (kind === undefined) throw new Error(`rivalry card uses an unmodelled measure ${m}`);
  return kindCount(s, seat, kind);
}

/** An inert filler card (no `score…` effects) for the kind, or the lore card of this rank. */
function filler(kind: string): WwCardDef {
  const c = content.cards.find(
    (x) =>
      x.kind === kind &&
      !RIVALS.includes(x) &&
      x.effects.every(
        (e) => !e.type.startsWith('score') && e.type !== 'guard' && e.type !== 'lore',
      ),
  );
  if (!c) throw new Error(`no inert ${kind} card`);
  return c;
}
const loreByRank = new Map<number, WwCardDef>();
const guardCard = content.cards.find(
  (c) => !RIVALS.includes(c) && c.effects.every((e) => e.type === 'guard'),
);
for (const c of content.cards) {
  const lore = c.effects.find((e) => e.type === 'lore');
  if (lore && !RIVALS.includes(c) && c.effects.every((e) => !e.type.startsWith('score'))) {
    if (!loreByRank.has(Number(lore.rank))) loreByRank.set(Number(lore.rank), c);
  }
}

/** Give `seat` `level` (0..3) of a measure, by adding cards or Valour tokens. */
function give(s: WwState, seat: SeatId, m: string, level: number): CardId[] {
  const t = town(s, seat);
  const ids: CardId[] = [];
  const add = (def: WwCardDef) => {
    const card = { id: s.nextCardId++, def: def.id };
    t.tableau.push(card);
    ids.push(card.id);
  };
  if (m === 'valour') t.data.valour = Array.from({ length: level }, () => 1);
  else if (m === 'guard') {
    if (!guardCard) throw new Error('no pure Guard card');
    for (let i = 0; i < level; i++) add(guardCard);
  } else if (m === 'loreRun') {
    for (let r = 1; r <= level; r++) {
      const c = loreByRank.get(r);
      if (!c) throw new Error(`no inert Lore card of rank ${r}`);
      add(c);
    }
  } else {
    const kind = KIND_OF[m];
    if (kind === undefined) throw new Error(`unmodelled measure ${m}`);
    for (let i = 0; i < level; i++) add(filler(kind));
  }
  return ids;
}

/** Cover a card the way a Build does (build.ts): out of the tableau into `covered`, by another card. */
function cover(s: WwState, seat: SeatId, id: CardId): void {
  const t = town(s, seat);
  const i = t.tableau.findIndex((c) => c.id === id);
  const card = t.tableau[i];
  const by = t.tableau.find((c) => c.id !== id);
  if (!card || !by) throw new Error('cannot cover');
  t.tableau.splice(i, 1);
  (t.zones.covered ??= []).push(card);
  t.data.covers.push({ card: id, by: by.id });
}

/** The Renown a card's text promises beyond `scoreBeat`: printed Renown only. */
const printedRenown = (s: WwState, seat: SeatId) =>
  active(s, seat)
    .filter((e) => e.type === 'renown')
    .reduce((n, e) => n + Number(e.amount), 0);

function scenario(n: number, card: WwCardDef, own: number, left: number, right: number): WwState {
  const s = first(n, 7);
  for (const t of s.seats) t.data.greatWork = null; // isolate the cards from Perks
  const beat = card.effects.find((e) => e.type === 'scoreBeat');
  const m = String(beat?.measure);
  // Seat 0's neighbours are seat 1 (left) and seat n-1 (right); with 2 seats they are one town.
  give(s, 1, m, left);
  if (n > 2) give(s, n - 1, m, right);
  give(s, 0, m, own);
  town(s, 0).tableau.push({ id: s.nextCardId++, def: card.id });
  return s;
}

describe('scoreBeat rivalry cards (D10) on the shipped content', () => {
  it('the content has the rivalry cards, and each uses a measure this oracle models', () => {
    expect(RIVALS.length).toBeGreaterThanOrEqual(4);
    for (const c of RIVALS) {
      const beats = c.effects.filter((e) => e.type === 'scoreBeat');
      expect(beats, c.id).toHaveLength(1);
      expect(Object.keys(KIND_OF).concat(['guard', 'valour', 'loreRun'])).toContain(
        String(beats[0]?.measure),
      );
      // The card scores Renown only through scoreBeat and printed `renown` in the Town group.
      for (const e of c.effects) {
        expect(['income', 'yield', 'guard', 'lore', 'renown', 'scoreBeat', 'toll']).toContain(
          e.type,
        );
      }
    }
  });

  it('Renown = amount x neighbours whose measure is strictly lower, at 2 to 7 seats', () => {
    let checked = 0;
    let positive = 0;
    for (const card of RIVALS) {
      const beat = card.effects.find((e) => e.type === 'scoreBeat');
      const amount = Number(beat?.amount);
      const m = String(beat?.measure);
      for (const n of [2, 3, 4, 7]) {
        for (let own = 0; own <= 3; own++) {
          for (let left = 0; left <= 3; left++) {
            for (let right = 0; right <= 3; right++) {
              const s = scenario(n, card, own, left, right);
              const mine = measure(s, 0, m);
              const neighbours = n === 2 ? [1] : [1, n - 1];
              const beaten = neighbours.filter((x) => measure(s, x, m) < mine).length;
              const expected = printedRenown(s, 0) + amount * beaten;
              const got = scoreTown(rules, s, 0).town;
              expect(got, `${card.id} ${n} seats own ${own} left ${left} right ${right}`).toBe(
                expected,
              );
              checked++;
              if (beaten > 0) positive++;
            }
          }
        }
      }
    }
    // Not vacuous: plenty of beaten, tied and unbeaten cases.
    expect(checked).toBe(RIVALS.length * 4 * 64);
    expect(positive).toBeGreaterThan(checked / 4);
  });

  it('a tie scores nothing and a stronger neighbour scores nothing', () => {
    for (const card of RIVALS) {
      const beat = card.effects.find((e) => e.type === 'scoreBeat');
      const m = String(beat?.measure);
      // Both neighbours level with the town (the card's own contribution counted by the oracle).
      for (let n = 3; n <= 4; n++) {
        const s = scenario(n, card, 1, 1, 1);
        const mine = measure(s, 0, m);
        const t = measure(s, 1, m);
        if (mine === t)
          expect(scoreTown(rules, s, 0).town, `${card.id} tie`).toBe(printedRenown(s, 0));
      }
      const s = scenario(3, card, 0, 3, 3);
      expect(scoreTown(rules, s, 0).town, `${card.id} outranked`).toBe(printedRenown(s, 0));
    }
  });

  it('covered cards do not count for the neighbour (R7.9, R17.7)', () => {
    let tested = 0;
    for (const card of RIVALS) {
      const beat = card.effects.find((e) => e.type === 'scoreBeat');
      const m = String(beat?.measure);
      const kind = KIND_OF[m];
      if (kind === undefined || m === 'lore') continue; // only kind counts are cover-sensitive here
      const s = scenario(3, card, 1, 2, 0);
      const mine = measure(s, 0, m);
      const left = town(s, 1);
      // Cover all but one of the left neighbour's cards of that kind: it falls below the town.
      const mineCards = left.tableau.filter((c) => defOf(c).kind === kind);
      for (const c of mineCards.slice(1)) cover(s, 1, c.id);
      const before = scoreTown(rules, s, 0).town;
      expect(measure(s, 1, m), card.id).toBe(1);
      const beaten = [1, 2].filter((x) => measure(s, x, m) < mine).length;
      expect(before, card.id).toBe(printedRenown(s, 0) + Number(beat?.amount) * beaten);
      tested++;
    }
    expect(tested).toBeGreaterThanOrEqual(1);
  });

  it('a covered rivalry card scores nothing', () => {
    const card = RIVALS[0];
    if (!card) throw new Error('no rivalry card');
    const s = scenario(3, card, 0, 0, 0);
    const mine = town(s, 0);
    give(s, 0, 'halls', 1); // something to cover it with
    const id = mine.tableau.find((c) => c.def === card.id)?.id ?? -1;
    cover(s, 0, id);
    expect(scoreTown(rules, s, 0).town).toBe(printedRenown(s, 0));
  });
});
