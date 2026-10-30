import { describe, expect, it } from 'vitest';
import type { WwState } from '../../engine';
import { primaryOption, tableModel } from '../../ui/table/model';
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
    const gw = rules.greatWork(newGame().seats[0]!.data.greatWork!); // same seed as `m`
    expect(m.me!.monument).toEqual({
      name: gw.name,
      art: `/art/great-works/${gw.id}.svg`,
      tiers: 0,
      total: 4,
      progress: `Labour 0 · tier I at ${gw.tiers[0]!.threshold}`,
      perk: expect.any(String),
    });
    expect(m.me!.columns).toEqual([]);
    expect(present.kinds.map((k) => k.icon)).toContain('/art/kinds/holding.svg');
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
    expect(row.key).toBe('pay-0-reed');
    expect(row.options.map((o) => o.key)).toEqual(['buy-1', 'buy-3', 'bank']);
    expect(row.options[1]!.why).toMatch(/Dee holds only 0 reed/);
    const bank = row.options[2]!;
    expect(bank.why).toBeNull();
    const refined = m.refine(bank.pick)!;
    expect(refined.pick).not.toBeNull();
    expect(refined.detail).toBe(`${pay}Reed from the bank (${bankPrice}g)`);
    // R6 #2: coins before → after, and the bank flagged.
    expect(build.purse).toEqual({ before: 20, after: 20 - coins - spring, warn: false });
    expect(refined.purse).toEqual({ before: 20, after: 20 - coins - bankPrice, warn: true });
    expect(bank.warn).toBe(true);
    expect(row.options[0]!.warn).toBe(false);
  });

  it('marks numbers, goods, kinds and uses with tutorial glossary terms', () => {
    const m = model(newGame());
    const stats = m.me!.stats;
    expect(stats.find((s) => s.id === 'guard')?.term).toBe('guard');
    expect(stats.filter((s) => s.group === 'store').map((s) => s.term)).toEqual(rules.goods);
    expect(present.kinds.every((k) => k.term === k.id)).toBe(true);
    expect(present.uses.map((u) => u.term)).toEqual(['build', 'spend']);
    expect(m.banner.find((b) => b.id === 'raid')?.term).toBe('raid');
    for (const c of m.hand) for (const p of c.face.altParts ?? []) expect(p.term).toBeTruthy();
  });

  it('badges each hand card with its Build before the tap (R6 #1)', () => {
    const spring = rules.tunables.marketPrice[0]!;
    const coins = rules.card(ONE_REED.id).cost.coins ?? 0;
    expect(model(pastureState(20, 2, 0)).hand[0]!.badge).toEqual({
      text: `Build: buy 1 · ${coins + spring}g`,
      tone: 'buy',
    });
    expect(model(pastureState(20, 0, 0)).hand[0]!.badge).toEqual({
      text: `Build: bank · ${coins + rules.tunables.bankPrice}g`,
      tone: 'warn',
    });
    expect(model(pastureState(0, 0, 0)).hand[0]!.badge).toEqual({
      text: '✗ Spend only',
      tone: 'no',
    });
    const own = structuredClone(pastureState(20, 0, 0));
    own.seats[0]!.data.store.reed = 1; // pays from its own store
    expect(model(own).hand[0]!.badge?.tone).toBe('ok');
  });

  it('names trades in the Revealed panel and sums up the Season end (R6 #4)', () => {
    const m = model(pastureState(20, 2, 0));
    let s = structuredClone(pastureState(20, 2, 0));
    // Seat 0 builds by buying Reed from Bo; everyone else Spends.
    const build = m.hand[0]!.options.find((o) => o.use.id === 'build')!.pick!;
    for (const seat of engine.waitingOn(s)) {
      const pick = seat === 0 ? build : { card: s.seats[seat]!.hand[0]!.id, use: 'spend' };
      const r = engine.applyAction(s, { type: 'pick', seat, pick });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const spring = rules.tunables.marketPrice[0]!;
    // R7 #4: each player reads "You" / "you" for themselves.
    expect(model(s).reveal?.happenings).toContain(`You bought Reed from Bo (${spring}g)`);
    expect(model(s, 1).reveal?.happenings).toContain(`Ana bought Reed from you (${spring}g)`);
    expect(model(s, 2).reveal?.happenings).toContain(`Ana bought Reed from Bo (${spring}g)`);
    expect(model(s).seasonEnd).toBeNull();
    // E8: the log too (engine's logText), "You" only for the seat whose view it is.
    const logOf = (viewer: number) => model(s, viewer).log.map((l) => l.text);
    expect(logOf(0).some((t) => /\b[Yy]ou\b/.test(t))).toBe(true);
    expect(logOf(0).join('\n')).not.toMatch(/\bAna\b/);
    expect(logOf(2).join('\n')).toMatch(/\bAna\b/);

    // Play out Spring: the action that ends it carries the Raid summary.
    const summer = advance(s, (x) => x.round === 1);
    const end = model(summer).seasonEnd!;
    expect(end.title).toMatch(/^End of Spring · .+, strength \d+$/);
    expect(end.lines.filter((l) => l.seat !== null && /Raid|plundered/.test(l.text))).toHaveLength(
      4,
    );
    expect(end.next).toMatch(/^Next: Summer · hands pass ▶ right$/);
    expect(
      model(summer).reveal?.happenings.some((t) => /held the Raid|was plundered/.test(t)),
    ).toBe(true);
    const mine = end.lines.find((l) => l.seat === 0)!.text;
    expect(mine).toMatch(/^You (held the Raid|were plundered) /);
  });

  it('lets one of 2 towns choose its Burn on every turn but the last (R14.2, R14.4)', () => {
    let s = advance(
      engine.createGame({ seed: 'duel', seats: [{ name: 'Ana' }, { name: 'Bo' }] }),
      (x) => x.phase.kind === 'pick',
    );
    const m = model(s);
    expect(m.left?.name).toBe('Bo');
    expect(m.right).toBeNull(); // one neighbour, drawn once (R14.5)
    const card = m.hand[0]!;
    const spend = card.options.find((o) => o.use.id === 'spend')!;
    const row = spend.choices.find((r) => r.key === 'burn')!;
    expect(row.options).toHaveLength(m.hand.length - 1);
    expect(row.options.filter((o) => o.selected)).toHaveLength(1); // the engine's default (R15.6)
    const other = row.options.find((o) => !o.selected)!;
    const refined = m.refine(other.pick)!;
    expect(refined.pick).not.toBeNull();
    expect(refined.detail).toMatch(new RegExp(`· burn ${other.label}$`));
    expect(
      refined.choices.find((r) => r.key === 'burn')!.options.find((o) => o.selected)?.key,
    ).toBe(other.key);
    // Build offers it too; the last turn of a Season burns nothing.
    expect(
      card.options.find((o) => o.use.id === 'build')!.choices.some((r) => r.key === 'burn'),
    ).toBe(card.options.find((o) => o.use.id === 'build')!.pick !== null);
    s = advance(s, (x) => x.turn === x.roundPicks - 1);
    const last = model(s).hand[0]!.options.find((o) => o.use.id === 'spend')!;
    expect(last.choices.some((r) => r.key === 'burn')).toBe(false);
  });

  it('keeps Recall of the hands passed this Season (R15.8)', () => {
    expect(model(newGame()).recall).toEqual([]);
    const s = advance(newGame(), (x) => x.turn === 2);
    const recall = model(s, 0).recall;
    expect(recall).toHaveLength(2);
    expect(recall[0]!.title).toBe('Pick 1: passed to Bo');
    expect(recall[0]!.cards).toHaveLength(5); // 6 dealt, 1 taken
  });

  it('never highlights a Build that can only pay the bank (R6 #2)', () => {
    const m = model(pastureState(20, 0, 0)); // nobody sells Reed: the bank is the only way
    const card = m.hand[0]!;
    const build = card.options.find((o) => o.use.id === 'build')!;
    expect(build.pick).not.toBeNull();
    expect(build.purse?.warn).toBe(true);
    expect(primaryOption(card.options)?.use.id).toBe('spend');
    const spend = card.options.find((o) => o.use.id === 'spend')!;
    expect(spend.purse?.warn).toBe(false);
    expect(spend.purse!.after).toBeGreaterThanOrEqual(20);
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
