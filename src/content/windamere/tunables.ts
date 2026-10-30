/**
 * RULES.md R16 as data: every † number in the rules. All first-pass and untested; the bots sim
 * (B1) tunes them. Keep this file and the R16 table in step.
 */

/**
 * The game numbers, keyed and shaped like the engine's `WwTunables` (src/engine/game/types.ts),
 * so the engine can pass this object as `content.tunables`. Per-Season arrays are in Season
 * order (spring, summer, autumn, winter).
 */
export const TUNABLES = {
  startingCoins: 5, // R2.2
  honoursPerGame: 3, // R2.3
  handSize: 6, // R3.2, 3-7 seats; turnsPerSeason + 1, the last card is the glean (R3.5)
  turnsPerSeason: 5, // R3.4
  bankPrice: 6, // R6.3, coins per missing good
  exchangeRate: 2, // R6.3, goods of one type for 1 missing good
  buyLimit: 2, // R6.6b, goods per neighbour per turn
  marketPrice: [1, 3, 4, 5], // R6.6c, coins per good
  valourBySeason: [1, 2, 3, 4], // R9.4
  plunderPerPoint: 1, // R9.5
  bountyPerNeighbour: 1, // R9.6, coins from each plundered neighbour
  loreRunScores: [1, 3, 6, 10, 14, 18], // R10.3, runs of length 1-6
  honourSole: 5, // R11.2
  honourTied: 2, // R11.2
  coinsPerRenown: 4, // R12.2f
};

/** R16 numbers outside the engine's `WwTunables` (setup, 2 seats, online play). */
export const OTHER_TUNABLES = {
  greatWorksOffered: 2, // R2.4
  tierThresholds: [3, 6, 10, 15], // R8.1, the standard set (each Great Work carries its own)
  twoSeatHandSize: 10, // R14.1
  twoSeatCountsIndex: 1, // R14.1: 2 seats use the 4-seat counts
  clockSec: [45, 40, 35, 30, 25], // R15.3, Normal, by turn of the Season
  greatWorkChoiceSec: 60, // R15.3
  clockFactor: { relaxed: 1.5, normal: 1, fast: 0.5 }, // R15.3, rounded up; Off = no clock
  awayWaitSec: 15, // R15.5
};
