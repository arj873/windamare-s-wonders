/**
 * D10b: cards ruled and ready, waiting for engine handlers (PENDING_EFFECT_PARAMS). They are NOT
 * in CARDS: the engine rejects content with unknown effect types, so shipping them now would stop
 * the game. When the engine lands the handlers, design moves each card into CARDS and applies its
 * swap (copies taken from another card of the same Season, so every deck stays 6 per seat).
 * The content tests check that cards plus swaps would make legal decks.
 */
import { fx, g } from './dsl';
import type { Counts, WwCardDef } from './types';

export const PENDING_CARDS: readonly WwCardDef[] = [
  {
    id: 'wend-fair',
    name: 'Wend Fair',
    kind: 'market',
    season: 'summer',
    cost: g('1S 1W'),
    spend: g('4c'),
    effects: [fx.onBuildNeighbourMin('holding', '2c')],
    counts: [1, 1, 1, 1, 1],
  },
  {
    id: 'commons-of-the-wend',
    name: 'Commons of the Wend',
    kind: 'landmark',
    season: 'autumn',
    cost: g('1R 1P 1S'),
    spend: g('3any'),
    effects: [fx.scoreNeighbourMin('holdings', 2)],
    counts: [0, 1, 1, 1, 1],
  },
  {
    id: 'brokers-arcade',
    name: "Brokers' Arcade",
    kind: 'landmark',
    season: 'autumn',
    cost: g('1P 1S 1W'),
    spend: g('1lab 3c'),
    effects: [fx.scoreSales(3, 2)],
    counts: [1, 1, 1, 1, 1],
  },
  {
    id: 'kinsfolk-hall',
    name: 'Kinsfolk Hall',
    kind: 'hall',
    season: 'winter',
    cost: g('2S 1W 1H'),
    spend: g('3any'),
    effects: [fx.renown(3), fx.scoreNeighbourMin('halls', 1)],
    counts: [1, 1, 1, 1, 1],
  },
];

/** For each pending card: the shipped card that gives up copies, and its counts afterwards. */
export const PENDING_SWAPS: Readonly<Record<string, { card: string; counts: Counts }>> = {
  'wend-fair': { card: 'counting-house', counts: [0, 0, 0, 1, 1] },
  'commons-of-the-wend': { card: 'keystone-arch', counts: [0, 0, 0, 0, 1] },
  'brokers-arcade': { card: 'merchants-row', counts: [0, 0, 1, 1, 1] },
  'kinsfolk-hall': { card: 'snowlight-hall', counts: [0, 1, 1, 2, 2] },
};
