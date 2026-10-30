import { describe, expect, it } from 'vitest';
import { checkGains } from './gains';
import { checkContent, compileContent, DEFAULT_TUNABLES } from './content';
import { FIXTURE, FX_CARDS, FX_GREAT_WORKS } from './testing/fixture';
import { fixtureWith, newWwGame, townData } from './testing/helpers';
import type { GreatWorkDef, WwCardDef, WwContent } from './types';

const withCard = (card: Partial<WwCardDef> & { id: string }): WwContent => ({
  ...FIXTURE,
  cards: [
    ...FX_CARDS,
    {
      name: card.id,
      kind: 'hall',
      season: 'spring',
      cost: {},
      spend: {},
      effects: [],
      counts: [1, 1, 1, 1, 1],
      ...card,
    },
  ],
});
const withGreatWork = (gw: GreatWorkDef): WwContent => ({
  ...FIXTURE,
  greatWorks: [...FX_GREAT_WORKS, gw],
});
const stdTiers = [3, 7, 12, 18].map((threshold) => ({ threshold, reward: [] }));

describe('content check', () => {
  it('the test fixture passes', () => {
    expect(checkContent(FIXTURE)).toEqual([]);
  });

  it('R1.3 goods are data: a town stores exactly the content goods, in goods order', () => {
    expect(Object.keys(townData(newWwGame(3), 0).store)).toEqual(['flint', 'slate', 'honey']);
    const more = fixtureWith({ goods: [{ id: 'amber', name: 'Amber' }, ...FIXTURE.goods] });
    expect(townData(newWwGame(3, 1, more), 0).store).toEqual({
      amber: 0,
      flint: 0,
      slate: 0,
      honey: 0,
    });
    // A good the content does not list is an error wherever it appears.
    expect(checkContent(withCard({ id: 'x', cost: { lumber: 1 } }))).toEqual([
      'x: cost: unknown gain lumber',
    ]);
  });

  it('R1.3 good ids may not be the reserved gain keys', () => {
    const bad = { ...FIXTURE, goods: [...FIXTURE.goods, { id: 'coins', name: 'Coins' }] };
    expect(checkContent(bad)).toContain('good id coins is reserved');
    expect(checkContent({ ...FIXTURE, goods: [...FIXTURE.goods, FIXTURE.goods[0]!] })).toContain(
      'duplicate good flint',
    );
  });

  it('R7.6 Lore ranks are 1 to 6', () => {
    expect(
      checkContent(withCard({ id: 'x', kind: 'lore', effects: [{ type: 'lore', rank: 7 }] })),
    ).toEqual(['x: lore: rank must be 1 to 6']);
  });

  it('R7.9 an upgrade upgrades known cards of an earlier Season', () => {
    const later = withCard({ id: 'x', season: 'spring', upgrade: { of: ['tf-hall'], cost: {} } });
    expect(checkContent(later)).toEqual([
      'x: upgrades tf-hall, which is not from an earlier Season',
    ]);
    const unknown = withCard({ id: 'x', season: 'winter', upgrade: { of: ['nope'], cost: {} } });
    expect(checkContent(unknown)).toEqual(['x: upgrades unknown card nope']);
  });

  it('R8.1 a Great Work has four tiers with rising thresholds', () => {
    const three = { id: 'g', name: 'G', perk: [], tiers: stdTiers.slice(0, 3) };
    expect(checkContent(withGreatWork(three))).toEqual(['g: 3 tiers, not 4']);
    const flat = {
      id: 'g',
      name: 'G',
      perk: [],
      tiers: [3, 7, 7, 18].map((threshold) => ({ threshold, reward: [] })),
    };
    expect(checkContent(withGreatWork(flat))).toEqual(['g tier 3: threshold 7 does not rise']);
  });

  it('R8.2 gains are positive, so labour only ever goes up', () => {
    const goods = ['flint'];
    expect(checkGains(goods, { labour: 2 }, { labour: true })).toBeNull();
    expect(checkGains(goods, { labour: -1 }, { labour: true })).toBe(
      'labour must be a positive integer',
    );
    expect(checkGains(goods, { labour: 0 }, { labour: true })).toBe(
      'labour must be a positive integer',
    );
    expect(checkGains(goods, { labour: 1 })).toBe('unknown gain labour');
  });

  it('R13.3 an effect type needs a handler', () => {
    expect(checkContent(withCard({ id: 'x', effects: [{ type: 'teleport' }] }))).toEqual([
      'x: unknown effect type teleport',
    ]);
  });

  it('R13.4 "any" only in Spend bands and in a card\'s own onBuild', () => {
    expect(
      checkContent(
        withCard({ id: 'x', spend: { any: 2 }, effects: [{ type: 'onBuild', gains: { any: 1 } }] }),
      ),
    ).toEqual([]);
    expect(checkContent(withCard({ id: 'x', cost: { any: 1 } }))).toEqual([
      'x: cost: unknown gain any',
    ]);
    expect(
      checkContent(withCard({ id: 'x', effects: [{ type: 'seasonEnd', gains: { any: 1 } }] })),
    ).toEqual([
      'x: seasonEnd: unknown gain any',
      'x: seasonEnd: "any" is not allowed here (R13.4)',
    ]);
    const tier = {
      id: 'g',
      name: 'G',
      perk: [],
      tiers: stdTiers.map((t, i) =>
        i === 0 ? { ...t, reward: [{ type: 'onBuild', gains: { any: 1 } }] } : t,
      ),
    };
    expect(checkContent(withGreatWork(tier))).toEqual([
      'g tier 1: onBuild: "any" is not allowed here (R13.4)',
    ]);
  });

  it('R2.6 every Season has at least one Raid', () => {
    const noWinter = { ...FIXTURE, raids: FIXTURE.raids.filter((r) => r.season !== 'winter') };
    expect(checkContent(noWinter)).toEqual(['no Raid for winter']);
  });

  it('R11.5 an Honour uses one of the measures', () => {
    const bad = {
      ...FIXTURE,
      honours: [...FIXTURE.honours, { id: 'h', name: 'H', measure: 'luck' as 'coins' }],
    };
    expect(checkContent(bad)).toEqual(['h: unknown measure luck']);
  });

  it('R16 the defaults are the R16 table, and content may override any of them', () => {
    expect(DEFAULT_TUNABLES).toEqual({
      startingCoins: 5,
      honoursPerGame: 3,
      valourBySeason: [1, 2, 3, 4],
      plunderPerPoint: 1,
      bountyPerNeighbour: 1,
      loreRunScores: [1, 3, 6, 10, 14, 18],
      honourSole: 5,
      honourTied: 2,
      coinsPerRenown: 4,
    });
    const rules = fixtureWith({ tunables: { startingCoins: 9 } });
    expect(rules.tunables).toEqual({ ...DEFAULT_TUNABLES, startingCoins: 9 });
    expect(checkContent({ ...FIXTURE, tunables: { loreRunScores: [1, 2] } })).toEqual([
      'loreRunScores needs 6 entries (runs of 1 to 6)',
    ]);
  });

  it('compileContent refuses bad content with every problem', () => {
    expect(() =>
      compileContent(
        withCard({ id: 'x', kind: 'tavern' as 'hall', effects: [{ type: 'teleport' }] }),
      ),
    ).toThrow('bad content: x: unknown kind tavern; x: unknown effect type teleport');
  });
});
