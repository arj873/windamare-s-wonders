/**
 * The shipped Windamere content (design's `src/content/windamere`, card D5) as the engine's
 * `WwContent`. Design keeps R16 in its own shape (per-Season objects, its own key names); this
 * maps it, so neither lane has to follow the other's field names.
 */
import { CARDS, GOODS, GREAT_WORKS, HONOURS, RAIDS, TUNABLES } from '../../content/windamere';
import { SEASONS, type WwContent, type WwTunables } from './types';

const bySeason = (x: Record<(typeof SEASONS)[number], number>): number[] =>
  SEASONS.map((s) => x[s]);
const title = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** R16 from design's TUNABLES. */
export const SHIPPED_TUNABLES: WwTunables = {
  startingCoins: TUNABLES.startingCoins,
  honoursPerGame: TUNABLES.honoursPerGame,
  greatWorksOffered: TUNABLES.greatWorksOffered,
  handSize: TUNABLES.handSize,
  turnsPerSeason: TUNABLES.turnsPerSeason,
  twoSeatHandSize: TUNABLES.twoSeat.handSize,
  bankPrice: TUNABLES.bankPrice,
  exchangeRate: TUNABLES.exchangeRate,
  buyLimit: TUNABLES.buyLimitPerNeighbour,
  marketPrice: bySeason(TUNABLES.marketPrice),
  valourBySeason: bySeason(TUNABLES.valour),
  plunderPerPoint: TUNABLES.plunderPerPoint,
  bountyPerNeighbour: TUNABLES.bounty,
  loreRunScores: [...TUNABLES.loreRunScores],
  honourSole: TUNABLES.honourAward.sole,
  honourTied: TUNABLES.honourAward.tied,
  coinsPerRenown: TUNABLES.coinsPerRenown,
};

/** The game's content: goods, cards, Great Works, Raids, Honours and R16. */
export function windamereContent(): WwContent {
  return {
    goods: GOODS.map((id) => ({ id, name: title(id) })),
    cards: CARDS,
    greatWorks: GREAT_WORKS,
    raids: RAIDS,
    honours: HONOURS,
    tunables: SHIPPED_TUNABLES,
  };
}
