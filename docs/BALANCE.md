# Balance report: the real Windamere ruleset after D9 (cards L1, L2)

Owner: balance lane (moved from bots). Run 2026-10-30 on main `ccb126f`: design D9 re-tune
(`6d2eda7`: Great Work thresholds 4/9/15/22, Valour 2/3/4/5, Hall and upgrade changes), D8 prices
(market 1/3/4/5, bank 6), the Great Work choice and the 2-seat variant. Targets:
`docs/design/research/balance-targets.md`. Experiments (L2) and how to run them:
`docs/balance/README.md`.

Bots: **random** (uniform over legal picks) and **greedy** (level 1: the cheapest legal Build that
still scores, else the Spend with the biggest band; the Great Work by a fixed rating rule; see
`docs/BOTS.md`). 1000 seeded games per row, seeds 1-1000 (section 3 at 2-5 seats: pooled rosters,
listed). Standard error of a win share at 1000 games: about 1.6 points (2 seats) to 1.1 (7 seats).
Reproduce: `nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1` (297 s, 270 MB RSS
on this machine).

## 0. Read this first

- **The bots are greedy level 1, so every number here measures bot play, not human play.** Greedy
  never reads a Renown amount (only its Great Work choice does), never plans a Lore run, chases an
  Honour or times Guard. A change to Renown moves the score sheet without changing one bot
  decision; a change to costs, prices, card counts or Spend bands also changes decisions.
- **This run reproduces design's D9 measurements** (`docs/design/CARDS.md` §11): every range
  design reports for "After D9" matches the tables below. Design ran the same script with the same
  seeds, so this confirms the run on main, not a fresh sample. New here: the per-Great-Work ratios
  (1b) that design asked for, S1 by R12.2 group, and where winning margins come from.
- **Score sources.** Research's 8 sources (Hall, Landmark, other card, Great Work, Valour, Lore,
  Honours, Purse) and, for S1 as written in the targets, R12.2's six score-sheet groups, where
  **Town** = Hall + Landmark + other card Renown. The kickoff figure "Town is the winner's top
  category in 82-90%" came from the bots' first report, before the Great Work choice existed;
  it no longer applies (Town is now 36-56%).
- **Neighbour interaction** (I1) is the net transfer, `(received - paid) / 4 + scoreBeat`, with
  received/paid = filled neighbour sales (with `sellBonus`) and bounty. Tolls are listed apart.
- **The Wolf Gate never appears**: greedy's rating rule counts printed Renown, and the Wolf Gate's
  tier IV is mostly `scorePerValour`, so it always loses the choice. A rule artefact (bots lane),
  but it also means F2 has no data for it.
- **Not measured**: F3 (offers leave the state once chosen), F4 Honour win shares, I2
  hate-drafting, R1/R2 snowball (needs mid-game snapshots), P1/P2 pick and payment-plan counts, P4
  think time, S5 per-card build rates, K2 (one non-random level exists).

## 0.1 Verdict against the targets

| Target                                                 | Result (2-7 seats)                                                                                                                                       | Status                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Robustness: no crash, illegal action or stall          | 0 violations in 6 x 1000 games per bot set                                                                                                               | pass                                           |
| F1 seat fairness, fair +/- 3 pts (2 seats <= 53%)      | max deviation 2.1 / 1.7 / 1.0 / 2.1 / 1.4 / 3.0 pts; 2 seats 48/52                                                                                       | pass; 7 seats on the line (2.7 SE, max of 7)   |
| F2 each Great Work fair x 0.75-1.25                    | 4 of 13 chosen outside: **Stonewright's Spire 1.55x** (tier IV 81%); Fourfold Gate 0.58x, Mere Bridge 0.60x, Hall of Echoes 0.60x (n=291); Wolf Gate n=0 | **fail**                                       |
| S1 no source > 55% of winners (8 sources)              | Great Work 40-56% (7 seats 56.1%); Hall 22-34%; Valour 11-19%                                                                                            | pass except 7 seats, by 1 pt                   |
| S1 by R12.2 group (as written)                         | Town 36-56% (5 seats 56.0%); Great Work 33-45%; Raids 6-12%                                                                                              | pass except 5 seats, by 1 pt                   |
| S1 at least 4 sources >= 10% of winners                | 8 sources: 3 (Great Work, Hall, Valour), 4 at 2 seats (Honours 15%); R12.2 groups: 2-3                                                                   | **fail**                                       |
| S2 each specialist fair x 0.6-1.5                      | Holding 0.97-1.48x, Hall 1.11-1.19x pass; Watch 0.58-1.12x; **Market 0.20-0.70x, Lore 0.10-0.41x**                                                       | **fail** (Market, Lore); Watch 5 seats 0.58x   |
| S3 Lore run >= 3 in >= 25%; >= 5 in 5-15%              | 17.1-21.8%; 1.4-2.7%                                                                                                                                     | **fail**                                       |
| S4 tier IV in 20-50% of towns                          | 30.8-46.9% (Spire 80.6%)                                                                                                                                 | pass (D9 fixed it)                             |
| R3 median margin <= 10%, blowouts <= 10%               | margin 27.5% (2 seats) down to 10.5% (7); blowouts 58.0 / 38.9 / 30.3 / 25.4 / 22.5 / 17.4%                                                              | **fail** at every count                        |
| I1 net neighbour Renown share median >= 10%            | 1.5-2.0%                                                                                                                                                 | **fail** (structural, see 4.6)                 |
| I3 Spring hold rate >= 50% (one-Watch town)            | all greedy towns 39.6-45.0%                                                                                                                              | below (greedy does not build Guard on purpose) |
| P3 Spend share <= 25% Spring-Autumn                    | Spring 19-22%; **Summer 21-34%, Autumn 26-36%**; Winter 43-47% (report only)                                                                             | **fail** Summer-Autumn                         |
| K1 greedy vs random >= 83% at 3 seats, >= 3x fair at 5 | 56.1% (1.68x) at 3; 37.4% (1.87x) at 5                                                                                                                   | **fail**: weak bot, or luck matters a lot      |
| R4 winning score (report only)                         | median 43-47, p95 56-59                                                                                                                                  | report                                         |

## 1-3. Tables

### 1. Equal greedy bots (level 1)

| seats | violations | picks/game | score mean | spread mean | winning score p95 | win seat 0..n-1 (fair 1/n)       | max dev. from fair |
| ----- | ---------- | ---------- | ---------- | ----------- | ----------------- | -------------------------------- | ------------------ |
| 2     | 0          | 42.0       | 36.4       | 13.3        | 56.0              | 48 / 52                          | 2.1 pts            |
| 3     | 0          | 63.0       | 36.7       | 19.0        | 59.0              | 35 / 33 / 32                     | 1.7 pts            |
| 4     | 0          | 84.0       | 35.5       | 21.1        | 59.0              | 25 / 24 / 25 / 26                | 1.0 pts            |
| 5     | 0          | 105.0      | 34.3       | 23.7        | 59.0              | 19 / 21 / 21 / 18 / 21           | 2.1 pts            |
| 6     | 0          | 126.0      | 34.1       | 25.0        | 59.0              | 18 / 17 / 16 / 16 / 16 / 17      | 1.4 pts            |
| 7     | 0          | 147.0      | 33.4       | 25.5        | 59.0              | 13 / 14 / 14 / 14 / 12 / 15 / 17 | 3.0 pts            |

| seats | win score median | runner-up median | margin median % | blowouts (>=1.3x) | winner mean Renown by source (hall / landmark / other card / great work / valour / lore / honours / purse) |
| ----- | ---------------- | ---------------- | --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 2     | 43.0             | 30.0             | 27.5            | 58.0%             | 8.2 / 1.9 / 1.1 / 11.7 / 5.4 / 3.5 / 9.5 / 1.7                                                             |
| 3     | 46.0             | 36.0             | 18.3            | 38.9%             | 10.1 / 2.8 / 1.2 / 10.3 / 7.7 / 3.7 / 7.5 / 3.2                                                            |
| 4     | 46.0             | 38.0             | 15.4            | 30.3%             | 10.2 / 3.1 / 0.9 / 12.5 / 7.3 / 3.7 / 6.3 / 2.6                                                            |
| 5     | 46.0             | 39.0             | 13.2            | 25.4%             | 10.9 / 4.3 / 0.8 / 11.9 / 6.6 / 3.6 / 5.6 / 3.0                                                            |
| 6     | 47.0             | 40.0             | 12.8            | 22.5%             | 10.2 / 3.8 / 1.2 / 12.7 / 7.5 / 3.9 / 5.2 / 2.9                                                            |
| 7     | 46.0             | 40.0             | 10.5            | 17.4%             | 9.6 / 4.0 / 1.1 / 13.1 / 7.6 / 3.5 / 4.7 / 3.3                                                             |

Share of all Renown (all towns) by source:

| seats | hall  | landmark | otherCard | greatWork | valour | lore  | honours | purse |
| ----- | ----- | -------- | --------- | --------- | ------ | ----- | ------- | ----- |
| 2     | 18.9% | 4.1%     | 2.9%      | 28.4%     | 12.2%  | 10.0% | 19.7%   | 3.8%  |
| 3     | 22.4% | 5.4%     | 2.7%      | 24.4%     | 16.1%  | 9.9%  | 13.2%   | 6.1%  |
| 4     | 22.0% | 6.2%     | 2.1%      | 30.6%     | 14.3%  | 9.7%  | 10.3%   | 4.7%  |
| 5     | 23.1% | 7.6%     | 1.7%      | 29.2%     | 13.7%  | 10.6% | 8.7%    | 5.3%  |
| 6     | 22.0% | 6.5%     | 2.8%      | 31.1%     | 14.1%  | 11.2% | 7.5%    | 4.9%  |
| 7     | 20.0% | 6.7%     | 2.5%      | 33.2%     | 15.3%  | 10.2% | 6.8%    | 5.5%  |

Winner's largest source (S1; target: none > 55% of winners, at least 4 sources >= 10%):

| seats | hall  | landmark | otherCard | greatWork | valour | lore | honours | purse |
| ----- | ----- | -------- | --------- | --------- | ------ | ---- | ------- | ----- |
| 2     | 21.7% | 0.9%     | 0.0%      | 49.8%     | 10.6%  | 1.6% | 15.1%   | 0.3%  |
| 3     | 30.1% | 1.2%     | 0.0%      | 39.7%     | 18.8%  | 1.5% | 6.3%    | 2.4%  |
| 4     | 27.5% | 2.4%     | 0.0%      | 51.4%     | 13.8%  | 1.8% | 1.9%    | 1.2%  |
| 5     | 33.5% | 5.3%     | 0.0%      | 45.2%     | 10.9%  | 1.9% | 1.5%    | 1.7%  |
| 6     | 28.5% | 3.6%     | 0.0%      | 51.4%     | 12.5%  | 1.9% | 1.1%    | 1.0%  |
| 7     | 22.0% | 5.0%     | 0.0%      | 56.1%     | 12.7%  | 1.6% | 0.7%    | 1.9%  |

Winner's largest R12.2 score-sheet group (S1 as written; Town = Hall + Landmark + other cards; a
tie goes to the group listed first):

| seats | town  | greatWork | raids | lore | honours | purse |
| ----- | ----- | --------- | ----- | ---- | ------- | ----- |
| 2     | 35.9% | 45.0%     | 7.5%  | 1.1% | 10.3%   | 0.2%  |
| 3     | 49.3% | 32.8%     | 11.5% | 1.0% | 3.8%    | 1.6%  |
| 4     | 47.5% | 41.6%     | 8.5%  | 0.9% | 1.0%    | 0.5%  |
| 5     | 56.0% | 35.2%     | 6.2%  | 1.1% | 0.6%    | 0.9%  |
| 6     | 50.1% | 39.9%     | 7.6%  | 1.1% | 0.4%    | 0.9%  |
| 7     | 46.7% | 44.4%     | 6.8%  | 0.6% | 0.3%    | 1.2%  |

Where the margin comes from (R3): mean of the winner's minus the runner-up's Renown, by source:

| seats | margin | hall | landmark | otherCard | greatWork | valour | lore | honours | purse |
| ----- | ------ | ---- | -------- | --------- | --------- | ------ | ---- | ------- | ----- |
| 2     | 13.3   | 2.7  | 0.7      | 0.2       | 2.7       | 1.9    | -0.3 | 4.7     | 0.6   |
| 3     | 10.1   | 1.9  | 0.9      | 0.2       | 0.9       | 1.8    | 0.1  | 3.0     | 1.3   |
| 4     | 8.6    | 2.0  | 0.7      | 0.1       | 1.1       | 1.4    | 0.1  | 2.3     | 0.8   |
| 5     | 7.8    | 2.0  | 1.3      | 0.2       | 0.8       | 0.8    | -0.0 | 1.9     | 0.9   |
| 6     | 7.4    | 0.9  | 1.0      | 0.1       | 1.0       | 1.3    | 0.1  | 2.0     | 1.0   |
| 7     | 6.5    | 1.2  | 1.1      | 0.2       | 0.8       | 0.6    | 0.2  | 1.5     | 1.0   |

Interaction, Lore, Raids, trade (per town unless noted):

| seats | net neighbour Renown share median (I1 target >= 10%) | Tolls Renown-equiv. per town | Lore run >= 3 (S3 target >= 25%) | run >= 5 (5-15%) | tier IV (S4 20-50%) | held Spring / Summer / Autumn / Winter (I3) | sales per game | sales from bank (seller out) | builds per town | Spend share Spring..Winter (P3) |
| ----- | ---------------------------------------------------- | ---------------------------- | -------------------------------- | ---------------- | ------------------- | ------------------------------------------- | -------------- | ---------------------------- | --------------- | ------------------------------- |
| 2     | 1.7%                                                 | 0.5                          | 20.8%                            | 2.2%             | 41.7%               | 39.6% / 37.7% / 25.4% / 29.8%               | 7.3            | 2.0                          | 13.2            | 22.2% / 32.8% / 34.8% / 46.8%   |
| 3     | 1.5%                                                 | 1.4                          | 20.0%                            | 1.5%             | 30.8%               | 45.0% / 53.0% / 37.4% / 38.1%               | 21.9           | 6.2                          | 14.5            | 20.6% / 21.4% / 25.6% / 43.0%   |
| 4     | 2.0%                                                 | 1.0                          | 17.1%                            | 2.0%             | 46.1%               | 44.6% / 43.0% / 30.5% / 33.4%               | 26.6           | 8.3                          | 13.4            | 19.2% / 30.7% / 35.9% / 47.0%   |
| 5     | 2.0%                                                 | 1.0                          | 19.2%                            | 2.1%             | 38.6%               | 40.2% / 43.0% / 27.2% / 30.4%               | 31.4           | 9.3                          | 13.6            | 19.3% / 29.5% / 34.2% / 44.2%   |
| 6     | 1.5%                                                 | 1.0                          | 21.8%                            | 2.7%             | 43.4%               | 42.1% / 44.2% / 28.1% / 30.5%               | 37.0           | 11.0                         | 13.5            | 19.3% / 30.0% / 34.7% / 45.9%   |
| 7     | 1.6%                                                 | 0.8                          | 17.4%                            | 1.4%             | 46.9%               | 42.6% / 43.0% / 32.1% / 33.5%               | 42.3           | 12.3                         | 13.1            | 21.0% / 34.1% / 36.3% / 46.0%   |

### 1b. Great Works (F2: each wins fair x 0.75-1.25; chosen by greedy's rating rule)

Pooled over the equal-greedy tables of all seat counts; fair = 1 / seats, so the ratio is wins per
time held x seats of that game. The Wolf Gate is never chosen (section 0).

| Great Work             | towns that held it | win ratio vs fair | tier IV                |
| ---------------------- | ------------------ | ----------------- | ---------------------- |
| the-beacon-crown       | 1444 towns total   | 0.87x             | 33.6% (mean tiers 2.9) |
| the-coinwell           | 3504 towns total   | 1.06x             | 38.2% (mean tiers 2.9) |
| the-fourfold-gate      | 2069 towns total   | 0.58x             | 34.6% (mean tiers 2.9) |
| the-hall-of-echoes     | 291 towns total    | 0.60x             | 34.4% (mean tiers 2.9) |
| the-harvest-wheel      | 603 towns total    | 1.22x             | 51.2% (mean tiers 3.2) |
| the-ice-lantern        | 2097 towns total   | 0.96x             | 30.2% (mean tiers 2.7) |
| the-lantern-market     | 980 towns total    | 0.83x             | 38.2% (mean tiers 2.9) |
| the-mere-bridge        | 2894 towns total   | 0.60x             | 34.7% (mean tiers 2.9) |
| the-ring-of-oaths      | 2742 towns total   | 0.92x             | 34.5% (mean tiers 2.9) |
| the-salt-stair         | 1110 towns total   | 0.96x             | 33.5% (mean tiers 2.9) |
| the-stonewrights-spire | 3924 towns total   | 1.55x             | 80.6% (mean tiers 3.8) |
| the-tide-mill          | 3292 towns total   | 1.20x             | 34.1% (mean tiers 2.9) |
| the-wind-organ         | 2050 towns total   | 0.85x             | 41.4% (mean tiers 3.0) |

### 2. Greedy vs random (K1; target: >= 83% at 3 seats, >= 3x fair = 60% at 5 seats)

| seats | greedy win share | fair  | ratio | random win share per seat |
| ----- | ---------------- | ----- | ----- | ------------------------- |
| 2     | 68.9%            | 50.0% | 1.38x | 31.1%                     |
| 3     | 56.1%            | 33.3% | 1.68x | 21.9%                     |
| 4     | 46.8%            | 25.0% | 1.87x | 17.8%                     |
| 5     | 37.4%            | 20.0% | 1.87x | 15.7%                     |
| 6     | 36.7%            | 16.7% | 2.20x | 12.7%                     |
| 7     | 29.1%            | 14.3% | 2.04x | 11.8%                     |

(greedy holds one seat per game, rotating, so its win share is wins per game it played.)

### 3. Specialist strategies (S2; target: each wins fair x 0.6-1.5)

| seats                     | greedy        | focus-holding | focus-hall    | focus-market  | focus-watch   | focus-lore    |
| ------------------------- | ------------- | ------------- | ------------- | ------------- | ------------- | ------------- |
| 2 (15 rosters x 67 games) | 76.7% (1.53x) | 52.5% (1.05x) | 59.7% (1.19x) | 34.9% (0.70x) | 55.8% (1.12x) | 20.3% (0.41x) |
| 3 (20 rosters x 50 games) | 73.8% (2.21x) | 49.4% (1.48x) | 39.2% (1.18x) | 8.6% (0.26x)  | 23.4% (0.70x) | 5.6% (0.17x)  |
| 4 (15 rosters x 67 games) | 70.9% (2.84x) | 24.2% (0.97x) | 28.8% (1.15x) | 6.6% (0.26x)  | 15.5% (0.62x) | 4.0% (0.16x)  |
| 5 (6 rosters x 167 games) | 59.5% (2.98x) | 19.5% (0.98x) | 23.3% (1.16x) | 4.1% (0.20x)  | 11.7% (0.58x) | 1.9% (0.10x)  |
| 6 (1 roster x 1000 games) | 45.1% (2.71x) | 17.6% (1.06x) | 18.4% (1.11x) | 4.3% (0.26x)  | 12.3% (0.74x) | 2.2% (0.13x)  |
| 7 (1 roster x 1000 games) | 35.5% (2.48x) | 16.1% (1.13x) | 17.0% (1.19x) | 6.2% (0.43x)  | 13.5% (0.95x) | 1.8% (0.13x)  |

Cell = win share per seat held, and that share as a multiple of fair (1/seats).

## 4. Findings, in order of how much they matter

1. **Blowouts are the biggest miss** (17-58% of games; target <= 10%), and the margin no longer
   comes from the Great Work. Winner minus runner-up: **Honours are the largest single source at
   every seat count but 5** (4.7 of 13.3 Renown at 2 seats, 3.0 of 10.1 at 3, 1.5-2.3 at 4-7; at
   5 seats Hall 2.0 edges Honours 1.9), then Hall
   (0.9-2.7) and Valour (0.6-1.9); the Great Work adds 0.8-2.7. Honours are winner-take-all (5 sole,
   2 tied) and greedy never aims at them, so they land on whoever happens to lead. _Measure note:_
   margin % and the 1.3x rule both shrink if every town gets the same extra Renown, so a fix that
   only adds flat Renown would look better here without being better.
2. **The Stonewright's Spire is the one outlier Great Work** (F2): 1.55x fair, tier IV in 81% of
   holders against 30-51% for every other, and the most-chosen (3924 towns). Its Perk yields 1
   labour every turn outside Winter (15 labour a game before any Spend). Three are weak: Fourfold Gate 0.58x, Mere Bridge 0.60x, Hall of Echoes
   0.60x (n=291). D9 fixed the rest: 9 of 13 are inside 0.75-1.25 (before D9, 7 of 14 were).
3. **S1 now passes by the letter almost everywhere**: Great Work the winner's top source 40-56%
   (7 seats 56.1%), Town 36-56% by R12.2 group (5 seats 56.0%). But only 3 sources reach 10% of
   winners (Great Work, Hall, Valour), and Lore and Purse never top a winner (< 2.5%).
4. **Summer-Autumn Spends are 21-36%** (P3 <= 25%; 3 seats is closest at 21/26%). Winter is
   43-47% (report only: Winter has no Yield, so economy cards stop scoring for greedy). Design's
   D9b is on this.
5. **Lore runs stay short**: >= 3 in 17-22% of towns, >= 5 in 1.4-2.7%, and the Lore specialist
   wins 0.10-0.41x fair. Greedy builds the cheapest scoring card and Lore cards cost 1-5 goods,
   mostly wax and horn.
6. **Neighbour interaction is ~2% of Renown** and no tunable moved it in design's tries (bounty
   2). Every town both buys and sells (22-42 sales per game at 3-7 seats), so coins cancel. A real
   change needs a new element (design's note in CARDS.md §11: a question for the human).
7. **Specialists**: Holding (0.97-1.48x) and Hall (1.11-1.19x) are viable alone; Watch nearly
   (0.58-1.12x); Market (0.20-0.70x) and Lore (0.10-0.41x) are not. General greedy beats all of
   them (1.53-2.98x), so mixing kinds is the bot's best plan.
8. **K1 missed**: greedy wins 1.38-2.20x fair against random. Either level 1 is too crude or the
   game is luck-heavy; a level-2 bot is needed to tell. "The game rewards skill" is **not
   established**.
9. **Raids**: greedy towns hold 25-53% per Season (Spring 40-45%, I3 wants >= 50% for a one-Watch
   town; greedy builds no Guard on purpose). Valour is 12-16% of all Renown after D9 (was 8-11%).
10. **Seat fairness passes** (max 3.0 pts at 7 seats, on the line, but it is the largest of 7
    seats' deviations; 1.0-2.1 elsewhere; 2 seats 48/52).

## 5. Experiments (L2)

Results follow in the next commit; method and overlay format in `docs/balance/README.md`.
