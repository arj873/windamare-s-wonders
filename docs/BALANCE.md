# Balance report: full sim on the real Windamere ruleset (cards B3, B4, rerun after D8)

Owner: bots lane. Run 2026-10-30 on main `a7c4533` (design D8: market price 1/3/4/5, bank 6, R6.7 /
R17.9 fixes; engine with the Great Work choice, 2-seat variant, typed event log). Targets:
`docs/design/research/balance-targets.md`. Bots: **random** (uniform over legal picks) and
**greedy** (level 1: the cheapest legal Build that still scores, else the best Spend; the Great
Work is chosen by a fixed rating rule; see `docs/BOTS.md`). 1000 seeded games per row (section 3
for 2-5 seats: pooled rosters, listed). Reproduce:
`nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1` (about 2 minutes). Standard
error of a win share at 1000 games: about 1.4 points (4 seats) to 1.1 (7 seats). Change from the
run on `b50fccd` (before D8) is listed in section 4a.

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

| Target                                                   | Result                                                                                                                                                        | Status                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Robustness: no crash, illegal action or stall, 2-7 seats | 0 violations in 6 x 1000 games per bot set                                                                                                                    | pass                                                |
| Game length (sim proxy)                                  | 20 turns (4 Seasons x 5) plus one Great Work choice: 42 to 147 picks                                                                                          | fixed by the rules                                  |
| F1 seat fairness, fair +/- 3 pts (2 seats <= 53%)        | max deviation 1.0 / 1.5 / 2.3 / 1.8 / 1.5 / 2.1 pts (2..7 seats); 2 seats 51/49                                                                               | pass                                                |
| F2 each Great Work fair x 0.75-1.25                      | 7 of 14 outside. Low: Coinwell 0.55, Fourfold Gate 0.57, Tide Mill 0.71, Wind Organ 0.71. High: Harvest Wheel 1.62, Salt Stair 1.28, Stonewright's Spire 1.28 | **fail**                                            |
| S1 no source > 55% of winners; >= 4 sources >= 10%       | **Great Work is the winner's largest source in 59-70% of games**; Hall 22-32%; every other source < 7%                                                        | **fail**                                            |
| S2 each strategy fair x 0.6-1.5                          | Market 0.13-0.73x, Watch 0.25-0.93x, Lore 0.05-0.50x (0.6x only at 2 seats for Watch/Market); Hall 1.2-1.55x, Holding 0.88-1.48x                              | **fail** at 3+ seats (specialists are crude, see 3) |
| S3 Lore run >= 3 in >= 25%; >= 5 in 5-15%                | 19.9-24.1% (no count reaches 25%); >= 5 is 1.8-2.4%                                                                                                           | below                                               |
| S4 tier IV in 20-50% of towns                            | **65-79%** (Stonewright's Spire 99.4%)                                                                                                                        | **fail**: Great Works are finished too easily       |
| R3 median margin <= 10%, blowouts <= 10%                 | median margin 26% (2 seats) down to 11% (6-7); blowouts 56% down to 17%                                                                                       | **fail** at every count                             |
| I1 net neighbour Renown share median >= 10%              | **1.2-2.1%**                                                                                                                                                  | **fail**                                            |
| I3 Spring hold rate >= 50%                               | greedy towns hold the Spring Raid 38.5-44.5%                                                                                                                  | below (greedy does not build Guard on purpose)      |
| P3 Spend share <= 25% Spring-Autumn                      | Spring 22.8-25.9% (only 2 seats over); Summer/Autumn 18-29% (over 25% at 4+ seats, up to 29%)                                                                 | borderline                                          |
| K1 greedy vs random >= 83% at 3 seats, >= 3x fair at 5   | 56.5% (1.7x) at 3; 44.0% (2.2x) at 5                                                                                                                          | **fail**: the bot is weak, or skill matters little  |

## 1-3. Tables

### 1. Equal greedy bots (level 1)

| seats | violations | picks/game | score mean | spread mean | winning score p95 | win seat 0..n-1 (fair 1/n)       | max dev. from fair |
| ----- | ---------- | ---------- | ---------- | ----------- | ----------------- | -------------------------------- | ------------------ |
| 2     | 0          | 42.0       | 42.1       | 14.8        | 64.0              | 51 / 49                          | 1.0 pts            |
| 3     | 0          | 63.0       | 42.2       | 21.3        | 66.0              | 34 / 32 / 34                     | 1.5 pts            |
| 4     | 0          | 84.0       | 41.6       | 23.5        | 67.0              | 23 / 25 / 26 / 26                | 2.3 pts            |
| 5     | 0          | 105.0      | 40.6       | 27.6        | 69.0              | 20 / 21 / 21 / 20 / 18           | 1.8 pts            |
| 6     | 0          | 126.0      | 40.1       | 27.2        | 67.0              | 18 / 18 / 16 / 17 / 15 / 16      | 1.5 pts            |
| 7     | 0          | 147.0      | 39.9       | 30.0        | 70.0              | 12 / 12 / 15 / 16 / 16 / 13 / 16 | 2.1 pts            |

| seats | win score median | runner-up median | margin median % | blowouts (>=1.3x) | winner mean Renown by source (hall / landmark / other card / great work / valour / lore / honours / purse) |
| ----- | ---------------- | ---------------- | --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 2     | 49.0             | 35.0             | 26.3            | 56.2%             | 10.3 / 2.7 / 1.2 / 15.7 / 4.1 / 3.8 / 9.6 / 2.2                                                            |
| 3     | 53.0             | 42.0             | 17.9            | 38.4%             | 11.6 / 4.0 / 1.2 / 15.7 / 5.4 / 3.7 / 7.2 / 4.1                                                            |
| 4     | 53.0             | 44.0             | 13.8            | 24.9%             | 12.9 / 4.8 / 0.9 / 16.3 / 5.2 / 3.7 / 6.5 / 3.3                                                            |
| 5     | 54.0             | 46.0             | 12.9            | 24.7%             | 13.0 / 6.0 / 0.7 / 16.7 / 4.8 / 3.9 / 5.8 / 4.1                                                            |
| 6     | 54.0             | 46.0             | 10.9            | 17.4%             | 12.9 / 5.5 / 1.2 / 16.8 / 4.9 / 4.2 / 5.2 / 3.8                                                            |
| 7     | 55.0             | 48.0             | 11.3            | 17.5%             | 12.4 / 6.1 / 1.2 / 17.1 / 5.3 / 3.9 / 5.2 / 4.8                                                            |

Share of all Renown (all towns) by source:

| seats | hall  | landmark | otherCard | greatWork | valour | lore  | honours | purse |
| ----- | ----- | -------- | --------- | --------- | ------ | ----- | ------- | ----- |
| 2     | 19.6% | 5.0%     | 2.6%      | 34.5%     | 8.3%   | 9.1%  | 16.9%   | 4.1%  |
| 3     | 21.6% | 6.5%     | 2.3%      | 31.7%     | 10.8%  | 9.1%  | 11.4%   | 6.6%  |
| 4     | 22.5% | 7.6%     | 1.8%      | 35.4%     | 9.6%   | 8.9%  | 9.2%    | 5.0%  |
| 5     | 22.7% | 8.8%     | 1.4%      | 34.8%     | 9.1%   | 9.5%  | 7.8%    | 5.8%  |
| 6     | 22.0% | 7.8%     | 2.4%      | 36.0%     | 9.3%   | 10.1% | 7.0%    | 5.3%  |
| 7     | 20.5% | 8.1%     | 2.1%      | 37.2%     | 10.3%  | 9.3%  | 6.4%    | 6.1%  |

Winner's largest source (S1; target: none > 55% of winners, at least 4 sources >= 10%):

| seats | hall  | landmark | otherCard | greatWork | valour | lore | honours | purse |
| ----- | ----- | -------- | --------- | --------- | ------ | ---- | ------- | ----- |
| 2     | 22.3% | 0.6%     | 0.0%      | 70.0%     | 0.9%   | 1.0% | 4.9%    | 0.3%  |
| 3     | 27.1% | 1.0%     | 0.0%      | 65.8%     | 0.4%   | 1.3% | 1.8%    | 2.6%  |
| 4     | 32.4% | 2.2%     | 0.0%      | 63.2%     | 0.3%   | 0.7% | 0.4%    | 0.8%  |
| 5     | 32.5% | 5.9%     | 0.0%      | 59.3%     | 0.1%   | 0.5% | 0.4%    | 1.3%  |
| 6     | 31.5% | 4.2%     | 0.0%      | 61.3%     | 0.2%   | 1.0% | 0.3%    | 1.5%  |
| 7     | 26.3% | 6.7%     | 0.0%      | 63.9%     | 0.1%   | 0.8% | 0.1%    | 2.1%  |

Interaction, Lore, Raids, trade (per town unless noted):

| seats | net neighbour Renown share median (I1 target >= 10%) | Tolls Renown-equiv. per town | Lore run >= 3 (S3 target >= 25%) | run >= 5 (5-15%) | tier IV (S4 20-50%) | held Spring / Summer / Autumn / Winter (I3) | sales per game | sales from bank (seller out) | builds per town | Spend share Spring..Winter (P3) |
| ----- | ---------------------------------------------------- | ---------------------------- | -------------------------------- | ---------------- | ------------------- | ------------------------------------------- | -------------- | ---------------------------- | --------------- | ------------------------------- |
| 2     | 1.2%                                                 | 0.6                          | 22.2%                            | 2.1%             | 77.1%               | 38.5% / 38.6% / 30.4% / 35.6%               | 8.2            | 1.9                          | 14.0            | 25.9% / 28.0% / 26.2% / 39.5%   |
| 3     | 2.1%                                                 | 1.7                          | 22.2%                            | 2.3%             | 65.4%               | 44.0% / 54.8% / 42.9% / 43.0%               | 25.1           | 6.6                          | 15.1            | 24.7% / 18.8% / 18.3% / 35.3%   |
| 4     | 1.7%                                                 | 1.3                          | 19.9%                            | 2.2%             | 79.0%               | 44.5% / 45.5% / 36.4% / 39.0%               | 29.5           | 8.0                          | 14.3            | 23.1% / 25.7% / 25.8% / 39.8%   |
| 5     | 1.4%                                                 | 1.4                          | 21.5%                            | 2.3%             | 72.4%               | 39.9% / 44.3% / 32.3% / 36.5%               | 34.9           | 8.8                          | 14.5            | 22.8% / 25.4% / 25.8% / 36.6%   |
| 6     | 1.4%                                                 | 1.2                          | 24.1%                            | 2.4%             | 75.6%               | 43.0% / 47.3% / 32.0% / 35.1%               | 41.1           | 10.6                         | 14.3            | 22.8% / 26.0% / 26.1% / 38.2%   |
| 7     | 1.6%                                                 | 1.1                          | 20.1%                            | 1.8%             | 79.3%               | 42.2% / 44.8% / 38.5% / 40.6%               | 47.6           | 12.0                         | 14.1            | 23.9% / 29.0% / 26.8% / 38.2%   |

### 1b. Great Works (F2: each wins fair x 0.75-1.25; chosen by greedy's rating rule)

Pooled over the equal-greedy tables of all seat counts; fair = 1 / seats, so the ratio is wins per time held x seats of that game.

| Great Work             | towns that held it | win ratio vs fair | tier IV                |
| ---------------------- | ------------------ | ----------------- | ---------------------- |
| the-beacon-crown       | 1456 towns total   | 0.87x             | 72.2% (mean tiers 3.6) |
| the-coinwell           | 3297 towns total   | 0.55x             | 73.0% (mean tiers 3.6) |
| the-fourfold-gate      | 804 towns total    | 0.57x             | 73.4% (mean tiers 3.6) |
| the-hall-of-echoes     | 174 towns total    | 0.78x             | 68.4% (mean tiers 3.6) |
| the-harvest-wheel      | 1896 towns total   | 1.62x             | 80.7% (mean tiers 3.7) |
| the-ice-lantern        | 3441 towns total   | 1.17x             | 66.6% (mean tiers 3.5) |
| the-lantern-market     | 1187 towns total   | 0.98x             | 74.1% (mean tiers 3.6) |
| the-mere-bridge        | 2600 towns total   | 0.76x             | 72.2% (mean tiers 3.6) |
| the-ring-of-oaths      | 2451 towns total   | 1.03x             | 73.4% (mean tiers 3.6) |
| the-salt-stair         | 2545 towns total   | 1.28x             | 65.1% (mean tiers 3.5) |
| the-stonewrights-spire | 3924 towns total   | 1.28x             | 99.4% (mean tiers 4.0) |
| the-tide-mill          | 2546 towns total   | 0.71x             | 68.6% (mean tiers 3.6) |
| the-wind-organ         | 562 towns total    | 0.71x             | 77.4% (mean tiers 3.7) |
| the-wolf-gate          | 117 towns total    | 0.85x             | 76.1% (mean tiers 3.6) |

F3 (choice rate when offered) is not measured: the offers leave the state once chosen.

### 2. Greedy vs random (K1; target: >= 83% at 3 seats, >= 3x fair = 60% at 5 seats)

| seats | greedy win share | fair  | ratio | random win share per seat |
| ----- | ---------------- | ----- | ----- | ------------------------- |
| 2     | 71.0%            | 50.0% | 1.42x | 29.0%                     |
| 3     | 56.5%            | 33.3% | 1.69x | 21.8%                     |
| 4     | 47.0%            | 25.0% | 1.88x | 17.7%                     |
| 5     | 44.0%            | 20.0% | 2.20x | 14.0%                     |
| 6     | 37.9%            | 16.7% | 2.27x | 12.4%                     |
| 7     | 32.5%            | 14.3% | 2.27x | 11.3%                     |

(greedy holds one seat per game, rotating, so its win share is wins per game it played.)

### 3. Specialist strategies (S2; target: each wins fair x 0.6-1.5)

| seats                     | greedy        | focus-holding | focus-hall    | focus-market  | focus-watch   | focus-lore    |
| ------------------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- |
| 2 (15 rosters x 67 games) | 82.4% (1.65x) | 43.9% (0.88x) | 66.0% (1.32x) | 36.4% (0.73x) | 46.6% (0.93x) | 24.8% (0.50x) |
| 3 (20 rosters x 50 games) | 71.6% (2.15x) | 49.4% (1.48x) | 44.0% (1.32x) | 12.8% (0.38x) | 15.0% (0.45x) | 7.2% (0.22x)  |
| 4 (15 rosters x 67 games) | 71.4% (2.86x) | 24.9% (0.99x) | 34.4% (1.38x) | 7.7% (0.31x)  | 7.0% (0.28x)  | 4.6% (0.19x)  |
| 5 (6 rosters x 167 games) | 64.8% (3.24x) | 21.1% (1.05x) | 24.2% (1.21x) | 2.6% (0.13x)  | 5.5% (0.28x)  | 1.8% (0.09x)  |
| 6 (1 roster x 1000 games) | 54.6% (3.28x) | 15.2% (0.91x) | 21.8% (1.31x) | 3.3% (0.20x)  | 4.2% (0.25x)  | 0.9% (0.05x)  |
| 7 (1 roster x 1000 games) | 42.4% (2.97x) | 18.2% (1.27x) | 22.1% (1.55x) | 3.9% (0.27x)  | 4.1% (0.29x)  | 1.1% (0.08x)  |

Cell = win share per seat held, and that share as a multiple of fair (1/seats).

## 4. Findings, in order of how much they matter

1. **The Great Work decides most games.** It is 32-37% of all Renown, and the largest source of
   the winner in 59-70% of games (Hall is next at 22-32%). A winner's mean is about 16-17 Renown
   from the Great Work against 10-13 from Halls. Tier IV is reached by 65-79% of greedy towns
   (target 20-50%), and The Stonewright's Spire reaches it 99.4% of the time. Levers for design:
   thresholds (R8.1 standard 3/6/10/15 are met too easily because Spend bands pay labour) and the
   per-tier Renown. _Confounder:_ greedy values labour in Spend bands at 1.5 and may Spend more for
   labour than a human would. Not tested.
2. **Great Works are not balanced.** Win ratio vs fair: The Harvest Wheel 1.62, The Salt Stair 1.28,
   The Stonewright's Spire 1.28 (over 1.25); The Coinwell 0.55, The Fourfold Gate 0.57, The Tide
   Mill 0.71, The Wind Organ 0.71 (under 0.75). The Coinwell is the second most held (3297 towns),
   because greedy's rating rule picks it a lot, and it underperforms: a strong signal. The Hall of
   Echoes (174) and The Wolf Gate (117) have too few samples to judge.
3. **Net interaction with neighbours is almost nil** (1-2% of Renown). Purchases and sales
   cancel (every town both buys and sells: 25-48 sales per game at 3-7 seats, of which 7-12 hit an
   empty seller and go to the bank), and the one-sided parts (Tolls ~1-2 Renown-equivalent per
   town) are small. Neighbours matter for _access to goods_, not for score swings. If the human
   wants stronger interaction, design needs `scoreBeat`-like or competitive effects, not more trade.
4. **Honours matter much less as the table grows**: 16.9% of all Renown at 2 seats, 6.4% at 7.
   Winner-take-all with 5 Renown shared across more towns is rarely decisive. The winner's largest
   source is Honours in 0-5% of games.
5. **Lore and Valour are minor** (Lore 9-10% of Renown, Valour 8-11%) and almost never the winner's
   largest source (about 1% each). Lore runs >= 5 are 2% of towns (target 5-15%). Greedy does not
   plan Lore runs, so this under-states Lore.
6. **Blowouts shrink as the table grows** (56% at 2 seats, 38% at 3, 17% at 7), so the gap is
   mostly bot variance averaging out, not an engine snowball. The R1/R2 snapshots are still needed
   to separate the two.
7. **Seat fairness is good** at all counts including the 2-seat variant (51/49).
8. **Strategies**: a specialist that builds only one kind is viable for Holding (0.9-1.5x) and Hall
   (1.2-1.55x) but not for Market (0.13-0.73x), Watch (0.25-0.93x) or Lore (0.05-0.50x) at 3+
   seats. The general greedy bot beats all of them (1.65-3.28x). Single-kind bots are a crude
   probe; the finding to carry is "Market, Watch and Lore are support kinds that cannot carry a
   plan alone", which is a design question (should they?), not a proven balance bug.
9. **Raids**: greedy towns hold 30-55% per Season; Valour is worth 8-11% of Renown.
10. **K1 missed**: greedy wins 1.4-2.3x fair against random bots. Either the valuation is too crude
    (likely: it ignores Honours, Lore runs, Guard timing) or luck dominates the game. A level-2 bot
    is needed to tell; until then "the game rewards skill" is **not established**.

### 4a. What D8 (market price 1/3/4/5, bank 6) changed, versus the run on `b50fccd`

Same seeds, 1000 games per row. Differences larger than the noise (about 1-2 points):

- **Spring Spend share fell** from 34-37% to 23-26% (the bank is dearer, goods from neighbours
  cost more, so greedy Builds more in Spring). P3 is now met in Spring except at 2 seats.
- **Greedy beats random more**: K1 ratio 1.5x to 1.7x (3 seats) and 1.8x to 2.2x (5 seats); the
  purse is worth more (3-5% to 4-7% of Renown, since coins are spent less).
- **Seat deviations** fell slightly (max 3.3 to 2.3 pts at 4 seats).
- **Unchanged**: Great Work dominance (59-70% vs 63-73%), tier IV (65-79%), neighbour share
  (1-2%), Honours and Lore shares, blowout pattern. So D8 did not touch the main problems.

## 5. What would change these numbers

- Design D9 re-tune: Great Work thresholds and tier Renown first (findings 1-2). The sim reads the
  engine's shipped tunables, so a change in `src/content/windamere/tunables.ts` is picked up.
- Bots: level 2 (planning for Lore, Honours, Guard; Spend choices) will move S1, S3, K1.
- Engine: mid-game snapshots for the snowball metrics.
