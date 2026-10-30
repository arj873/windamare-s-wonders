# Balance report: Windamere on main after D9b, bot levels 1 and 2 (cards L1, L2)

Owner: balance lane. Run 2026-10-30 on main `4fb5baf`: design D9b (`868c469`, -1 good on 21
Summer/Autumn cards) on top of D9 (Great Work thresholds 4/9/15/22, Valour 2/3/4/5), engine E4
(D8 price ladder from the tunables), bots B5 (levels 2 and 3). Targets:
`docs/design/research/balance-targets.md`. Full generated tables: `docs/balance/baseline/`
(`4fb5baf-level1.md`, `4fb5baf-level2.md`, `4fb5baf-k2.md`). Experiments and how to run them:
`docs/balance/README.md`.

1000 seeded games per row, seeds 1-1000, 2-7 seats. Standard error of a win share: about 1.6
points (2 seats) to 1.1 (7 seats).

## 0. Read this first

- **Every number is bot play, not human play, and every number says its bot level.**
  - **Level 1** (greedy): builds the cheapest legal card that still scores, else Spends the
    biggest band. It never reads a Renown amount.
  - **Level 2**: rates every legal pick by its score delta one pick ahead (Renown now, economy,
    Lore runs, Great Work tiers, Guard, Honours, trade; `src/bots/windamereEval.ts`). It beats
    level 1 in 98% of 2-seat games (section 0.2), so it is the better stand-in for a competent
    player. Level 1 is closer to a careless new player.
  - Both choose the Great Work by the same fixed rating rule (printed Renown), so the same towns
    hold the same Great Works at both levels.
- **The level changes the verdict** on S1, S3, S4, P3, R3, K1 and F2 (0.1). Tuning against
  level 1 alone would be tuning the game for a bot that loses 98% of the time.
- Score sources: research's 8 (Hall, Landmark, other card, Great Work, Valour, Lore, Honours,
  Purse) and R12.2's six groups for S1 as written, where **Town** = Hall + Landmark + other card.
- **Not measured**: F3, F4, I2, R1/R2 snowball, P1/P2, P4, S5. The Wolf Gate is never chosen by
  the rating rule (0 towns), so F2 has no data for it; bots is fixing that (B5b).

## 0.1 Verdict against the targets, level 1 and level 2

| Target                                                 | Level 1 (greedy)                                                                                                | Level 2                                                                                                                                                                              | Status                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Robustness: no crash, illegal action or stall          | 0 violations                                                                                                    | 0 violations                                                                                                                                                                         | pass                                      |
| F1 seat fairness, fair +/- 3 pts                       | max dev 1.5-2.4 pts; 2 seats 48/52                                                                              | max dev 0.7-2.1 pts; 2 seats 48/52                                                                                                                                                   | pass                                      |
| F2 each Great Work fair x 0.75-1.25                    | 5 of 13 out: **Spire 1.67x**, Harvest Wheel 1.26x; Fourfold Gate 0.63x, Mere Bridge 0.64x, Hall of Echoes 0.67x | 8 of 13 out: **Tide Mill 1.84x**, Salt Stair 1.31x, Coinwell 1.27x, Ice Lantern 1.27x; Fourfold Gate 0.40x, Wind Organ 0.59x, Ring of Oaths 0.64x, Hall of Echoes 0.64x; Spire 0.82x | **fail** at both, with different outliers |
| S1 no source > 55% of winners (8 sources)              | Great Work 33-47%                                                                                               | **Hall 49-69%** (2 / 4 / 6 seats over)                                                                                                                                               | L1 pass, **L2 fail**                      |
| S1 by R12.2 group                                      | Town 36-56% (5-6 seats 55-56%)                                                                                  | **Town 76-88%**                                                                                                                                                                      | L1 on the line, **L2 fail**               |
| S1 at least 4 sources >= 10% of winners                | 3 (Great Work, Hall, Valour); 4 at 2 seats                                                                      | 2-4 (Hall, Great Work; Purse at 3-7, Landmark at 5-7)                                                                                                                                | fail / nearly                             |
| S2 each level-1 specialist fair x 0.6-1.5              | Holding 0.99-1.62x, Hall 0.95-1.22x; Watch 0.47-1.09x; **Market 0.35-0.79x, Lore 0.14-0.39x**                   | not run (specialists are level-1 bots)                                                                                                                                               | **fail** (Market, Lore)                   |
| S3 Lore run >= 3 in >= 25%; >= 5 in 5-15%              | 22.6-27.9%; 2.0-3.3%                                                                                            | **4.0-8.5%; 0.4-1.6%**                                                                                                                                                               | L1 nearly, **L2 fail**                    |
| S4 tier IV in 20-50% of towns                          | 23-34% (Spire 72%)                                                                                              | **56-71%** (Spire 98%)                                                                                                                                                               | L1 pass, **L2 fail**                      |
| R3 median margin <= 10%, blowouts <= 10%               | margin 10.0-26.9%; blowouts 57 / 39 / 28 / 23 / 20 / 17%                                                        | margin 8.7-20.3%; blowouts 43 / 25 / 17 / 14 / 9.7 / 8.7%                                                                                                                            | L1 fail; L2 passes at 6-7 seats           |
| I1 net neighbour Renown share median >= 10%            | 1.4-2.0%                                                                                                        | 0.6-1.9%                                                                                                                                                                             | **fail** (structural)                     |
| I3 Spring hold rate >= 50%                             | 40-45%                                                                                                          | 47-52%                                                                                                                                                                               | L1 below, L2 about                        |
| P3 Spend share <= 25% Spring-Autumn                    | Spring 19-22%; Summer 17-30%; Autumn 18-28% (3 seats passes)                                                    | Spring 22-25%; **Summer 37-44%; Autumn 48-56%**                                                                                                                                      | fail, much worse at L2                    |
| K1 bot vs random >= 83% at 3 seats, >= 3x at 5         | 50.0% (1.50x) at 3; 28.9% (1.44x) at 5                                                                          | **99.4% at 3; 97.7% (4.88x) at 5**                                                                                                                                                   | L1 fail, **L2 pass**                      |
| K2 each level beats the one below by >= 1.5x its share | level 2 / level 1: 52-642x (level 1 wins 0.1-1.9% of seats)                                                     | level 3 / level 2: 1.00-1.23x                                                                                                                                                        | L2 over L1 pass; **L3 over L2 fail**      |
| R4 winning score (report)                              | median 42-48, p95 56-60                                                                                         | median 66-68, p95 80-82                                                                                                                                                              | report                                    |

## 0.2 K2: levels 1, 2 and 3 at one table

| seats | level 1 (greedy) | level 2       | level 3       | level 2 / level 1 | level 3 / level 2 |
| ----- | ---------------- | ------------- | ------------- | ----------------- | ----------------- |
| 2     | 1.9% (0.04x)     | 98.1% (1.96x) | -             | 51.63x            | -                 |
| 3     | 0.2% (0.01x)     | 49.8% (1.49x) | 50.0% (1.50x) | 249.00x           | 1.00x             |
| 4     | 0.4% (0.01x)     | 47.5% (1.90x) | 51.7% (2.07x) | 135.86x           | 1.09x             |
| 5     | 0.1% (0.00x)     | 32.1% (1.60x) | 35.7% (1.78x) | 642.00x           | 1.11x             |
| 6     | 0.1% (0.01x)     | 24.6% (1.48x) | 25.3% (1.52x) | 246.50x           | 1.02x             |
| 7     | 0.1% (0.00x)     | 22.4% (1.57x) | 27.5% (1.93x) | 336.00x           | 1.23x             |

Cell = win share per seat held (multiple of fair 1/seats); seat i holds level (i mod 3) + 1.

## 4. Findings, in order of how much they matter

1. **The game rewards skill, at bot level.** Level 2 beats random in 96-100% of games (K1
   passes) and beats greedy level 1 in 98% of 2-seat games. The L1 report's "skill not
   established" is withdrawn: it measured a weak bot. Level 3's denial adds little over level 2
   (1.00-1.23x): hate-drafting is worth little, or the bot does it badly.
2. **Under level 2, Halls dominate**: Hall is the winner's largest source in 49-69% of games and
   Town (R12.2a) in 76-88%. This is the kickoff's "Town 82-90%" problem again, seen by a bot that
   reads Renown. Level 1 hid it because it never chose cards for their Renown.
3. **Under level 2, Lore is nearly dead**: run >= 3 in 4-9% of towns, Lore 2% of all Renown.
   Level 1's 23-28% came from building Lore cards because they were cheap, not because they pay.
4. **Under level 2, Great Works finish too easily** (tier IV 56-71%; S4 20-50%) and Summer/Autumn
   Spends are 37-56% (P3 <= 25%). Level 2 Spends on purpose (labour toward tiers, coins: Purse is
   11-16% of its Renown), so P3's "dead turn" reading may not apply; a human who plans may do the
   same.
5. **Great Work balance depends on who plays it**: the Spire is 1.67x at level 1 and 0.82x at
   level 2; the Tide Mill 1.11x and 1.84x. A Great Work fix tuned on level 1 can be wrong at
   level 2 (L2 below).
6. **Blowouts shrink with better play**: level 2 has 9-43% (passes at 6-7 seats) against level
   1's 17-57%, so part of the level-1 blowout rate is bot noise. 2-3 seats stay far over at both.
7. **Neighbour interaction is 1-2% of Renown at both levels** (I1 >= 10%): structural, a question
   for the human (design CARDS.md §11).
8. **Seat fairness passes at both levels** (max 2.4 pts).

## 5. Experiments (L2)

Method: one overlay per experiment (`docs/balance/experiments/`), the same seeds 1-1000 as the
baseline, section 1 (equal bots) at 2-7 seats, 1000 games per row, at the level named. Full
before/after tables: `docs/balance/results.md`. Noise: an overlay that changes no bot decision
replays the same games (its delta is exact); any other one sends games down new paths, and a
delta under about 3 points on a share is noise. A Great Work's ratio has a standard error of about
sqrt(3.5 / towns that held it): 0.03-0.04 for common ones, 0.11 at 300 holders.

### 5.1 On main `4fb5baf` (D9b): the base for every number in this section

Level 1 rows compare with the level-1 baseline, level 2 rows with the level-2 baseline (both in
`docs/balance/baseline/`). "-" = not run at that level.

| Experiment        | Change                                                                                                  | Level 1                                                                                                                                                                                                                                                      | Level 2                                                                                                                                                                                                                                                                           | Verdict                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| market-cheaper-2  | neighbour price 1/3/4/5 -> **1/2/2/3**                                                                  | **P3 passes at 3-7 seats** (Summer 12-24%, Autumn 11-22%; 2 seats Summer 27%); blowouts 57/39/28/23/20/17 -> 57/33/23/22/16/13%; +0.3-0.6 Builds per town                                                                                                    | **blowouts 43/25/17/14/10/9 -> 38/14/10/7/5/5% (R3 passes at 4-7 seats)**; margin median 7.6-18.5%; Summer/Autumn Spends -3..-9 pts (still 31-47%); F2 8 -> 5 out; Hall/Town top +2..+5 pts                                                                                       | **win at both levels** (R3, P3)              |
| halls-down        | every Hall -1 printed Renown (14 cards, 2-9 -> 1-8)                                                     | winner's top R12.2 group 36-56% (Town) -> 37-45% (Town, or Great Work at 2/4/7 seats): S1 by group passes; by 8 sources Great Work 37-51%                                                                                                                    | **Hall top 49-69% -> 29-42% (S1 by 8 sources passes)**; Town 76-88% -> 59-75% (still fails); tier IV +4-5 pts; Autumn Spends +3-4 pts; winning score -4                                                                                                                           | **strong partial** (S1)                      |
| lore-cheaper      | the 5 Lore cuts D9b did not make (Rune Stone, Almanac House, Ferryman's Charts, Sealed Archive, Orrery) | **Lore run >= 3 23-28% -> 28-34% (S3 passes)**, >= 5 -> 3-6%; tier IV at 3 seats 23% -> 19%                                                                                                                                                                  | Lore run >= 3 4-8% -> 6-11%; nothing else moves                                                                                                                                                                                                                                   | win at level 1, small at level 2             |
| lore-runs-steeper | Lore run scores 1/3/6/10/14/18 -> 1/3/7/11/16/20 (design's D9 try)                                      | -                                                                                                                                                                                                                                                            | Lore run >= 3 4-8% -> 7-10%                                                                                                                                                                                                                                                       | fail                                         |
| spend-richer      | every Spend band +1 coin                                                                                | Summer/Autumn Spends -1..-4 pts (13-27% / 15-25%); blowouts -0..-4; +0.5 Builds per town                                                                                                                                                                     | -                                                                                                                                                                                                                                                                                 | partial; market-cheaper-2 does more          |
| bank-cheaper      | bank 6 -> 5 coins a good                                                                                | **Spring Spends +9..+15 pts**; bank goods +1.3-1.8 per town, coins per Build up, Builds -0.7..-1.2 per town                                                                                                                                                  | -                                                                                                                                                                                                                                                                                 | **fail** (mechanism below)                   |
| gw-f2b            | from 5.2                                                                                                | F2 5 -> 1 of 13 out; Town top 54-60% (S1 fails at 3/5/6 seats); tier IV at 3 seats 18%                                                                                                                                                                       | F2 8 -> 7 out: **Spire 0.82x -> 0.68x**, Tide Mill still 1.81x                                                                                                                                                                                                                    | **withdrawn**: fixes level 1, breaks level 2 |
| gw-f2             | from 5.2                                                                                                | F2 1 of 13 out (0.88-1.37x); same side effects as gw-f2b                                                                                                                                                                                                     | -                                                                                                                                                                                                                                                                                 | withdrawn with gw-f2b (same Spire cut)       |
| gw-both           | tier Renown of 8 Great Works, only where both levels agree (exact list in 5.3)                          | F2 5 -> 3 of 13 out (0.71-1.53x: Spire 1.53x, Harvest Wheel 1.31x at n=396, Mere Bridge 0.71x); Spends +1..+2 pts                                                                                                                                            | F2 8 -> 6 out (0.62-1.78x); the Tide Mill stays 1.78x after tier IV 8 -> 6, so its level-2 edge is its Perk; Hall top -1..-5 pts                                                                                                                                                  | partial at both levels, harms neither        |
| l2-final          | market-cheaper-2 + lore-cheaper + gw-both                                                               | S3 passes (28-32%); P3 passes at 3-6 seats; F2 1 of 13 out (Spire 1.63x); blowouts -1..-4; **tier IV at 3 seats 16%**                                                                                                                                        | blowouts 34/14/11/8/6/4% (R3 passes at 5-7 seats), margin <= 10% at 4-7; F2 5 out; Lore run >= 3 6-11%; Town 79-89% (no better)                                                                                                                                                   | strong; S1 needs halls-down                  |
| **l2-final-2**    | **l2-final + halls-down**                                                                               | **S1 passes** (top group 37-46%; Great Work by 8 sources 37-55%); **S3 passes** (28-32%); **P3 passes at 3-6 seats** (2 seats 30/25%, 7 seats 27/23%); F2 2 of 13 out (Spire 1.67x, Mere Bridge 0.75x); blowouts 15-56% (-0..-3); **tier IV at 3 seats 16%** | **S1 by 8 sources passes** (Great Work top 37-47%, Hall no longer top); Town 76-88% -> 58-76%; **blowouts 34/15/10/9/5/6% (R3 passes at 4-7 seats)**, margin <= 10% at 4-7; F2 8 -> 4 out (0.70-1.46x); Lore run >= 3 7-12%; tier IV 61-76%; Summer/Autumn Spends 34-42% / 47-51% | **best package: handed to design (5.3)**     |

**bank-cheaper, why it backfires (level 1)**: greedy ranks Builds by printed cost and never
prices the payment. A cheaper bank makes Builds legal that need several bank goods; greedy takes
them, pays more coins per Build, runs dry and Spends later. A human would not, so this is a bot
finding as much as a rules finding.

**Level 1 and level 2 disagree on the Great Works.** The Spire is 1.67x at level 1 and 0.82x at
level 2; the Tide Mill 1.11x and 1.84x. Cutting the Spire for level 1 (gw-f2b) pushed it out of
band at level 2. Any Great Work change should be checked at both levels.

### 5.2 Earlier, on main `ccb126f` (D9, level 1 only): superseded, kept for the record

D9b and E4 changed the game under these runs; read them as directions, not numbers.

| Experiment            | Change                                                       | Result on D9, level 1                                                                                               | Verdict then                    |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| honours-flatter       | Honours 5 sole / 2 tied -> 3 / 1                             | Honours part of the winner's margin halves (4.7 -> 2.3 at 2 seats) but blowouts only -1..-3 pts (exact: same games) | fail                            |
| lore-cheaper (9 cuts) | one good or coin off 9 Lore cards (D9b later made 4 of them) | Lore run >= 3 17-22% -> 29-41%; tier IV 42-47% -> 23-35%                                                            | win (S3)                        |
| market-cheaper        | neighbour price 1/3/4/5 -> 1/2/3/4                           | Summer Spends -3..-5 pts, Autumn -1..-2; blowouts -1..-5                                                            | partial                         |
| market-cheaper-2      | -> 1/2/2/3                                                   | Summer 16-30%, Autumn 20-32%; blowouts 14-54% (-0..-5)                                                              | partial, better                 |
| bank-cheaper          | bank 6 -> 5                                                  | Spring Spends 19-22% -> 30-34%                                                                                      | fail (backfires)                |
| spire-renown-down     | Spire tier Renown 2/4/5/8 -> 2/3/4/5                         | the Spire itself 1.55x -> 0.94x, but 5 of 13 out (others untouched); Town at 5 seats 62%                            | fail                            |
| spire-thresholds-up   | Spire thresholds 6/12/19/27 -> 7/14/22/31                    | Spire 1.55x -> 1.30x; 5 of 13 out                                                                                   | fail                            |
| gw-f2                 | spire-renown-down + weak three +1 on tiers I-III             | F2 4 -> 2 of 13 out, 0.88-1.27x                                                                                     | near                            |
| gw-f2b                | gw-f2 + Tide Mill IV 8 -> 7, Harvest Wheel IV 5 -> 4         | F2 0 of 13 out, 0.89-1.21x; Town at 5 seats 58%                                                                     | win (F2), withdrawn later (5.1) |
| l2-combo              | lore-cheaper + gw-f2 + market-cheaper                        | F2 0 out, Lore run >= 3 30-41%, blowouts -0..-6, but tier IV 18% at 3 seats                                         | partial (S4)                    |

### 5.3 Hand-off to design: the l2-final-2 package (measured together, on `4fb5baf`)

Exact value changes, in design's terms (`src/content/windamere`). Measured as one package at
levels 1 and 2 (5.1); each part was also measured alone.

1. **Neighbour price** (`TUNABLES.marketPrice`): spring 1, summer 3 -> **2**, autumn 4 -> **2**,
   winter 5 -> **3**. The biggest single lever found: level-2 blowouts to 5-38%, level-1 P3.
2. **Every Hall -1 printed Renown** (14 cards): Moot Stone 2 -> 1, Ferry Steps 2 -> 1, Moot Hall
   4 -> 3, Boathouse 5 -> 4, Hearth Hall 3 -> 2, Wend Council House 6 -> 5, Players' Green 4 -> 3,
   Clock House 4 -> 3, Bell Tower 4 -> 3, High Hall of Windamere 9 -> 8, Ice Fair Hall 8 -> 7, Snowlight Hall
   5 -> 4, Long Barrow 4 -> 3, Mere Gate Hall 5 -> 4. Ends Hall as level 2's top source; the
   counterweight to 1, which alone lifts Halls.
3. **Lore costs** (the 5 cuts D9b did not make): Rune Stone 1P 1c -> **1P**; Almanac House 1W 2c
   -> **1W 1c**; Ferryman's Charts 1R 1W -> **1W**; Sealed Archive 1S 2W 1H -> **1S 1W 1H**;
   Orrery 1P 2W 2H -> **1P 1W 2H**.
4. **Great Work tier Renown** (gw-both; tiers I/II/III/IV, other tier effects unchanged):
   Fourfold Gate 1/2/6/5 -> **2/3/7/6**; Hall of Echoes 1/2/4/4 -> **2/3/5/4**; Wind Organ
   2/2/6/4 -> **2/3/7/4**; Mere Bridge 1/2/4/8 -> **2/2/5/8**; Ring of Oaths 1/2/4/8 ->
   **1/3/5/8**; Tide Mill 1/2/4/8 -> **1/2/4/6**; Salt Stair 1/2/4/6 -> **1/2/4/5**; Stonewright's
   Spire 2/4/5/8 -> **2/4/5/7**.

**Known cost of the package**: level-1 tier IV at 3 seats falls to 16% (S4 floor 20%), while
level-2 tier IV rises to 61-76% (ceiling 50%). No threshold change fixes both levels; see 5.4.

**Not recommended** (tried, failed or withdrawn): gw-f2b / gw-f2 (break level 2), bank 6 -> 5
(backfires), Lore run scores 1/3/7/11/16/20 (no effect at either level), Honours 3/1 (no effect
on blowouts), Spire-only cuts.

### 5.4 Still open after the package

1. **S4 pulls two ways.** Level 2 finishes too many Great Works (61-76%), level 1 too few at 3
   seats (16%). Design must pick which player the thresholds are for; the evidence (0.2) says
   level 2 is the competent one, which argues for raising thresholds, not lowering them.
2. **Lore at level 2** stays at run >= 3 in 7-12% whatever the costs or scores. Either Lore
   needs a structural change or the one-ply level 2 cannot see a run's future value (bots
   question; a level that plans 2-3 picks ahead would tell).
3. **Town at level 2** is still the winner's top group in 58-76% (Halls plus Landmarks).
4. **Summer/Autumn Spends at level 2** stay at 34-51%. Level 2 Spends on purpose; whether P3
   should apply to deliberate Spends is a question for research.
5. **2-3 seat blowouts** stay at 15-56% at both levels.
6. **I1 neighbour share** ~1-2% at both levels: structural, a question for the human.
7. **K2**: level 3 over level 2 is 1.00-1.23x; denial adds little (bots).
