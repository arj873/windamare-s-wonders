/**
 * Great Works, Raids and Honours (CARDS.md §7-8) as data. All numbers first-pass, untested.
 */
import { fx } from './dsl';
import type { GreatWorkDef, HonourDef, RaidDef } from './types';
import type { EffectSpec } from '../../engine';

type Tier = EffectSpec[];

/** Standard thresholds 4, 9, 15, 22 (R8.1; D9 raised them from 3, 6, 10, 15) unless given. */
function work(
  id: string,
  name: string,
  perk: EffectSpec[],
  tiers: [Tier, Tier, Tier, Tier],
  thresholds: [number, number, number, number] = [4, 9, 15, 22],
): GreatWorkDef {
  const [t1, t2, t3, t4] = thresholds;
  return {
    id,
    name,
    perk,
    tiers: [
      { threshold: t1, reward: tiers[0] },
      { threshold: t2, reward: tiers[1] },
      { threshold: t3, reward: tiers[2] },
      { threshold: t4, reward: tiers[3] },
    ],
  };
}

/**
 * Every tier pays some Renown and no tier pays a plain 3 or 7 (research R4 O7: avoid the
 * "3, special, 7" wonder template). No tier gives a Lore rank.
 */
export const GREAT_WORKS: readonly GreatWorkDef[] = [
  work(
    'the-mere-bridge',
    'The Mere Bridge',
    [fx.toll(1, 'holding')],
    [
      [fx.renown(1), fx.onBuild('4c')],
      [fx.renown(2), fx.income(1)],
      [fx.renown(4)],
      [fx.renown(8)],
    ],
  ),
  work(
    'the-wind-organ',
    'The Wind Organ',
    [fx.spendBonus('lore', '1lab')],
    [
      [fx.renown(2)],
      [fx.renown(2), fx.onBuild('2W')],
      [fx.renown(6)],
      [fx.renown(4), fx.scorePerKind('lore', 2)],
    ],
  ),
  work(
    'the-beacon-crown',
    'The Beacon Crown',
    [fx.guard(1)],
    [
      [fx.renown(1), fx.guard(1)],
      [fx.renown(2), fx.heldBonus('2c')],
      [fx.renown(4), fx.guard(1)],
      [fx.renown(6)],
    ],
  ),
  work(
    'the-salt-stair',
    'The Salt Stair',
    [fx.yield('1S')],
    [
      [fx.renown(1), fx.onBuild('2W')],
      [fx.renown(2), fx.yield('1W')],
      [fx.renown(4)],
      [fx.renown(6)],
    ],
  ),
  work(
    'the-stonewrights-spire',
    "The Stonewright's Spire",
    [fx.yield('1lab')],
    [[fx.renown(2)], [fx.renown(4)], [fx.renown(5)], [fx.renown(8)]],
    [6, 12, 19, 27],
  ),
  work(
    'the-hall-of-echoes',
    'The Hall of Echoes',
    [fx.buildBonus('hall', '2c')],
    [
      [fx.renown(1), fx.onBuild('3c')],
      [fx.renown(2), fx.discount('hall', 1)],
      [fx.renown(4)],
      [fx.renown(4), fx.scorePerKind('hall', 2)],
    ],
  ),
  work(
    'the-harvest-wheel',
    'The Harvest Wheel',
    [fx.discount('holding', 1)],
    [
      [fx.renown(1), fx.onBuild('1R 1P')],
      [fx.renown(2), fx.scorePerKind('holding', 1)],
      [fx.renown(4)],
      [fx.renown(5)],
    ],
  ),
  work(
    'the-ice-lantern',
    'The Ice Lantern',
    [fx.seasonEnd('1W 1H')],
    [[fx.renown(2)], [fx.renown(2), fx.scoreGoods(3, 1)], [fx.renown(4)], [fx.renown(6)]],
  ),
  work(
    'the-wolf-gate',
    'The Wolf Gate',
    [fx.heldBonus('2c')],
    [
      [fx.renown(1), fx.guard(1)],
      [fx.renown(2), fx.guard(1)],
      [fx.renown(4)],
      [fx.renown(2), fx.scorePerValour(2)],
    ],
  ),
  work(
    'the-tide-mill',
    'The Tide Mill',
    [fx.exchange('salt'), fx.income(1)],
    [
      [fx.renown(1), fx.yield('1S')],
      [fx.renown(2), fx.exchange('horn')],
      [fx.renown(4)],
      [fx.renown(8)],
    ],
  ),
  work(
    'the-lantern-market',
    'The Lantern Market',
    [fx.income(1)],
    [
      [fx.renown(1), fx.onBuild('3c')],
      [fx.renown(2), fx.sellBonus(1)],
      [fx.renown(4), fx.toll(2, 'market')],
      [fx.renown(6)],
    ],
  ),
  work(
    'the-ring-of-oaths',
    'The Ring of Oaths',
    [fx.scoreBeat('guard', 2)],
    [[fx.renown(1), fx.guard(1)], [fx.renown(2)], [fx.renown(4), fx.guard(1)], [fx.renown(8)]],
  ),
  work(
    'the-coinwell',
    'The Coinwell',
    [fx.spendBonus('market', '2c'), fx.income(1)],
    [[fx.renown(2)], [fx.renown(2), fx.income(1)], [fx.renown(4)], [fx.renown(8)]],
  ),
  work(
    'the-fourfold-gate',
    'The Fourfold Gate',
    [fx.scoreSets(2)],
    [
      [fx.renown(1), fx.onBuild('3c')],
      [fx.renown(2)],
      [fx.renown(6)],
      [fx.renown(5), fx.scoreSets(2)],
    ],
  ),
];

/**
 * One per Season is drawn at setup (R2.6). The weakest fresh Watch each Season (Guard 1, 2, 3, 2,
 * so 1, 3, 6, 8 in total) holds every Raid except the Fen Thieves (research R4 D2).
 */
export const RAIDS: readonly RaidDef[] = [
  { id: 'raid-wolf-pack', name: 'Wolf Pack', season: 'spring', strength: 1 },
  { id: 'raid-hill-reivers', name: 'Hill Reivers', season: 'spring', strength: 1 },
  { id: 'raid-fen-thieves', name: 'Fen Thieves', season: 'spring', strength: 2 },
  { id: 'raid-marsh-raiders', name: 'Marsh Raiders', season: 'summer', strength: 2 },
  { id: 'raid-broken-company', name: 'The Broken Company', season: 'summer', strength: 3 },
  { id: 'raid-salt-corsairs', name: 'Saltcoast Corsairs', season: 'summer', strength: 3 },
  { id: 'raid-grey-host', name: 'The Grey Host', season: 'autumn', strength: 4 },
  { id: 'raid-boglords-levy', name: "The Bog-lord's Levy", season: 'autumn', strength: 5 },
  { id: 'raid-iron-riders', name: 'Iron Riders', season: 'autumn', strength: 6 },
  { id: 'raid-frost-wights', name: 'Frost Wights', season: 'winter', strength: 6 },
  { id: 'raid-pale-march', name: 'The Pale March', season: 'winter', strength: 8 },
  { id: 'raid-long-night', name: 'Host of the Long Night', season: 'winter', strength: 8 },
];

/** R11.4: 3 of these 8 per game. */
export const HONOURS: readonly HonourDef[] = [
  { id: 'honour-warden', name: 'Warden', measure: 'guard' },
  { id: 'honour-steward', name: 'Steward', measure: 'holdings' },
  { id: 'honour-patron', name: 'Patron', measure: 'halls' },
  { id: 'honour-merchant', name: 'Merchant', measure: 'markets' },
  { id: 'honour-sage', name: 'Sage', measure: 'loreRun' },
  { id: 'honour-master-builder', name: 'Master Builder', measure: 'tiers' },
  { id: 'honour-treasurer', name: 'Treasurer', measure: 'coins' },
  { id: 'honour-broad-town', name: 'Broad Town', measure: 'kinds' },
];
