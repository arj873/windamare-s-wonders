# Balance report: Windamere at bot levels 1 and 2 (cards L1-L4)

**Current state: section 8 (L4, main `86c28af`, D9c + D10b + L3 + D10c as shipped).** Sections
0-7 are the history that led there, each on the main it names.

Owner: balance lane. Run 2026-10-30 on main `4fb5baf`: design D9b (`868c469`, -1 good on 21
Summer/Autumn cards) on top of D9 (Great Work thresholds 4/9/15/22, Valour 2/3/4/5), engine E4
(D8 price ladder from the tunables), bots B5 (levels 2 and 3). Targets:
`docs/design/research/balance-targets.md`. Full generated tables: `docs/balance/baseline/`
(`4fb5baf-level1.md`, `4fb5baf-level2.md`, `4fb5baf-k2.md`). Experiments and how to run them:
`docs/balance/README.md`.

1000 seeded games per row, seeds 1-1000, 2-7 seats. Standard error of a win share: about 1.6
points (2 seats) to 1.1 (7 seats).

**Bases.** Sections 0-5 are on main `4fb5baf` (the L2 work). Section 6 reruns the baselines and
the hand-off package on main `9c09f9e` (design D10a: 4 rivalry cards; bots B5b: the Wolf Gate is
rated), the base for design's D9c. Section 7 (L3) is on main `0bf1efe` (D11, E7, B6) with the
package on top, i.e. the expected D9c. Section 8 (L4) is main `86c28af` with nothing on top.

**S1 changed meaning in section 8.** Research R9: S1 is the winner's top of the 8 sources (cap
55%, at least 4 sources reaching 10% of winners); the R12.2 group view is S1g, a report line
flagged above 75%. Sections 0-7 used "S1 by group" with a 55% cap; read those as S1g.

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
| market-cheaper-2  | neighbour price 1/3/4/5 -> **1/2/2/3**                                                                  | **P3 passes at 3-7 seats** (Summer 12-24%, Autumn 11-22%; 2 seats Summer 27%); blowouts 57/39/28/23/20/17 -> 57/33/23/22/16/13%; +0.3-0.6 Builds per town                                                                                                    | **blowouts 43/25/17/14/10/9 -> 38/14/10/7/5/5% (passes at 5-7 seats; 4 seats 10.1%)**; margin median 7.6-18.5%; Summer/Autumn Spends -3..-9 pts (still 31-47%); F2 8 -> 5 out; Hall/Town top +2..+5 pts                                                                           | **win at both levels** (R3, P3)              |
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

D9b and E4 changed the game under these runs; read them as directions, not numbers. Their
before/after tables: `docs/balance/results-d9.md` (frozen).

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
6. **I1 neighbour share** ~1-2% at both levels: structural, a question for the human. (D10a's
   rivalry cards then moved it: section 6.)
7. **K2**: level 3 over level 2 is 1.00-1.23x; denial adds little (bots).

## 6. Recheck on main `9c09f9e` (D10a rivalry cards, B5b Wolf Gate rating): base for D9c

Same seeds and script. Tables: `docs/balance/baseline/9c09f9e-level1.md` and `-level2.md`.

### 6.1 What D10a and B5b changed (baseline `4fb5baf` -> `9c09f9e`)

| Target                                | Level 1                                                                                              | Level 2                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| I1 net neighbour share median (>=10%) | 1.4-2.0% -> **6-12%** (3 seats passes)                                                               | 0.6-1.9% -> **4-12%** (3 seats passes)                         |
| S1 Town as winner's top group         | 36-56% -> **44-73%** (fails at 3-7 seats)                                                            | 76-88% -> **88-92%**                                           |
| S1 top of 8 sources                   | Great Work 30-45%                                                                                    | Hall 43-68% (2 seats 68%, 4 seats 55%)                         |
| S4 tier IV (20-50%)                   | 23-34%, unchanged                                                                                    | 56-71% -> 50-66%                                               |
| S3 Lore run >= 3 (>=25%)              | 23-27%                                                                                               | 6-10%                                                          |
| R3 blowouts (<=10%)                   | 16-58%                                                                                               | 9-42% (passes at 6-7 seats)                                    |
| P3 Summer / Autumn Spends (<=25%)     | 18-30% / 18-27%                                                                                      | 33-43% / 45-53%                                                |
| F2 (each 0.75-1.25x)                  | 3 of 13 out: Spire 1.53x, Fourfold Gate 0.67x, Mere Bridge 0.72x                                     | 7 of 13 out, 0.42-1.89x (Tide Mill 1.89x, Fourfold Gate 0.42x) |
| K1 vs random                          | 1.91x at 3 seats, 1.86x at 5                                                                         | 99.5% at 3 seats, 4.88x at 5 (pass)                            |
| S2 level-1 specialists (0.6-1.5x)     | all lower: Holding 0.63-1.04x, Hall 0.67-0.99x, Watch 0.61-1.20x, Market 0.47-0.83x, Lore 0.09-0.44x | -                                                              |

The rivalry cards did what D10a aimed at: interaction is now 4-12% of Renown (it was 1-2%). Their
`scoreBeat` Renown counts as card Renown, so it lands in the Town group, and Town as the winner's
top group rose at both levels. B5b's rating now picks the Wolf Gate (2586 towns; 0.76x at level
1, 0.67x at level 2); the Hall of Echoes is now never picked by the rule.

### 6.2 The hand-off package (l2-final-2) on `9c09f9e`

| Target                      | Level 1: baseline -> package                                                        | Level 2: baseline -> package                                                  |
| --------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| S1 winner's top R12.2 group | Town 44-73% -> **top group 40-63%** (Town 63/57/59% at 3/4/5 seats, still over 55%) | Town 88-92% -> **74-84%** (still fails)                                       |
| S1 top of 8 sources         | Great Work 30-45% -> 37-52% (Valour top at 3 seats)                                 | **Hall 43-68% -> Great Work 37-45%** (pass)                                   |
| R3 blowouts                 | 58/39/31/26/20/16% -> 54/34/29/23/20/18%                                            | **42/24/14/11/9/10% -> 34/16/10/7/5/5%** (passes at 5-7 seats; 4 seats 10.3%) |
| R3 margin median            | 10.9-27.3% -> 10.9-25.5%                                                            | 8.6-20.0% -> **7.1-17.4%** (passes at 4-7 seats)                              |
| S3 Lore run >= 3            | **23-27% -> 28-33%** (pass)                                                         | 6-10% -> 8-13%                                                                |
| P3 Summer / Autumn Spends   | **passes at 3-6 seats** (2 seats 31/25%, 7 seats 27/22%)                            | 33-43% / 45-53% -> 31-40% / 42-49%                                            |
| S4 tier IV                  | 23-34% -> 16-29% (**3 seats 16%**)                                                  | 50-66% -> 54-71%                                                              |
| F2                          | 3 of 13 -> 2 of 14 out (Spire 1.58x; Harvest Wheel 1.55x at n=113)                  | 7 of 13 -> 5 of 14 out, 0.74-1.42x                                            |
| I1                          | 6-12%, unchanged (13% at 3 seats)                                                   | 4-12%, unchanged                                                              |

**The package still does what it did on `4fb5baf`** at both levels, and nothing in D10a/B5b
undoes it. Two things changed: Town is now over 55% at level 1 too (3-5 seats, after the
package), so the Hall cut is no longer enough on its own; and the S4 conflict (level 1 at 3
seats 16%, level 2 54-71%) is unchanged. A next experiment would aim at the Town group without
hurting the rivalry gain (e.g. Landmark or rivalry Renown), measured at both levels.

## 7. L3: a Town lever that keeps D10a's rivalry gain (main `0bf1efe` + the package)

Base: main `0bf1efe` (D11 turn-1 costs, E7, B6) with the l2-final-2 package on top, i.e. what
D9c should ship. Every lever below extends that package (`"extends"` in the overlay) and is
compared with the package at the same level. **No lever touches `scoreBeat`**, so the rivalry
Renown is left as it is; the I1 column checks that the net neighbour share stays. Baselines:
`docs/balance/baseline/0bf1efe-level{1,2}.md`; tables: `docs/balance/results.md`.

Where Town comes from, package at level 2 (winner's mean Renown): Hall 10-13, Landmark 5-12
(rising with seats), other cards 3-7 (mostly rivalry), against Great Work 13-16 of ~65. At level
1 the three Town parts are 3.8-6.3 / 1.8-4.9 / 2.2-5.4, against Great Work 9-12.5.

At level 1 a Renown-only lever changes no bot decision, so its level-1 delta is exact (same
games); level 2 reads Renown and plays differently.

| Lever (on the package)                                             | Level 1: winner's top group (package: 37-62%, Town at 3-7 seats)                       | Level 2: Town (package: 70-84%)               | Side effects                                                                                       | I1            | Verdict                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------- | -------------------------- |
| l3-halls-2: Halls -2 in all (package -1, one more)                 | top group <= 54% everywhere (**passes**)                                               | 54-74% (-9..-16)                              | level 2: Great Work by 8 sources 57% / 56% at 2 / 4 seats; level-2 tier IV +2..+4                  | kept          | good                       |
| l3-landmarks-down: every Landmark score effect -1 except scoreBeat | 3 seats 58% (-4)                                                                       | 65-78% (-4..-10)                              | none seen                                                                                          | kept          | good, smaller              |
| l3-hall-landmarks: Wayfarers' Cross and The Long Table 2 -> 1      | about no change                                                                        | about no change                               | -                                                                                                  | kept          | fail                       |
| l3-gw-up: every Great Work tier III and IV +1                      | -4..-5                                                                                 | 59-78% (-5..-11)                              | **Great Work by 8 sources 51-63%** at both levels (fails at 6-7 seats L1, 2/4/7 seats L2)          | kept          | fail (trades one S1 miss)  |
| l3-valour-up: Valour 3/4/5/6                                       | 33-49% (**passes**)                                                                    | 63-81% (-2..-7)                               | **level 1: Valour is the top source at 3 seats (62%)**                                             | kept          | fail (Valour takes over)   |
| **l3-combo: l3-halls-2 + l3-landmarks-down**                       | **top group 40-49% everywhere (passes)**; Great Work by 8 sources 42-56% (7 seats 56%) | **45-65% (-16..-26)**; passes at 2-3 seats    | level 2: Great Work by 8 sources 56 / 59 / 56% at 2 / 4 / 7 seats; tier IV +2..+4; blowouts +0..+3 | kept (+0..+1) | **best: handed to design** |
| l3-combo-v: l3-combo + Valour 2/3/5/6                              | 36-43%                                                                                 | 55-65% at 3-7 seats (2 seats: Great Work top) | level 1: Valour top source at 3 seats 58%                                                          | kept          | no better than l3-combo    |

### 7.1 Hand-off to design (after D9c): l3-combo

On top of the D9c package (values below are from the current main, so they already include the
package's Hall -1):

1. **Halls -2 printed Renown from today's values** (never below 1): Moot Stone 2 -> 1, Ferry Steps
   2 -> 1, Moot Hall 4 -> 2, Boathouse 5 -> 3, Hearth Hall 3 -> 1, Wend Council House 6 -> 4,
   Players' Green 4 -> 2, Clock House 4 -> 2, Bell Tower 4 -> 2, High Hall of Windamere 9 -> 7,
   Ice Fair Hall 8 -> 6, Snowlight Hall 5 -> 3, Long Barrow 4 -> 2, Mere Gate Hall 5 -> 3. (If D9c
   already took the package's -1, this is one more -1 each, Moot Stone and Ferry Steps staying 1.)
2. **Every Landmark score effect -1 except `scoreBeat`**: Wayfarers' Cross 2 -> 1 per Season with
   a Hall; Mustering Stone 6 -> 5; Hall of Banners 6 -> 5; Keystone Arch 8 -> 7; Harvest Home 2 ->
   1 per Season with a Holding; The Long Table 2 -> 1 per Hall; Market Cross 8 -> 7; Watchers'
   Cairn 2 -> 1 per Season with a Watch; Ancestors' Walk 4 -> 3 per set. Unchanged: Winter Larder
   (already 1), The Victors' Oak and Pride of the Wend (`scoreBeat`, the rivalry).

What it does on the package: level 1, Town is no longer the winner's top group over 49% at any
seat count (S1 by group passes); level 2, Town falls from 70-84% to 45-65% (passes at 2-3 seats
only). The rivalry share holds (I1 equal or +1 point at every count, both levels).

**What it does not do, honestly**: level-2 Town stays over 55% at 4-7 seats, and as Town falls
the Great Work rises over 55% of winners (8 sources) at 2, 4 and 7 seats at level 2 and at 7
seats at level 1. Level-2 winners take their Renown from two groups (Town and Great Work; groups
reaching 10% of winners: 2-3 of 6, target 4), so cutting one lifts the other. S1 at level 2
needs a third group that pays a level-2 player: Raids, Lore or Purse. Valour helped level 2 a
little and took over level 1 (l3-valour-up); Lore does not move under level 2 at all (5.4). That
is a design question beyond tunables, and possibly a bots one (level 2 cannot see a Lore run's
future value).

**S1 definition, for research**: Town is three of the eight sources added together, so it beats
any single group easily. By 8 sources, level 2 passes S1 on the package (Great Work 39-46%);
by R12.2 group it fails. Which one the target means decides whether L3 is needed at all.
(Research answered in R9: by the 8 sources; section 8.)

## 8. L4: re-check on main `86c28af` (D9c, D10b, L3, D10c as shipped)

What shipped is not exactly what was measured: design kept the originality rules, so neighbour
prices are **1/1/1/3** (not 1/2/2/3: no price of 2), Great Work tiers have no plain 3 or 7 (e.g.
Spire tier IV 8 -> 6, not 7), and design's L3 values differ in the same way. D10b adds 4 cards
with the new neighbour types (Wend Fair, Commons of the Wend, Brokers' Arcade, Kinsfolk Hall);
D10c a second copy of each rivalry card at 6-7 seats. So this section measures main as it is, no
overlay. 1000 games per row, seeds 1-1000, 2-7 seats. Tables:
`docs/balance/baseline/86c28af-level1.md`, `-level2.md`, `-k2.md`.

### 8.1 Verdict, levels 1 and 2

| Target                                                  | Level 1 (greedy)                                                                              | Level 2                                                                                                                        | Status                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Robustness                                              | 0 violations                                                                                  | 0 violations                                                                                                                   | pass                                          |
| F1 seat fairness, fair +/- 3 pts                        | max dev 0.6-2.0 pts                                                                           | max dev 0.6-2.5 pts                                                                                                            | pass                                          |
| F2 each Great Work fair x 0.75-1.25                     | 2 of 14 out: **Spire 1.61x** (tier IV 63%, others 12-22%), Harvest Wheel 1.52x (n=113)        | 3 of 14 out: **Tide Mill 1.43x**, Coinwell 1.37x, Salt Stair 0.66x (n=175); Spire 0.76x, Fourfold 0.76x, Wind Organ 0.75x edge | fail at both, different outliers              |
| **S1** top source of 8 <= 55% (R9)                      | 33-49% (Great Work; Valour at 3 seats)                                                        | Great Work 43-57%: **over at 2 seats (57.3%) and 4 seats (55.6%)**                                                             | L1 pass, L2 fails at 2/4 seats                |
| **S1** sources >= 10% of winners, per seat count (>= 4) | 3 / 2 / 2 / 3 / 4 / 2 (2..7 seats)                                                            | **3 / 4 / 2 / 3 / 3 / 3** (2..7 seats)                                                                                         | **fail** (passes at 6 seats L1, 3 seats L2)   |
| S1g top R12.2 group, flag > 75% (R9)                    | Town <= 61% (2 seats: Great Work 36%)                                                         | Town 53 / 68 / 72 / **75 / 80 / 77%**                                                                                          | L1 fine; **L2 flagged at 5-7 seats**          |
| S2 level-1 specialists fair x 0.6-1.5                   | Watch 1.09-1.52x, Market 0.58-0.97x, Holding 0.36-0.85x, Lore 0.17-0.68x, **Hall 0.08-0.50x** | -                                                                                                                              | **fail** (Hall plan dead after two Hall cuts) |
| S3 Lore run >= 3 >= 25%; >= 5 in 5-15%                  | **26.5-32.7%** (pass); 3.1-4.3%                                                               | 10.4-15.4%; 1.4-4.1%                                                                                                           | L1 pass (run >= 5 short); L2 fail             |
| S4 tier IV in 20-50%                                    | 15-24%: under at 2 seats (18%) and 3 seats (15%)                                              | **57-72%**; Spire 95%                                                                                                          | fail both, opposite ways                      |
| R3 margin median <= 10%, blowouts <= 10%                | margin 11.3-25.8%; blowouts 56 / 37 / 30 / 24 / 20 / 18%                                      | margin 7.4-17.3% (passes at 4-7); **blowouts 34 / 17 / 12 / 8.6 / 6.2 / 5.7% (pass at 5-7)**                                   | L1 fail; L2 passes at 5-7 seats               |
| I1 net neighbour share median >= 10%, bots' metric      | 4.5-12.2%                                                                                     | 4.3-13.2%                                                                                                                      | under-counts D10b (8.4)                       |
| **I1 incl. D10b types** (mine, 8.4)                     | 7.8-16.7%: **passes at 3-7 seats**                                                            | **11.4-17.2%: passes at every count**                                                                                          | L2 pass; L1 pass except 2 seats               |
| I3 Spring hold >= 50%                                   | 40-50%                                                                                        | 48-50%                                                                                                                         | about                                         |
| P3 Spend share <= 25% Spring-Autumn                     | **passes at 3-7 seats** (Summer 12-23%, Autumn 13-23%); 2 seats Summer 40%, Autumn 31%        | Spring 26-27% (just over), Summer 32-39%, Autumn 41-47%                                                                        | L1 pass at 3-7; L2 fail                       |
| K1 vs random >= 83% at 3 seats, >= 3x at 5              | 74.9% (2.25x) at 3; 50.7% (2.54x) at 5                                                        | 99.6% at 3; 98.9% (4.95x) at 5                                                                                                 | L1 fail (closer), L2 pass                     |
| K2 each level >= 1.5x the one below                     | level 2 / level 1: 20-106x                                                                    | level 3 / level 2: 1.12-1.51x (5 seats 1.51x)                                                                                  | L2/L1 pass; L3/L2 fails except 5 seats        |
| R4 winning score (report)                               | median 39-47, p95 52-61                                                                       | median 59-67, p95 73-78                                                                                                        | report                                        |

### 8.2 Against what was measured for it (l3-combo on `0bf1efe`), not isolated

Main also gained D10b, D10c and design's own values, so these deltas mix causes:

- **Level-2 Town rose back**: S1g 55-65% -> 68-80% at 3-7 seats. Landmarks now carry it: a
  level-2 winner's Landmark Renown is 6.5-13.1 (Hall 4.8-8.0), and Landmark is level 2's top
  single source in 25-31% of games at 5-7 seats. Candidates: Commons of the Wend and Brokers'
  Arcade (both D10b Landmarks), D10c's second rivalry Landmark (The Victors' Oak) at 6-7 seats,
  design's L3 values.
- **Level-2 Summer/Autumn Spends fell** 2-9 points (1/1/1/3 is cheaper than the 1/2/2/3 I ran).
- **I1 at 6-7 seats rose** 4-5 points (D10c's second rivalry copies).
- Level-1 F2 better (4 -> 2 of 14 out); blowouts within 1-4 points.

### 8.3 For design's D12, in order of size

1. **Level-2 Town is flagged (S1g 75-80% at 5-7 seats) and level-2 Great Work is over the S1 cap
   at 2 and 4 seats.** Town at level 2 is now Landmarks more than Halls. Untested candidates: the
   D10b Landmarks' amounts, or one more Landmark step; any Town cut lifts the Great Work (seen in
   L3), so check S1 at 2 and 4 seats with it.
2. **S1 breadth fails at both levels** (2-4 sources reach 10% of winners). Level-2 winners take
   their top source from Great Work, Landmark and Purse; Lore is under 2%, Honours under 3%,
   Valour 4-15%. A third paying source for level 2 is still the open fix (L3 §7.1).
3. **The Hall-only plan is dead for level 1** (0.08-0.50x fair) and Holding-only is weak
   (0.36-0.85x): the cost of two Hall cuts and D9c. Fine if design accepts that a one-kind plan
   need not carry a weak player; otherwise it is S2's biggest miss.
4. **S4 pulls two ways**: level 2 57-72% (ceiling 50%), level 1 15-24% (floor 20% fails at 2-3
   seats). The Spire is the outlier at both levels (tier IV 63% / 95%).
5. **F2**: Spire 1.61x at level 1 but 0.76x at level 2; Tide Mill 1.43x and Coinwell 1.37x at
   level 2.
6. Level-2 P3 (Summer/Autumn 32-47%); level-1 K1 and K2 level 3 over level 2 are bots matters.

### 8.4 I1 and the D10b types

`src/bots/windamereMetrics.ts` (`nbrShare`, the "I1 neighbour share median" everywhere in this
report and in `results.md`) counts net neighbour coins and `scoreBeat` only. It misses D10b's
`scoreNeighbourMin`, `scoreSales` and `onBuildNeighbourMin` (bots is adding them). No shipped card
used those types before `86c28af`, so every I1 figure in sections 0-7 is complete for its main;
only section 8's bots-metric row under-counts. My "I1 incl. D10b" (`scripts/balance.ts`) adds the
two score types' Renown exactly, and Wend Fair's `onBuildNeighbourMin` coins from the Build log
at 4 coins per Renown (exact while no `buildBonus` applies to Markets, true on this main). The
D10b part is 1.0-1.8 Renown per town at level 1 and 1.8-4.3 at level 2; the coin part is 0.0-0.2.
