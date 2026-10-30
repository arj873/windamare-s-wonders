import { describe, expect, it } from 'vitest';
import type { WwState } from '../../engine';
import { tableModel } from '../../ui/table/model';
import { windamere } from './content';
import { windamerePresenter } from './present';

const { rules, engine } = windamere();
const present = windamerePresenter(rules, engine);
const looks = Array.from({ length: 4 }, () => ({ color: '#888888', bot: false }));

const fresh = (): WwState =>
  engine.createGame({
    seed: 'present',
    seats: ['Ana', 'Bo', 'Cy', 'Dee'].map((name) => ({ name })),
  });

/** Every waiting town takes its default action while `until` says go on. */
function advance(state: WwState, until: (s: WwState) => boolean): WwState {
  let s = state;
  while (!until(s)) {
    for (const seat of engine.waitingOn(s)) {
      const r = engine.applyAction(s, engine.defaultAction(s, seat)!);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
  }
  return s;
}

/** Past the Great Work choice (R2.5): Spring is dealt. */
const newGame = (): WwState => advance(fresh(), (s) => s.phase.kind === 'pick');

const model = (state: WwState, viewer = 0) =>
  tableModel({ view: engine.viewFor(state, viewer), engine, present, looks });

/**
 * A card whose only good is 1 Reed (plus any coins), with no upgrade: found in the content, so
 * design can retune or rename cards without breaking this test.
 */
const ONE_REED = rules.content.cards.find(
  (c) =>
    c.cost.reed === 1 &&
    Object.keys(c.cost).every((k) => k === 'reed' || k === 'coins') &&
    !c.upgrade &&
    c.kind !== 'landmark',
)!;

/** Seat 0 holds ONE_REED as its first card, with an empty store; neighbours hold some Reed. */
function pastureState(coins: number, leftReed: number, rightReed: number): WwState {
  const s = structuredClone(newGame());
  const me = s.seats[0]!;
  me.hand[0] = { id: me.hand[0]!.id, def: ONE_REED.id };
  me.data.coins = coins;
  me.data.greatWork = null; // no Perk (a discount or Exchange would change the options)
  for (const g of rules.goods) {
    me.data.store[g] = 0;
    s.seats[1]!.data.store[g] = 0;
    s.seats[3]!.data.store[g] = 0;
  }
  s.seats[1]!.data.store.reed = leftReed;
  s.seats[3]!.data.store.reed = rightReed;
  return s;
}

describe('windamerePresenter', () => {
  it('opens with the Great Work choice: 1 of 2, Perk and tiers shown, hidden from others', () => {
    const s = fresh();
    const m = model(s, 0);
    expect(m.phase).toBe('prompt');
    expect(m.round).toBe('Spring');
    expect(m.hand).toEqual([]);
    expect(m.status).toBe('Choose your Great Work');
    expect(m.prompt?.answers).toHaveLength(2);
    for (const a of m.prompt!.answers) {
      expect(a.detail).toMatch(/^Perk: .+\nI at \d+ labour: /);
      expect(a.chosen).toBe(false);
    }
    const choice = m.prompt!.answers[1]!;
    const r = engine.applyAction(s, {
      type: 'answer',
      seat: 0,
      prompt: m.prompt!.id,
      answer: choice.answer,
    });
    if (!r.ok) throw new Error(r.error);
    const after = model(r.state, 0);
    expect(after.prompt?.answers[1]!.chosen).toBe(true);
    expect(after.prompt?.answered).toBe(true);
    expect(after.status).toBe('Waiting for Bo, Cy and Dee');
    expect(after.seats.map((x) => x.status)).toEqual([
      'picked',
      'thinking',
      'thinking',
      'thinking',
    ]);
    // Another town sees that Ana chose, not what.
    expect(model(r.state, 1).prompt?.answers.every((a) => !a.chosen)).toBe(true);
  });

  it('names the Season, the Raid, the market and every town stat', () => {
    const m = model(newGame());
    expect(m.round).toBe('Spring · Pick 1 of 5');
    expect(m.hand).toHaveLength(6);
    expect(m.banner.find((b) => b.id === 'raid')?.value).toMatch(/strength \d+/);
    expect(m.banner.find((b) => b.id === 'market')?.value).toBe('Market 1g');
    expect(m.banner.filter((b) => b.group === 'side')).toHaveLength(3); // three Honours
    const stats = m.me!.stats;
    expect(stats.find((s) => s.id === 'coins')).toMatchObject({
      value: '5',
      icon: '/art/goods/coin.svg',
    });
    expect(stats.find((s) => s.id === 'work')?.value).toMatch(/ 0\/4$/);
    for (const s of stats.filter((x) => x.group === 'store')) {
      expect(s.icon).toBe(`/art/goods/${s.label.toLowerCase()}.svg`);
    }
    expect(stats.filter((s) => s.group === 'store').map((s) => s.label)).toEqual([
      'Reed',
      'Peat',
      'Salt',
      'Wax',
      'Horn',
    ]);
  });

  it('offers Spend on every card, with what it gives', () => {
    for (const c of model(newGame()).hand) {
      const spend = c.options.find((o) => o.use.id === 'spend')!;
      expect(spend.pick).not.toBeNull();
      expect(spend.detail).toMatch(/^\+/);
      expect(c.face.alt).toMatch(/^Spend: \+/);
    }
  });

  it('lets a Build buy a missing good from either neighbour or the bank', () => {
    // Prices come from the content's tunables (design tunes them), not from this test.
    const bankPrice = rules.tunables.bankPrice;
    const spring = rules.tunables.marketPrice[0]!;
    const coins = rules.card(ONE_REED.id).cost.coins ?? 0;
    const pay = coins ? `pay ${coins} coin${coins === 1 ? '' : 's'} · ` : '';
    const m = model(pastureState(20, 2, 0));
    const build = m.hand[0]!.options.find((o) => o.use.id === 'build')!;
    expect(build.pick).not.toBeNull();
    expect(build.detail).toBe(`${pay}buy Reed from Bo (${spring}g)`);
    const row = build.choices.find((r) => r.label === 'Get Reed')!;
    expect(row.options.map((o) => o.label)).toEqual([
      `Bo ${spring}g`,
      `Dee ${spring}g`,
      `Bank ${bankPrice}g`,
    ]);
    expect(row.options.map((o) => o.selected)).toEqual([true, false, false]);
    expect(row.options[1]!.why).toMatch(/Dee holds only 0 reed/);
    const bank = row.options[2]!;
    expect(bank.why).toBeNull();
    const refined = m.refine(bank.pick)!;
    expect(refined.pick).not.toBeNull();
    expect(refined.detail).toBe(`${pay}Reed from the bank (${bankPrice}g)`);
  });

  it('explains a Build nobody can pay for', () => {
    const m = model(pastureState(0, 0, 0));
    const build = m.hand[0]!.options.find((o) => o.use.id === 'build')!;
    expect(build.pick).toBeNull();
    expect(build.why).toBe("Can't pay: short 1 Reed");
  });

  it('labels the final score categories as Renown bands', () => {
    let s = newGame();
    while (s.phase.kind !== 'gameOver') {
      for (const seat of engine.waitingOn(s)) {
        const r = engine.applyAction(s, engine.defaultAction(s, seat)!);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
    }
    expect(model(s).result?.rows.map((r) => r.label)).toEqual([
      'Town',
      'Great Work',
      'Raids',
      'Lore',
      'Honours',
      'Purse',
    ]);
  });
});
