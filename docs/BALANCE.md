# Balance report: full sim on the real Windamere ruleset (cards B3, B4)

Owner: bots lane. Run 2026-10-30 on main `9a7a293` (engine with the Great Work choice, 2-seat
variant, shipped tunables, typed event log) + `agent/bots`. Rerun after the E3 event-log change:
every number is identical to the run on `b50fccd`, which also shows the metrics read the new events
correctly. Targets: `docs/design/research/balance-targets.md`.
Bots: **random** (uniform over legal picks) and **greedy** (level 1: the cheapest legal Build that
still scores, else the best Spend; the Great Work is chosen by a fixed rating rule; see
`docs/BOTS.md`). 1000 seeded games per row (section 3 for 2-5 seats: pooled rosters, listed).
Reproduce: `nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1` (about 2 minutes).
Standard error of a win share at 1000 games: about 1.4 points (4 seats) to 1.1 (7 seats).

## 0. Read this first

- **Greedy is a weak, untuned bot.** These numbers describe how the _rules and cards_ behave under
  that bot, not under good play. Findings that depend on bot quality are marked.
- Score sources are research's 8: Hall Renown, Landmarks, other card Renown, Great Work, Valour,
  Lore, Honours, Purse (a test checks they add up to each town's total).
- **Neighbour interaction** is the net coin transfer, `(received - paid) / 4 + scoreBeat`, where
  received/paid are filled neighbour purchases (with `sellBonus`) and bounty. Tolls (bank coins
  triggered by neighbours' Builds) are listed apart. The earlier ~30% figure (first report) counted
  gross sale coins and is withdrawn.
- **Not measured**: F3 (offers leave the state once chosen), F4 Honour win shares, I2 hate-drafting,
  R1/R2 snowball (needs mid-game snapshots), P1/P2 legal pick and payment-plan counts, P4 think
  time, S5 per-card build rates, K2 (only one non-random level exists).
- The Great Work ratio in 1b pools all seat counts; a Great Work held by fewer than ~300 towns
  (the-hall-of-echoes 174, the-wolf-gate 117) has a wide error bar. The ratio is partly confounded:
  greedy's rating rule decides who holds which Great Work.

## 0.1 Verdict against the targets

| Target                                                   | Result                                                                                                                                                               | Status                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Robustness: no crash, illegal action or stall, 2-7 seats | 0 violations in 6 x 1000 games per bot set                                                                                                                           | pass                                                  |
| Game length (sim proxy)                                  | 20 turns (4 Seasons x 5) plus one Great Work choice: 42 to 147 picks                                                                                                 | fixed by the rules                                    |
| F1 seat fairness, fair +/- 3 pts (2 seats <= 53%)        | max deviation 0.6 / 2.7 / 3.3 / 1.6 / 1.4 / 2.4 pts (2..7 seats); 2 seats 49/51                                                                                      | pass; the 4-seat 3.3 is 2.4 standard errors, watch it |
| F2 each Great Work fair x 0.75-1.25                      | 5 of 14 outside: Coinwell 0.59, Fourfold Gate 0.51, Tide Mill 0.68, Wind Organ 0.61, Hall of Echoes 0.71 (low n); Harvest Wheel 1.46, Stonewright's Spire 1.36 above | **fail**                                              |
| S1 no source > 55% of winners; >= 4 sources >= 10%       | **Great Work is the winner's largest source in 63-73% of games**; Hall 19-31%; every other source < 6%                                                               | **fail**                                              |
| S2 each strategy fair x 0.6-1.5                          | Market 0.19-0.74x, Watch 0.24-0.94x, Lore 0.05-0.54x; Hall up to 2.0x                                                                                                | **fail** at 3+ seats (specialists are crude, see 3)   |
| S3 Lore run >= 3 in >= 25%; >= 5 in 5-15%                | 20-26% (only 6 seats reaches 25%); >= 5 is 1.3-2.2%                                                                                                                  | below                                                 |
| S4 tier IV in 20-50% of towns                            | **63-79%** (Stonewright's Spire 99%)                                                                                                                                 | **fail**: Great Works are finished too easily         |
| R3 median margin <= 10%, blowouts <= 10%                 | median margin 25% (2 seats) down to 10.4% (7); blowouts 54% down to 15%                                                                                              | **fail** at every count (7 seats nearly)              |
| I1 net neighbour Renown share median >= 10%              | **1.2-2.0%**                                                                                                                                                         | **fail**                                              |
| I3 Spring hold rate >= 50%                               | greedy towns hold the Spring Raid 38-43%                                                                                                                             | below (greedy does not build Guard on purpose)        |
| P3 Spend share <= 25% Spring-Autumn                      | Spring 34-37%; Summer/Autumn 18-31%                                                                                                                                  | missed in Spring                                      |
| K1 greedy vs random >= 83% at 3 seats, >= 3x fair at 5   | 49.7% (1.5x) at 3; 36.0% (1.8x) at 5                                                                                                                                 | **fail**: the bot is weak, or skill matters little    |

## 1-3. Tables

### 1. Equal greedy bots (level 1)

| seats | violations | picks/game | score mean | spread mean | winning score p95 | win seat 0..n-1 (fair 1/n)       | max dev. from fair |
| ----- | ---------- | ---------- | ---------- | ----------- | ----------------- | -------------------------------- | ------------------ |
| 2     | 0          | 42.0       | 40.7       | 13.3        | 60.0              | 49 / 51                          | 0.6 pts            |
| 3     | 0          | 63.0       | 40.5       | 19.9        | 63.0              | 31 / 33 / 36                     | 2.7 pts            |
| 4     | 0          | 84.0       | 40.2       | 22.1        | 63.0              | 24 / 22 / 27 / 27                | 3.3 pts            |
| 5     | 0          | 105.0      | 39.5       | 25.1        | 65.0              | 21 / 18 / 19 / 20 / 21           | 1.6 pts            |
| 6     | 0          | 126.0      | 39.2       | 26.1        | 65.0              | 18 / 17 / 16 / 18 / 16 / 16      | 1.4 pts            |
| 7     | 0          | 147.0      | 39.0       | 27.1        | 66.0              | 13 / 15 / 17 / 14 / 16 / 13 / 12 | 2.4 pts            |

| seats | win score median | runner-up median | margin median % | blowouts (>=1.3x) | winner mean Renown by source (hall / landmark / other card / great work / valour / lore / honours / purse) |
| ----- | ---------------- | ---------------- | --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 2     | 47.0             | 34.0             | 25.0            | 54.3%             | 9.7 / 2.4 / 1.2 / 15.6 / 3.8 / 3.7 / 9.5 / 1.5                                                             |
| 3     | 50.0             | 40.0             | 17.8            | 35.4%             | 11.3 / 3.6 / 1.1 / 15.4 / 5.4 / 3.6 / 7.3 / 2.8                                                            |
| 4     | 51.0             | 43.0             | 14.5            | 26.8%             | 12.4 / 4.7 / 0.9 / 16.3 / 5.2 / 3.5 / 6.4 / 2.2                                                            |
| 5     | 52.0             | 44.0             | 11.8            | 19.5%             | 13.1 / 5.6 / 0.7 / 16.3 / 4.8 / 3.5 / 5.5 / 2.9                                                            |
| 6     | 52.0             | 45.0             | 11.5            | 17.2%             | 12.6 / 5.1 / 1.1 / 16.7 / 4.7 / 4.2 / 5.3 / 3.0                                                            |
| 7     | 52.0             | 46.0             | 10.4            | 14.6%             | 12.4 / 5.6 / 1.0 / 16.8 / 5.1 / 3.8 / 5.0 / 3.6                                                            |

Share of all Renown (all towns) by source:

| seats | hall  | landmark | otherCard | greatWork | valour | lore  | honours | purse |
| ----- | ----- | -------- | --------- | --------- | ------ | ----- | ------- | ----- |
| 2     | 19.7% | 4.6%     | 2.7%      | 34.7%     | 8.4%   | 9.3%  | 17.5%   | 3.1%  |
| 3     | 21.7% | 6.4%     | 2.4%      | 32.2%     | 11.1%  | 9.2%  | 11.9%   | 5.1%  |
| 4     | 22.0% | 7.5%     | 1.8%      | 36.3%     | 9.8%   | 9.2%  | 9.5%    | 3.8%  |
| 5     | 22.7% | 8.7%     | 1.5%      | 35.2%     | 9.5%   | 9.7%  | 8.0%    | 4.7%  |
| 6     | 21.8% | 7.7%     | 2.5%      | 36.8%     | 9.3%   | 10.4% | 7.1%    | 4.3%  |
| 7     | 20.6% | 8.0%     | 2.2%      | 37.8%     | 10.3%  | 9.6%  | 6.5%    | 5.0%  |

Winner's largest source (S1; target: none > 55% of winners, at least 4 sources >= 10%):

| seats | hall  | landmark | otherCard | greatWork | valour | lore | honours | purse |
| ----- | ----- | -------- | --------- | --------- | ------ | ---- | ------- | ----- |
| 2     | 18.8% | 0.9%     | 0.0%      | 73.4%     | 0.8%   | 0.5% | 5.6%    | 0.0%  |
| 3     | 28.0% | 0.9%     | 0.0%      | 66.1%     | 1.2%   | 0.9% | 1.7%    | 1.2%  |
| 4     | 30.7% | 2.2%     | 0.0%      | 64.8%     | 0.3%   | 0.5% | 1.2%    | 0.3%  |
| 5     | 30.9% | 4.7%     | 0.0%      | 62.6%     | 0.1%   | 0.7% | 0.1%    | 0.9%  |
| 6     | 29.4% | 4.1%     | 0.0%      | 63.9%     | 0.3%   | 0.9% | 0.6%    | 0.8%  |
| 7     | 28.7% | 4.1%     | 0.0%      | 65.5%     | 0.1%   | 0.8% | 0.0%    | 0.8%  |

Interaction, Lore, Raids, trade (per town unless noted):

| seats | net neighbour Renown share median (I1 target >= 10%) | Tolls Renown-equiv. per town | Lore run >= 3 (S3 target >= 25%) | run >= 5 (5-15%) | tier IV (S4 20-50%) | held Spring / Summer / Autumn / Winter (I3) | sales per game | sales from bank (seller out) | builds per town | Spend share Spring..Winter (P3) |
| ----- | ---------------------------------------------------- | ---------------------------- | -------------------------------- | ---------------- | ------------------- | ------------------------------------------- | -------------- | ---------------------------- | --------------- | ------------------------------- |
| 2     | 1.2%                                                 | 0.6                          | 21.1%                            | 1.8%             | 73.8%               | 41.5% / 40.8% / 29.1% / 33.4%               | 8.2            | 2.1                          | 13.3            | 34.0% / 31.3% / 28.1% / 41.6%   |
| 3     | 2.0%                                                 | 1.7                          | 20.4%                            | 1.8%             | 63.1%               | 42.6% / 53.6% / 42.9% / 42.5%               | 24.4           | 8.1                          | 14.4            | 36.8% / 19.2% / 17.6% / 37.4%   |
| 4     | 1.5%                                                 | 1.2                          | 21.2%                            | 1.3%             | 77.3%               | 43.0% / 45.1% / 36.1% / 38.4%               | 28.6           | 8.7                          | 13.5            | 36.5% / 25.3% / 26.3% / 41.0%   |
| 5     | 1.8%                                                 | 1.4                          | 22.0%                            | 1.9%             | 71.0%               | 38.3% / 44.2% / 33.4% / 37.2%               | 35.3           | 10.1                         | 14.0            | 33.8% / 24.3% / 24.1% / 37.3%   |
| 6     | 1.4%                                                 | 1.2                          | 25.6%                            | 2.2%             | 75.8%               | 40.4% / 46.0% / 32.1% / 34.2%               | 41.4           | 11.4                         | 13.8            | 35.3% / 25.2% / 25.3% / 38.7%   |
| 7     | 1.6%                                                 | 1.1                          | 20.7%                            | 1.8%             | 79.3%               | 42.0% / 45.9% / 37.1% / 39.3%               | 48.2           | 13.9                         | 13.8            | 33.6% / 27.5% / 25.4% / 38.3%   |

### 1b. Great Works (F2: each wins fair x 0.75-1.25; chosen by greedy's rating rule)

Pooled over the equal-greedy tables of all seat counts; fair = 1 / seats, so the ratio is wins per time held x seats of that game.

| Great Work             | towns that held it | win ratio vs fair | tier IV                |
| ---------------------- | ------------------ | ----------------- | ---------------------- |
| the-beacon-crown       | 1456 towns total   | 0.92x             | 71.7% (mean tiers 3.6) |
| the-coinwell           | 3297 towns total   | 0.59x             | 71.2% (mean tiers 3.6) |
| the-fourfold-gate      | 804 towns total    | 0.51x             | 73.8% (mean tiers 3.6) |
| the-hall-of-echoes     | 174 towns total    | 0.71x             | 67.8% (mean tiers 3.6) |
| the-harvest-wheel      | 1896 towns total   | 1.46x             | 80.6% (mean tiers 3.7) |
| the-ice-lantern        | 3441 towns total   | 1.17x             | 68.3% (mean tiers 3.6) |
| the-lantern-market     | 1187 towns total   | 1.05x             | 70.6% (mean tiers 3.6) |
| the-mere-bridge        | 2600 towns total   | 0.80x             | 68.9% (mean tiers 3.5) |
| the-ring-of-oaths      | 2451 towns total   | 1.04x             | 71.4% (mean tiers 3.6) |
| the-salt-stair         | 2545 towns total   | 1.18x             | 64.4% (mean tiers 3.5) |
| the-stonewrights-spire | 3924 towns total   | 1.36x             | 99.3% (mean tiers 4.0) |
| the-tide-mill          | 2546 towns total   | 0.68x             | 66.6% (mean tiers 3.5) |
| the-wind-organ         | 562 towns total    | 0.61x             | 76.0% (mean tiers 3.6) |
| the-wolf-gate          | 117 towns total    | 1.15x             | 76.1% (mean tiers 3.7) |

F3 (choice rate when offered) is not measured: the offers leave the state once chosen.

### 2. Greedy vs random (K1; target: >= 83% at 3 seats, >= 3x fair = 60% at 5 seats)

| seats | greedy win share | fair  | ratio | random win share per seat |
| ----- | ---------------- | ----- | ----- | ------------------------- |
| 2     | 65.6%            | 50.0% | 1.31x | 34.4%                     |
| 3     | 49.7%            | 33.3% | 1.49x | 25.1%                     |
| 4     | 41.6%            | 25.0% | 1.66x | 19.5%                     |
| 5     | 36.0%            | 20.0% | 1.80x | 16.0%                     |
| 6     | 29.6%            | 16.7% | 1.78x | 14.1%                     |
| 7     | 25.9%            | 14.3% | 1.81x | 12.3%                     |

(greedy holds one seat per game, rotating, so its win share is wins per game it played.)

### 3. Specialist strategies (S2; target: each wins fair x 0.6-1.5)

| seats                     | greedy        | focus-holding | focus-hall    | focus-market  | focus-watch   | focus-lore    |
| ------------------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- |
| 2 (15 rosters x 67 games) | 75.8% (1.52x) | 44.3% (0.89x) | 68.4% (1.37x) | 37.2% (0.74x) | 47.2% (0.94x) | 27.2% (0.54x) |
| 3 (20 rosters x 50 games) | 64.6% (1.94x) | 49.4% (1.48x) | 50.2% (1.51x) | 11.8% (0.35x) | 14.8% (0.44x) | 9.2% (0.28x)  |
| 4 (15 rosters x 67 games) | 62.1% (2.48x) | 25.2% (1.01x) | 43.8% (1.75x) | 6.4% (0.26x)  | 7.8% (0.31x)  | 4.7% (0.19x)  |
| 5 (6 rosters x 167 games) | 56.3% (2.81x) | 20.1% (1.01x) | 31.1% (1.55x) | 3.7% (0.19x)  | 6.3% (0.31x)  | 2.5% (0.13x)  |
| 6 (1 roster x 1000 games) | 41.0% (2.46x) | 15.5% (0.93x) | 32.0% (1.92x) | 4.5% (0.27x)  | 6.1% (0.37x)  | 0.9% (0.05x)  |
| 7 (1 roster x 1000 games) | 37.5% (2.62x) | 17.1% (1.20x) | 29.2% (2.04x) | 4.1% (0.29x)  | 3.4% (0.24x)  | 1.2% (0.08x)  |

Cell = win share per seat held, and that share as a multiple of fair (1/seats).

## 4. Findings, in order of how much they matter

1. **The Great Work decides most games.** It is 32-38% of all Renown, and the largest source of
   the winner in 63-73% of games (Hall is next at 19-31%). A winner's mean is about 15-17 Renown
   from the Great Work against 10-13 from Halls. Tier IV is reached by 63-79% of greedy towns
   (target 20-50%), and The Stonewright's Spire reaches it 99% of the time. Lever for design:
   thresholds (R8.1 standard 3/6/10/15 are met too easily because Spend bands pay labour) and the
   per-tier Renown. _Confounder:_ greedy values Spend gains of labour at 1.5 and may Spend more for
   labour than a human would; a human may also Spend less. Not tested.
2. **Great Works are not balanced.** Win ratio vs fair: The Harvest Wheel 1.46, The Stonewright's
   Spire 1.36 (both over 1.25); The Coinwell 0.59, The Fourfold Gate 0.51, The Tide Mill 0.68,
   The Wind Organ 0.61 (under 0.75). The Coinwell is among the three most-held (3297 towns), so
   greedy's rating rule picks it a lot and it underperforms; that is a strong signal.
3. **Net interaction with neighbours is almost nil** (1-2% of Renown). Purchases and sales
   cancel (every town both buys and sells: 24-48 sales per game at 3-7 seats, of which 8-14 hit an
   empty seller and go to the bank), and the one-sided parts (Tolls ~1-2 Renown-equivalent per
   town) are small. Neighbours matter for _access to goods_, not for score swings. If the human
   wants stronger interaction, design needs `scoreBeat`-like or competitive effects, not more trade.
4. **Honours matter much less as the table grows**: 17.5% of all Renown at 2 seats, 6.5% at 7.
   Winner-take-all with 5 Renown shared across more towns is rarely decisive. The winner's largest
   source is Honours in 0-6% of games.
5. **Lore and Valour are minor** (Lore 9-10% of Renown, Valour 8-11%) and almost never the
   winner's largest source (< 1.3%). Lore runs >= 5 are 1-2% of towns (target 5-15%). Greedy does
   not plan Lore runs, so this under-states Lore.
6. **Blowouts shrink as the table grows** (54% at 2 seats, 35% at 3, 15% at 7), so the gap is
   mostly bot variance averaging out, not an engine snowball. The R1/R2 snapshots are still
   needed to separate the two.
7. **Seat fairness is good** at all counts including the new 2-seat variant (49/51).
8. **Strategies**: a specialist that builds only one kind is viable for Holding (0.9-1.5x) and
   Hall (1.4-2.0x) but not for Market (0.19-0.74x), Watch (0.24-0.94x) or Lore (0.05-0.54x) at 3+
   seats. The general greedy bot beats all of them (1.5-2.8x). Single-kind bots are a crude
   probe; the finding to carry is "Market, Watch and Lore are support kinds that cannot carry a
   plan alone", which is a design question (should they?), not a proven balance bug.
9. **Raids**: greedy towns hold 29-54% per Season; Valour is worth 8-11% of Renown.
10. **K1 missed**: greedy wins 1.3-1.8x fair against random bots. Either the valuation is too
    crude (likely: it ignores Honours, Lore runs, Guard timing) or luck dominates the game. A
    level-2 bot is needed to tell; until then "the game rewards skill" is **not established**.

## 5. What would change these numbers

- Design D7 re-tune: Great Work thresholds and tier Renown first (findings 1-2). The sim reads the
  engine's shipped tunables, so a re-tune in `src/content/windamere/tunables.ts` is picked up.
- Bots: level 2 (planning for Lore, Honours, Guard; Spend choices) will move S1, S3, K1.
- Engine: mid-game snapshots for the snowball metrics.
