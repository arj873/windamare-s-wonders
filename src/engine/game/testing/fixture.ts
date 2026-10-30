/**
 * TEST FIXTURE, NOT GAME CONTENT. A small made-up Windamere content set for the engine's own
 * tests. Its goods (flint, slate, honey) are deliberately not the game's, to show that no code
 * names a good. The real content is design's `src/content/`. Never import this from shipped code.
 */
import type { EffectSpec } from '../../core';
import type { GreatWorkDef, Kind, Season, WwCardDef, WwContent } from '../types';

function card(
  id: string,
  kind: Kind,
  season: Season,
  effects: EffectSpec[],
  extra: Partial<WwCardDef> = {},
): WwCardDef {
  return {
    id,
    name: id,
    kind,
    season,
    cost: {},
    spend: { coins: 1 },
    effects,
    counts: [1, 1, 1, 1, 1],
    ...extra,
  };
}

const lore = (rank: number, season: Season) =>
  card(`tf-lore-${rank}`, 'lore', season, [{ type: 'lore', rank }]);

export const FX_CARDS: WwCardDef[] = [
  card('tf-hut', 'holding', 'spring', []),
  card('tf-cellar', 'holding', 'autumn', [{ type: 'seasonEnd', gains: { flint: 1, coins: 2 } }]),
  card('tf-shrine', 'hall', 'spring', [{ type: 'renown', amount: 2 }], { cost: { flint: 1 } }),
  card('tf-hall', 'hall', 'summer', [{ type: 'renown', amount: 4 }], {
    cost: { flint: 2, slate: 1 },
    upgrade: { of: ['tf-shrine'], cost: { slate: 1 } },
  }),
  card('tf-great-hall', 'hall', 'autumn', [{ type: 'renown', amount: 7 }], {
    upgrade: { of: ['tf-hall'], cost: { honey: 2 } },
  }),
  card('tf-stall', 'market', 'spring', [{ type: 'onBuild', gains: { coins: 3 } }]),
  card('tf-fair', 'market', 'summer', [
    { type: 'onBuildPerKind', kind: 'market', gains: { coins: 2 } },
  ]),
  card('tf-strongbox', 'market', 'winter', [
    { type: 'renown', amount: 1 },
    { type: 'onBuild', gains: { coins: 6 } },
  ]),
  card('tf-fence', 'watch', 'spring', [{ type: 'guard', amount: 1 }]),
  card(
    'tf-tower',
    'watch',
    'summer',
    [
      { type: 'guard', amount: 2 },
      { type: 'heldBonus', gains: { coins: 1 } },
    ],
    { upgrade: { of: ['tf-fence'], cost: { slate: 1 } } },
  ),
  lore(1, 'spring'),
  lore(2, 'spring'),
  lore(3, 'summer'),
  lore(4, 'autumn'),
  lore(5, 'autumn'),
  lore(6, 'winter'),
  card('tf-mark-halls', 'landmark', 'autumn', [{ type: 'scorePerKind', kind: 'hall', amount: 2 }]),
  card('tf-mark-tiers', 'landmark', 'winter', [{ type: 'scorePerTier', amount: 2 }]),
  card('tf-mark-valour', 'landmark', 'winter', [{ type: 'scorePerValour', amount: 1 }]),
  card('tf-mark-sets', 'landmark', 'winter', [{ type: 'scoreSets', amount: 3 }]),
  card('tf-mark-goods', 'landmark', 'winter', [{ type: 'scoreGoods', per: 2, amount: 1 }]),
  card('tf-mark-beat', 'landmark', 'winter', [{ type: 'scoreBeat', measure: 'halls', amount: 3 }]),
];

const tiers = (thresholds: number[], rewards: EffectSpec[][]): GreatWorkDef['tiers'] =>
  thresholds.map((threshold, i) => ({ threshold, reward: rewards[i] ?? [] }));

export const FX_GREAT_WORKS: GreatWorkDef[] = [
  {
    id: 'tg-crown',
    name: 'Test Crown',
    perk: [{ type: 'guard', amount: 1 }],
    tiers: tiers(
      [3, 7, 12, 18],
      [
        [{ type: 'onBuild', gains: { coins: 4 } }],
        [{ type: 'renown', amount: 3 }],
        [{ type: 'lore', rank: 3 }],
        [
          { type: 'guard', amount: 1 },
          { type: 'renown', amount: 7 },
        ],
      ],
    ),
  },
  {
    id: 'tg-bell',
    name: 'Test Bell',
    perk: [{ type: 'scoreBeat', measure: 'guard', amount: 2 }],
    tiers: tiers(
      [2, 4, 6, 8],
      [
        [{ type: 'renown', amount: 2 }],
        [{ type: 'scorePerKind', kind: 'hall', amount: 2 }],
        [{ type: 'heldBonus', gains: { coins: 2 } }],
        [{ type: 'renown', amount: 5 }],
      ],
    ),
  },
  {
    id: 'tg-larder',
    name: 'Test Larder',
    perk: [{ type: 'seasonEnd', gains: { honey: 1 } }],
    tiers: tiers(
      [2, 5, 9, 14],
      [
        [{ type: 'onBuild', gains: { flint: 2, labour: 3 } }],
        [{ type: 'renown', amount: 3 }],
        [{ type: 'scoreGoods', per: 3, amount: 1 }],
        [{ type: 'renown', amount: 6 }],
      ],
    ),
  },
];

export const FIXTURE: WwContent = {
  goods: [
    { id: 'flint', name: 'Flint' },
    { id: 'slate', name: 'Slate' },
    { id: 'honey', name: 'Honey' },
  ],
  cards: FX_CARDS,
  greatWorks: FX_GREAT_WORKS,
  raids: [
    { id: 'tr-spring-a', name: 'Spring A', season: 'spring', strength: 1 },
    { id: 'tr-spring-b', name: 'Spring B', season: 'spring', strength: 2 },
    { id: 'tr-summer', name: 'Summer', season: 'summer', strength: 3 },
    { id: 'tr-autumn', name: 'Autumn', season: 'autumn', strength: 5 },
    { id: 'tr-winter', name: 'Winter', season: 'winter', strength: 7 },
  ],
  honours: [
    { id: 'th-guard', name: 'Guard', measure: 'guard' },
    { id: 'th-holdings', name: 'Holdings', measure: 'holdings' },
    { id: 'th-halls', name: 'Halls', measure: 'halls' },
    { id: 'th-markets', name: 'Markets', measure: 'markets' },
    { id: 'th-lore', name: 'Lore', measure: 'loreRun' },
    { id: 'th-tiers', name: 'Tiers', measure: 'tiers' },
    { id: 'th-coins', name: 'Coins', measure: 'coins' },
    { id: 'th-kinds', name: 'Kinds', measure: 'kinds' },
  ],
};
