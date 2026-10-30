# Balance report: first sim on the real Windamere ruleset (card B3)

Owner: bots lane. Run 2026-10-30 on main `63002f4` + `agent/bots`. Engine E2 and design's
`src/content/windamere` as merged. Targets: `docs/design/research/balance-targets.md`.
Bots: **random** (uniform over legal picks) and **greedy** (level 1: the cheapest legal Build that
still scores, else the best Spend; see `docs/BOTS.md`). All tables: 1000 seeded games per row
(section 3 for 3-5 seats: pooled rosters, listed). Reproduce:
`nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1` (about 1 minute).
Standard error of a win share at 1000 games is about 1.5 points (3 seats), 1.1 points (7 seats).

## 0. Read this first

- **No Great Works yet.** The engine has not implemented the Great Work choice (ENGINE.md §15
  "Not yet"), so no town has a Perk or a track: tiers, labour thresholds, `greatWork` Renown are
  all 0. **Targets F2, F3, S4 and the Great Work win rates cannot be measured; they are not
  claimed.** Rerun when the engine lands it.
- **The 2-seat variant is not implemented** (`minSeats` is 3): no 2-seat rows.
- **Greedy is a weak, untuned bot** with crude card valuation. Everything below describes how the
  _rules and cards_ behave under that bot, not under good play. A finding that depends on bot
  quality is marked.
- Not measured: R1/R2 snowball (needs mid-game snapshots), F4 Honour win shares, I2 hate-drafting,
  P1/P2 legal pick and payment-plan counts, P4 think time (greedy is a single pass over about 12
  picks, well under 1 ms; not timed), S5 per-card build rates.
- Design/engine mismatch found: `src/content/windamere/tunables.ts` and the engine's `WwTunables`
  use different key names and shapes (`buyLimitPerNeighbour` vs `buyLimit`; `{spring: 1, ...}` vs
  `[1, ...]`), so the content tunables cannot be passed to the engine. The values are identical
  today, so the sim passes none (`src/bots/windamere.ts`). After a **re-tune (design D7) the
  numbers must be changed in the engine's defaults too**, or the sim will not see them.

## 0.1 Verdict against the targets

| Target                                                             | Result                                                     | Status                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------- |
| Robustness: no crash/illegal/stall, 3-7 seats                      | 0 violations in 5 x 1000 games per bot set                 | pass                                                    |
| Game length (sim proxy)                                            | always 20 turns (4 Seasons x 5), 60 to 140 picks           | fixed by the rules                                      |
| F1 seat balance, within fair +/- 3 pts                             | max deviation 0.5 / 1.7 / 3.3 / 0.9 / 1.0 pts (3..7 seats) | pass (5 seats is 3.3, within 2 standard errors)         |
| S1 largest category: none > 55% of winners, >= 4 categories >= 10% | **Town 82-90%; only Raids reaches 4-9%**                   | **fail** (see §1)                                       |
| S2 each strategy fair x 0.6-1.5                                    | focus bots 0.04-0.39x except Hall 1.9-2.5x                 | **fail**, but confounded by crude specialists (§3)      |
| S3 Lore run >= 3 in >= 25% of towns; >= 5 in 5-15%                 | 16-20% and 1-2%                                            | below (greedy does not play for Lore)                   |
| S4 tier IV 20-50%                                                  | not measurable (no Great Works)                            | n/a                                                     |
| R3 margin: median <= 10%, blowouts <= 10%                          | median margin 16-25%, blowouts 32-53%                      | **fail** with greedy; random-ish play has high variance |
| I1 neighbour Renown share median >= 10%                            | 28-32%                                                     | pass (see caveat, §1)                                   |
| I3 Spring hold rate >= 50% with one Watch                          | holding Spring Raid 34-40% for greedy towns                | report; below 50%                                       |
| K1 greedy vs random: >= 83% at 3 seats, >= 3x fair at 5            | 53.9% (1.6x) at 3; 36.4% (1.8x) at 5                       | **fail**: the bot is weak, or skill matters little      |
| K2 levels differ by >= 1.5x                                        | only two levels exist                                      | n/a yet                                                 |

## 1-3. Tables

### 1. Equal greedy bots (level 1)

| seats | violations | picks/game | score mean | spread mean | winning score p95 | win seat 0..n-1 (fair 1/n)       | max dev. from fair |
| ----- | ---------- | ---------- | ---------- | ----------- | ----------------- | -------------------------------- | ------------------ |
| 3     | 0          | 60.0       | 24.1       | 17.3        | 46.0              | 33 / 34 / 33                     | 0.5 pts            |
| 4     | 0          | 80.0       | 21.5       | 20.4        | 44.0              | 23 / 27 / 24 / 26                | 1.7 pts            |
| 5     | 0          | 100.0      | 21.8       | 21.6        | 45.0              | 19 / 23 / 18 / 20 / 20           | 3.3 pts            |
| 6     | 0          | 120.0      | 20.9       | 22.1        | 43.0              | 16 / 16 / 18 / 17 / 16 / 17      | 0.9 pts            |
| 7     | 0          | 140.0      | 20.1       | 23.6        | 43.0              | 15 / 13 / 14 / 13 / 14 / 15 / 14 | 1.0 pts            |

| seats | win score median | runner-up median | margin median % | blowouts (>=1.3x) | winner mean by category (town / great work / raids / lore / honours / purse) |
| ----- | ---------------- | ---------------- | --------------- | ----------------- | ---------------------------------------------------------------------------- |
| 3     | 32.0             | 23.0             | 25.0            | 53.1%             | 14.9 / 0.0 / 5.1 / 3.7 / 7.1 / 2.4                                           |
| 4     | 31.0             | 24.0             | 22.2            | 48.3%             | 15.9 / 0.0 / 4.8 / 3.4 / 6.2 / 1.9                                           |
| 5     | 33.0             | 26.0             | 18.8            | 37.7%             | 17.6 / 0.0 / 4.4 / 3.7 / 5.3 / 2.4                                           |
| 6     | 32.0             | 26.0             | 16.1            | 32.7%             | 17.0 / 0.0 / 4.5 / 4.0 / 5.0 / 2.2                                           |
| 7     | 32.0             | 26.0             | 16.7            | 32.4%             | 16.9 / 0.0 / 4.9 / 3.8 / 4.7 / 2.5                                           |

Winner's largest category (S1; target: none > 55%, at least 4 categories >= 10%):

| seats | town  | greatWork | raids | lore | honours | purse |
| ----- | ----- | --------- | ----- | ---- | ------- | ----- |
| 3     | 82.0% | 0.0%      | 8.0%  | 2.8% | 6.9%    | 0.3%  |
| 4     | 85.7% | 0.0%      | 6.6%  | 2.1% | 5.6%    | 0.0%  |
| 5     | 89.7% | 0.0%      | 4.2%  | 2.9% | 2.8%    | 0.4%  |
| 6     | 86.9% | 0.0%      | 4.9%  | 4.2% | 3.5%    | 0.5%  |
| 7     | 86.8% | 0.0%      | 5.7%  | 4.5% | 2.4%    | 0.6%  |

Interaction, Lore, Raids, trade (per town unless noted):

| seats | neighbour Renown share median (I1 target >= 10%) | Lore run >= 3 (S3 target >= 25%) | run >= 5 (5-15%) | tier IV (S4) | held Spring / Summer / Autumn / Winter (I3) | sales per game | sales from bank (seller out) | builds per town | Spend share Spring..Winter (P3) |
| ----- | ------------------------------------------------ | -------------------------------- | ---------------- | ------------ | ------------------------------------------- | -------------- | ---------------------------- | --------------- | ------------------------------- |
| 3     | 31.7%                                            | 19.5%                            | 1.6%             | 0.0%         | 37.2% / 48.0% / 36.2% / 36.5%               | 23.2           | 7.3                          | 13.5            | 38.6% / 24.1% / 23.8% / 42.8%   |
| 4     | 28.7%                                            | 16.4%                            | 0.9%             | 0.0%         | 39.7% / 38.1% / 29.4% / 31.6%               | 26.8           | 7.6                          | 12.5            | 38.4% / 31.9% / 33.9% / 45.2%   |
| 5     | 30.4%                                            | 18.2%                            | 1.6%             | 0.0%         | 34.4% / 36.4% / 25.4% / 30.0%               | 33.7           | 9.0                          | 13.1            | 35.3% / 29.9% / 31.2% / 41.6%   |
| 6     | 28.1%                                            | 20.3%                            | 1.8%             | 0.0%         | 36.8% / 38.4% / 24.6% / 27.8%               | 38.4           | 10.3                         | 12.8            | 37.0% / 31.6% / 32.7% / 43.4%   |
| 7     | 29.4%                                            | 17.3%                            | 1.4%             | 0.0%         | 38.0% / 37.6% / 30.2% / 32.3%               | 44.7           | 12.3                         | 12.7            | 35.8% / 34.6% / 32.5% / 42.9%   |

### 2. Greedy vs random (K1; target: >= 83% at 3 seats, >= 3x fair = 60% at 5 seats)

| seats | greedy win share | fair  | ratio | random win share per seat |
| ----- | ---------------- | ----- | ----- | ------------------------- |
| 3     | 53.9%            | 33.3% | 1.62x | 23.1%                     |
| 4     | 45.5%            | 25.0% | 1.82x | 18.2%                     |
| 5     | 36.4%            | 20.0% | 1.82x | 15.9%                     |
| 6     | 32.3%            | 16.7% | 1.94x | 13.5%                     |
| 7     | 30.6%            | 14.3% | 2.14x | 11.6%                     |

(greedy holds one seat per game, rotating, so its win share is wins per game it played.)

### 3. Specialist strategies (S2; target: each wins fair x 0.6-1.5)

| seats                     | greedy        | focus-holding | focus-hall    | focus-market | focus-watch   | focus-lore    |
| ------------------------- | ------------- | ------------- | ------------- | ------------ | ------------- | ------------- |
| 3 (20 rosters x 50 games) | 79.7% (2.39x) | 13.0% (0.39x) | 63.6% (1.91x) | 7.2% (0.22x) | 26.0% (0.78x) | 10.5% (0.32x) |
| 4 (15 rosters x 67 games) | 72.8% (2.91x) | 3.4% (0.14x)  | 50.9% (2.04x) | 4.2% (0.17x) | 15.1% (0.60x) | 3.6% (0.14x)  |
| 5 (6 rosters x 167 games) | 69.9% (3.49x) | 2.5% (0.13x)  | 37.7% (1.88x) | 1.7% (0.08x) | 6.5% (0.32x)  | 1.8% (0.09x)  |
| 6 (1 roster x 1000 games) | 55.9% (3.35x) | 1.7% (0.10x)  | 35.4% (2.12x) | 1.7% (0.10x) | 4.7% (0.28x)  | 0.6% (0.04x)  |
| 7 (1 roster x 1000 games) | 46.3% (3.24x) | 1.5% (0.10x)  | 36.0% (2.52x) | 2.2% (0.15x) | 3.8% (0.27x)  | 1.2% (0.08x)  |

Cell = win share per seat held, and that share as a multiple of fair (1/seats).

## 4. Findings, in order of how much they matter

1. **Buildings (Town) decide nearly every game.** The winner's largest category is Town in 82-90%
   of games; a winner's mean is about 15-18 Renown from Town, 5 from Raids (Valour), 4 from Lore,
   5-7 from Honours, 2 from the purse. Lore and Honours rarely carry a win. Likely causes:
   printed Renown on Halls is cheap relative to Lore runs (a run of 3 needs three specific ranks)
   and to Honours (5 Renown, winner-take-all). Design: Lore and Landmark payoffs, Honour sizes.
   _Confounder:_ greedy builds the cheapest scoring card and does not plan runs or Honours, so it
   under-uses Lore/Honours; a Lore-planning bot could change this. Not tested.
2. **Hall focus beats everything but the general bot.** Hall specialists win 1.9-2.5x fair; Holding,
   Market and Lore specialists win 0.04-0.39x. Focus bots build only their kind and Spend the
   rest, so single-kind economies are starved by design of the test; the clean reading is only
   "Hall-only is viable, the others are not as single plans". The general greedy bot wins most,
   which says a mixed plan beats any single kind. Design: if Holding/Market/Lore should be
   viable plans, they need to be playable alongside Halls (they are mostly support kinds today).
3. **Neighbour dependence is high** (28-32% of Renown). Sales to neighbours (23-45 per game, 7-12
   of them unfilled and bought from the bank instead), Tolls and bounty coins, and `scoreBeat`
   count here. Caveat: I count sale coins as if each coin were scored at 4 per Renown
   (R12.2g) even though coins are mostly spent on Builds, so this **overstates** Renown that
   truly comes from neighbours. Treat as an upper bound.
4. **Blowouts are common with greedy bots** (53% at 3 seats down to 32% at 7). Winner median 32
   vs runner-up 23-26. Mean spread between best and worst town is 17 (3 seats) to 24 (7 seats)
   Renown. Part is bot variance (greedy is not adaptive); part may be snowball. Needs the R1
   snapshots to separate.
5. **Raids** held by 25-48% of greedy towns per Season (best in Summer, worst in Autumn). Greedy
   does not build Guard on purpose, so low hold rates say little; they do say Raid strength is
   not trivially met. Plundering matters (Valour is the second-largest category).
6. **Spend share** is 24-45% of picks: highest in Spring (35-39%) and Winter (42-45%), lowest in
   Summer/Autumn (24-35%). P3's target (<= 25% Spend in Spring-Autumn) is **missed in Spring
   and, at 4+ seats, Summer and Autumn**; Winter is report-only. Greedy Spends when nothing it
   can afford scores, so this is partly the bot, partly cost levels in Spring.
7. **Seat fairness is good** (F1 pass), including 3-7 seats, even though Summer/Winter pass right
   and Spring/Autumn left. Win-share by seat stays within noise.
8. **Greedy is only 1.6-2.1x fair against random bots.** K1 is missed by a wide margin. Either the
   greedy valuation is too crude (likely: it ignores Honours, Lore runs, Guard timing and what
   to Spend), or luck dominates. A stronger bot (B-levels 2 and 3) is needed to tell. Until then
   "the game rewards skill" is **not established**.

## 5. What would change these numbers

- Engine: Great Work choice and 2-seat variant (then rerun F2/F3/S4 and 2-seat rows).
- Design D7 re-tune: apply it to the engine defaults as well (see §0 mismatch).
- Bots: level 2 (planning for Lore/Honours/Guard) will move S1, S3 and K1.
