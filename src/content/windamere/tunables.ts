/**
 * RULES.md R16 as data: every † number in the rules. All first-pass and untested; the bots sim
 * (B1) tunes them. Keep this file and the R16 table in step.
 *
 * The engine reads this object through `src/engine/game/shipped.ts`, which maps these keys and
 * shapes onto its `WwTunables`. Change values freely; a key or shape change needs the engine lane
 * first (status `Needs:`).
 */
export const TUNABLES = {
  startingCoins: 5, // R2.2
  honoursPerGame: 3, // R2.3
  greatWorksOffered: 2, // R2.4
  handSize: 6, // R3.2, 3-7 seats; turnsPerSeason + 1, the last card is the glean (R3.5)
  turnsPerSeason: 5, // R3.4
  bankPrice: 6, // R6.3, coins per missing good
  exchangeRate: 2, // R6.3, goods of one type for 1 missing good
  buyLimitPerNeighbour: 2, // R6.6b, goods per neighbour per turn
  marketPrice: { spring: 1, summer: 3, autumn: 4, winter: 5 }, // R6.6c, coins per good
  tierThresholds: [3, 6, 10, 15], // R8.1, the standard set (each Great Work carries its own)
  valour: { spring: 1, summer: 2, autumn: 3, winter: 4 }, // R9.4
  plunderPerPoint: 1, // R9.5
  bounty: 1, // R9.6, coins from each plundered neighbour
  loreRunScores: [1, 3, 6, 10, 14, 18], // R10.3, runs of length 1-6
  honourAward: { sole: 5, tied: 2 }, // R11.2
  coinsPerRenown: 4, // R12.2f
  twoSeat: { handSize: 10, deckCounts: 4 }, // R14.1: deal 10 from the 4-seat deck
  clockSec: { turns: [45, 40, 35, 30, 25], greatWorkChoice: 60 }, // R15.3, Normal
  clockOptions: { off: 0, relaxed: 1.5, normal: 1, fast: 0.5 }, // R15.3, rounded up
  awayWaitSec: 15, // R15.5
} as const;
