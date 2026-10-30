/**
 * The shipped Windamere content (design's `src/content/windamere`, card D5) as the engine's
 * `WwContent`. Design keeps R16 in its own shape (per-Season objects, its own key names); this
 * maps it, so neither lane has to follow the other's field names.
 */
import {
  CARDS,
  FIRST_GAME,
  GOODS,
  GREAT_WORKS,
  HONOURS,
  RAIDS,
  TUNABLES,
} from '../../content/windamere';
import { SEASONS, type WwContent, type WwFirstGame, type WwTunables } from './types';

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

/** R19 from design's FIRST_GAME (its `defaultClock`, R19.5, is for net and ui, not the rules). */
export const SHIPPED_FIRST_GAME: WwFirstGame = {
  honoursPerGame: FIRST_GAME.honoursPerGame,
  greatWorksOffered: FIRST_GAME.greatWorksOffered,
  upgrades: FIRST_GAME.upgrades,
};

/** The game's content: goods, cards, Great Works, Raids, Honours, R16 and R19. */
export function windamereContent(): WwContent {
  return {
    goods: GOODS.map((id) => ({ id, name: title(id) })),
    cards: CARDS,
    greatWorks: GREAT_WORKS,
    raids: RAIDS,
    honours: HONOURS,
    tunables: SHIPPED_TUNABLES,
    firstGame: SHIPPED_FIRST_GAME,
  };
}
