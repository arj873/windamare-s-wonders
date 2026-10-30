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

const BASE: WwCardDef[] = [
  // --- turn effects (R13) ---
  card('tf-pond', 'holding', 'spring', [{ type: 'yield', gains: { flint: 1 } }], {
    cost: { coins: 1 },
    spend: { flint: 1, any: 1 },
  }),
  card('tf-quarry', 'holding', 'spring', [{ type: 'yield', gains: { slate: 1, labour: 1 } }], {
    cost: { flint: 1 },
    spend: { slate: 2 },
  }),
  card('tf-apiary', 'holding', 'summer', [{ type: 'yield', gains: { honey: 1 } }], {
    cost: { slate: 2 },
    spend: { honey: 2 },
  }),
  card('tf-mint', 'market', 'summer', [{ type: 'income', coins: 2 }], {
    cost: { honey: 1 },
    spend: { coins: 3 },
  }),
  card('tf-broker', 'market', 'spring', [{ type: 'exchange', good: 'flint' }], {
    spend: { coins: 2 },
  }),
  card('tf-toll', 'market', 'summer', [{ type: 'toll', coins: 1 }]),
  card('tf-hall-toll', 'market', 'autumn', [{ type: 'toll', kind: 'hall', coins: 2 }]),
  card('tf-seller', 'market', 'spring', [{ type: 'sellBonus', coins: 1 }]),
  card('tf-mason', 'watch', 'summer', [
    { type: 'guard', amount: 1 },
    { type: 'discount', kind: 'hall', amount: 1 },
  ]),
  card('tf-school', 'lore', 'summer', [
    { type: 'lore', rank: 2 },
    { type: 'spendBonus', kind: 'lore', gains: { labour: 1 } },
  ]),
  card(
    'tf-patron',
    'hall',
    'autumn',
    [
      { type: 'renown', amount: 1 },
      { type: 'buildBonus', kind: 'hall', gains: { coins: 2 } },
    ],
    { cost: { honey: 1 } },
  ),
  card('tf-gift', 'market', 'winter', [{ type: 'onBuild', gains: { any: 2 } }], {
    spend: { any: 1 },
  }),
  card('tf-keep', 'watch', 'autumn', [{ type: 'guard', amount: 3 }], { cost: { slate: 3 } }),
  // --- the rest ---
  card('tf-hut', 'holding', 'spring', [], { spend: { labour: 3 } }),
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
  card('tf-mark-watch', 'landmark', 'winter', [
    { type: 'scoreThreshold', measure: 'watches', atLeast: 2, amount: 5 },
  ]),
  card('tf-mark-seasons', 'landmark', 'winter', [
    { type: 'scoreSeasons', kind: 'hall', amount: 2 },
  ]),
];

/** BASE with enough copies that every Season deck deals 6 cards a seat, at 3 to 7 seats. */
export const FX_CARDS: WwCardDef[] = BASE.map((c) => {
  const kinds = BASE.filter((d) => d.season === c.season).length;
  return { ...c, counts: [3, 4, 5, 6, 7].map((seats) => Math.ceil((6 * seats) / kinds)) };
});

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
