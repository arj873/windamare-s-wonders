import { describe, expect, it } from 'vitest';
import type { WwState } from '../../engine';
import { tableModel } from '../../ui/table/model';
import { windamere } from './content';
import { windamerePresenter } from './present';

const { rules, engine } = windamere();
const present = windamerePresenter(rules, engine);
const looks = Array.from({ length: 4 }, () => ({ color: '#888888', bot: false }));

const newGame = (): WwState =>
  engine.createGame({
    seed: 'present',
    seats: ['Ana', 'Bo', 'Cy', 'Dee'].map((name) => ({ name })),
  });

const model = (state: WwState, viewer = 0) =>
  tableModel({ view: engine.viewFor(state, viewer), engine, present, looks });

/** Seat 0 holds `fell-pasture` (cost 1 Reed + 1 coin) as its first card, with an empty store. */
function pastureState(coins: number, leftReed: number, rightReed: number): WwState {
  const s = structuredClone(newGame());
  const me = s.seats[0]!;
  me.hand[0] = { id: me.hand[0]!.id, def: 'fell-pasture' };
  me.data.coins = coins;
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
  it('names the Season, the Raid, the market and every town stat', () => {
    const m = model(newGame());
    expect(m.round).toBe('Spring · Pick 1 of 5');
    expect(m.hand).toHaveLength(6);
    expect(m.banner.find((b) => b.id === 'raid')?.value).toMatch(/strength \d+/);
    expect(m.banner.find((b) => b.id === 'market')?.value).toBe('Market 1g');
    expect(m.banner.filter((b) => b.group === 'side')).toHaveLength(3); // three Honours
    const stats = m.me!.stats;
    expect(stats.find((s) => s.id === 'coins')?.value).toBe('5g');
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
    const m = model(pastureState(20, 2, 0));
    const build = m.hand[0]!.options.find((o) => o.use.id === 'build')!;
    expect(build.pick).not.toBeNull();
    expect(build.detail).toBe('pay 1 coin · buy Reed from Bo (1g)');
    const row = build.choices.find((r) => r.label === 'Get Reed')!;
    expect(row.options.map((o) => o.label)).toEqual(['Bo 1g', 'Dee 1g', 'Bank 5g']);
    expect(row.options.map((o) => o.selected)).toEqual([true, false, false]);
    expect(row.options[1]!.why).toMatch(/Dee holds only 0 reed/);
    const bank = row.options[2]!;
    expect(bank.why).toBeNull();
    const refined = m.refine(bank.pick)!;
    expect(refined.pick).not.toBeNull();
    expect(refined.detail).toBe('pay 1 coin · Reed from the bank (5g)');
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
