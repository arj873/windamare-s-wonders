# Balance and pace targets for bot sims (card R5)

Owner: research lane. Status: first pass (2026-10-29). Audience: bots lane (B1 headless sim and
balance report), design (tuning `RULES.md` R16 and `CARDS.md`), qa.

**Method and honesty.** Web search for public statistics on drafting games. Public data is thin:
BGA does not publish per-wonder or per-strategy stats for base 7 Wonders (players have asked; see
sources), so most hard numbers below come from **7 Wonders Duel** (2 players). Section 2's targets
are **our proposals**, derived from those numbers plus general balance practice; none is an
industry standard. Every rule id refers to `docs/RULES.md` on main `7f5704f`.

---

## 1. What the public data says

| Metric                                      | Value                                                                                                                                                | Source and quality                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Duel first-player win rate, human           | 53.6% (245 of 457 untied games); ~55% (BGA forum estimate)                                                                                           | Sevenee community analysis; BGA forum. Medium                       |
| Duel first-player win rate, AI self-play    | 66.8% (10k games)                                                                                                                                    | ZeusAI paper, IEEE CoG 2024 (arXiv 2406.00741). Good, but not human |
| Duel strongest AI vs top humans             | 26 of 38 wins (68.4%)                                                                                                                                | Same paper. Good, small sample                                      |
| Duel victory type, good BGA players         | civilian 58.0% / science 25.6% / military 16.4%                                                                                                      | Quoted in the ZeusAI paper. Good                                    |
| Duel victory type, AI self-play             | civilian 61.7% / science 21.4% / military 16.9%                                                                                                      | Same paper                                                          |
| Duel victory type, community sample         | civilian 51% (237) / science 24% (113) / military 23% (107) of 463 games                                                                             | Sevenee. Medium                                                     |
| Duel wonder win rates                       | most-picked wonder 47.8%; best standard wonder 54.1%; best expansion wonder 59.3%                                                                    | Sevenee; BGA "7WD in Numbers". Medium                               |
| Duel: opening wonder draft decides the game | One player claims > 90% win for a lopsided wonder pick (opinion, no data)                                                                            | BGA report #62942. Weak                                             |
| 7 Wonders typical winning score             | ~55-65; one 5-player BGA table: winner 61, last 39                                                                                                   | Informal guides; a single BGA table. Weak                           |
| 7 Wonders points per card to win            | ~3 per card needed; military ~3.6 per card                                                                                                           | Strategy guide. Weak                                                |
| 7 Wonders base per-board win rates          | not published; players request it                                                                                                                    | BGA forum thread, report #13572                                     |
| Live score demand                           | BGA players asked for coins and guilds in the live total (#24999); a popular userscript (Pythia) forecasts every player's total and flags the leader | BGA report; Greasy Fork script. Good signal for UX                  |
| Physical length                             | 7 Wonders ~30 min (30-50 per reviews); Duel 2-3 games an hour                                                                                        | Publisher; reviews                                                  |
| Online fast modes                           | colonist.io 1v1 ~15 min; Rush < 10 min                                                                                                               | colonist.io FAQ                                                     |
| General balance practice                    | Go-first win rate 47-53% called ideal for tournament games; chess ~55% for white. Faction win share 1/N baseline, flag ≥ 60%                         | Practitioner blogs. Weak, but consistent                            |
| Skill signal in AI playtests                | Strong bot beats weak bot by > 50 points of win rate = strategic depth; < 20 points = may feel random                                                | AI playtesting write-up; thresholds not validated                   |

**Reading.** A well-loved shipped design (Duel) lives with a ~4-point first-player edge,
wonder win rates spanning roughly 48% to 59%, and a dominant victory type winning about
55% of games with the other two at roughly 20% each. Those are the "good enough" bands to aim
inside, not outside.

---

## 2. Proposed targets for B1 (our proposals)

`N` = seats. "Fair" = 1/N. Each row says what to log, the target, and why.

### 2.1 Fairness

| ID  | Metric (what the sim logs)                          | Target                                         | Why                                                                                                                 |
| --- | --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| F1  | Win share by seat index, equal bots, each N = 2..7  | every seat within fair ± 3 points (2p: ≤ 53%)  | Duel's human edge is ~+4; R4.7 says seat order never changes results, so a gap means a bug or pass-direction effect |
| F2  | Win share by Great Work when chosen, equal bots     | each within fair × 0.75-1.25; flag any outside | Duel's wonders span ~48-59% at 2 seats (about -2 to +9 points); at 4 seats ×0.75-1.25 is 19-31%                     |
| F3  | Choice rate by Great Work when offered (greedy bot) | none > 80% or < 20% of the times it's offered  | A Great Work everyone always takes (or never takes) is a dead choice (R2.5)                                         |
| F4  | Win share by Honour set held                        | no single Honour's holder wins > 2× fair       | Honours are public goals; one shouldn't decide the game                                                             |

### 2.2 Strategy diversity

| ID  | Metric                                                                                                            | Target                                                                       | Why                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S1  | Winner's largest Renown **source** (8: Hall, Landmark, other card, Great Work, Valour, Lore, Honours, Purse; §6)  | no source is the largest for > 55% of winners; at least 4 sources ≥ 10% each | Duel's split (~55 / 25 / 20) is the reference band            |
| S1g | Winner's largest R12.2 **group** (the six on the score sheet)                                                     | report; flag if one group is the largest for > 75% of winners (§6)           | What players see; catches "Town is the whole game"            |
| S2  | Specialist bots (one per plan: Holdings→Halls, Lore, Watch/Valour, Markets/Caravans, Great Work) in a mixed field | each wins fair × 0.6-1.5                                                     | No plan should be dead (R4 originality review D4) or dominant |
| S3  | Share of towns with a Lore run ≥ 3; ≥ 5                                                                           | ≥ 25%; 5-15%                                                                 | CARDS.md §9.4: runs of 5-6 "reachable but not routine"        |
| S4  | Share of towns completing Great Work tier IV                                                                      | 20-50%                                                                       | CARDS.md §9.2: raise thresholds if most finish                |
| S5  | Build rate of each card when seen; Spend rate                                                                     | flag cards built < 5% or > 60% of the times they are picked                  | Finds dominated cards (e.g. Spring Halls) and auto-picks      |

### 2.3 Snowball and comeback

| ID  | Metric                                                                 | Target                                                          | Why                                                                                       |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R1  | Win share of the Renown-estimate leader after Spring / Summer / Autumn | Spring ≤ 2× fair; Summer ≤ 2.5× fair; Autumn ≤ 75%              | Stocked goods compound (R1.3, R7.2); late leaders should win more, early leaders not much |
| R2  | Win share of the goods-and-coins leader after Spring                   | ≤ 2× fair                                                       | The runaway-engine risk in review D5                                                      |
| R3  | Winner-to-runner-up margin, as % of winning score                      | median ≤ 10%; blowouts (winner ≥ 1.3× runner-up) ≤ 10% of games | Close games feel good; no public data, so this is a pure proposal                         |
| R4  | Winning score and full score distribution per N                        | report only (no target yet)                                     | Sets the scale for live estimates and Honour/Treasury sizes                               |

### 2.4 Interaction

| ID  | Metric                                                                                                                 | Target                                                        | Why                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| I1  | Share of each town's Renown that depends on neighbours (bounty coins, Caravan coins, `scoreBeat`), converted at R12.2g | median ≥ 10%                                                  | Review D1 estimates < 10% today; genre's #1 complaint is weak interaction |
| I2  | Hate-draft rate: picks where a bot Spends a card its neighbour's best plan needed (bot-tagged)                         | report only                                                   | Shows whether denial exists at all with pair picks                        |
| I3  | Raids: hold rate per Season; towns plundered per Raid                                                                  | report; flag Spring hold rate < 50% for a town with one Watch | Review D2 found Spring/Summer strengths above a one-Watch town's Guard    |

### 2.5 Pace and decisions (sim proxies; humans still need playtests)

| ID  | Metric                                                                | Target                                                     | Why                                                                           |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| P1  | Legal picks per turn (distinct card pairs × roles), by turn of Season | report; flag if median on turn 1 > 80                      | Review D3: up to 108 combinations; AP proxy                                   |
| P2  | Payment plans per legal Build (R6.3, R15.7)                           | median ≤ 3                                                 | Sub-choices slow humans; defaults should usually be right                     |
| P3  | Share of Spend+Spend picks, by Season                                 | Spring-Autumn ≤ 25%; Winter report only                    | Too many means "dead turns" (review D6)                                       |
| P4  | Bot think time per pick, normal and hard levels                       | p95 ≤ 300 ms on one core                                   | Bots must not become the slowest picker online; keeps reveal snappy           |
| P5  | Human game length (playtest, not sim)                                 | 1 human + bots ≤ 15 min; 5-7 humans, Normal clock ≤ 25 min | colonist.io 1v1 ~15 min; R18 estimates 22-24 min; RESEARCH.md §3.6 band 20-30 |

### 2.6 Skill signal and bot levels

| ID  | Metric                                                | Target                                                      | Why                                                                   |
| --- | ----------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| K1  | Heuristic bot's win share vs random bots, N = 3 and 5 | ≥ fair + 50 points at 3 seats (≥ 83%); ≥ 3× fair at 5 seats | Below this the game may feel random                                   |
| K2  | Win share in a mixed table: hard vs normal vs easy    | each level beats the one below by ≥ 1.5× its share          | Reviewers punish one AI level (R2 survey); levels must feel different |

---

## 3. How many games

Win-share confidence (95%) is about ±2 × sqrt(p(1-p)/n).

| Question                       | p    | Games                                                                  | ± points |
| ------------------------------ | ---- | ---------------------------------------------------------------------- | -------- |
| Seat balance at 3 seats (F1)   | 0.33 | 2,000                                                                  | ±2.1     |
| Seat balance at 3 seats (F1)   | 0.33 | 10,000                                                                 | ±0.9     |
| Seat balance at 7 seats (F1)   | 0.14 | 10,000                                                                 | ±0.7     |
| One Great Work at 4 seats (F2) | 0.25 | ~2,900 appearances (10k games; each is chosen in ~29% of 4-seat games) | ±1.6     |

Suggestion: 2,000 games per seat count for a quick report, 10,000 before a tuning decision. On
this shared machine, run them under `nice -n 19`, one sim at a time (AGENTS.md).

---

## 4. Report shape (suggestion for B1)

One table per seat count with F1-F4, S1-S5, R1-R4, I1-I3, P1-P4, K1-K2; a red/green column
against the targets above; and the seed range used, so design can rerun a flagged case.

---

## 5. First sim report vs these targets (research read of B3)

Read: `docs/BALANCE.md` on `agent/bots` `4503209` (1000 games a row, greedy level 1 and random
bots, no Great Works, no 2-seat variant). Numbers below are bots' unless marked "our arithmetic".

### 5.1 What each miss means

| Target         | B3 result                                    | Mostly a sign of...       | Research read                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 seats       | max 0.5-3.3 points off fair                  | Rules: pass               | Real pass: lockstep (R4.8) and alternating passes leave no seat edge at 3-7 seats                                                                                                                                                                                                                                                                                                 |
| S1 categories  | Town is the winner's largest in 82-90%       | **Metric**, then cards    | **Our metric problem.** R12.2a folds Halls, Landmarks and every card `score…` into one "Town" group (design did this on our O12 advice), and Great Works score 0 until the engine has them. A six-group sheet will always show Town on top. Fix S1 to measure finer **sources**: Hall Renown, Landmark scores, other card Renown, Great Work, Valour, Lore, Honours, Purse (§5.2) |
| S3 Lore        | runs ≥ 3 in 16-20%; ≥ 5 in 1-2%              | Cards (moderate evidence) | Three signals agree: our arithmetic (originality-review §6: ~3 Renown a Build vs 4-9 for late Halls), Lore focus bots at 0.04-0.32× fair, and greedy's low run rate. Each is weak alone (bots don't plan runs). Together they say Lore is under-paid                                                                                                                              |
| S2 strategies  | Hall focus 1.9-2.5×; others 0.04-0.39×       | **Test design**           | Our §2.2 named plans as engine + payoff ("Holdings → Halls", "Watch / Valour"). B3's focus bots build only one kind and Spend the rest, so Holdings, Markets and Watches (support kinds that make goods, coins or Guard, not Renown) can never win alone. Re-run with the plans in §5.2. The Hall result itself is a real signal: Halls are a complete plan on their own          |
| R3 margins     | median 16-25%; blowouts 32-53%               | Bot + scale               | Scores are small (winner median 31-33), so a 9-point gap is 25%. A full Great Work track is worth about 13-21 Renown (CARDS §7), so Great Works will raise scores and shrink percentages. Judge R3 again after Great Works and bot level 2; also report the margin in Renown                                                                                                      |
| I1 neighbours  | 28-32% (bots: an upper bound)                | **Metric**                | Counting every sale coin received as Renown overstates it; purchases also save the buyer coins. Use a net measure (§5.2). Even so, design's 15-30% estimate and B3 agree that neighbour stakes are no longer thin: D1 is no longer the top risk                                                                                                                                   |
| I3 Spring Raid | 34-40% hold Spring                           | Bot                       | Greedy never builds Guard on purpose. The data property (one Watch a Season holds all but Fen Thieves) is tested in content; re-check with a Guard-aware bot                                                                                                                                                                                                                      |
| P3 Spends      | 24-45% of picks are Spends; Spring 35-39%    | Bot + Spring costs        | Greedy Spends when nothing affordable scores. Spring Holdings now cost 3c of 5 starting coins, so turn 2 is often a Spend. Worth a per-turn breakdown before tuning                                                                                                                                                                                                               |
| K1 skill       | greedy 54% at 3 seats (1.6× fair); 1.8× at 5 | Bot (not yet a game read) | Level 1 ignores Honours, Lore runs and Guard. The test that matters: if level 2 is still under ~70% at 3 seats vs random, luck dominates and that is a design problem (deal variance, Honour ties)                                                                                                                                                                                |

### 5.2 Metric changes we propose (for bots' next report)

1. **S1 by source, not by score-sheet group.** Same eight sources as in §5.1. Keep the six-group
   sheet for players; the metric is for tuning.
2. **I1 as net transfer.** Per town: coins received from neighbours (sales, bounty, Tolls) minus
   coins paid to neighbours, ÷ 4 (R12.2f), plus `scoreBeat` Renown, as a share of the town's
   Renown. Also report the share of Builds that needed a purchase, and the share of purchases
   filled from the bank because the seller ran out (B3: 7-12 bank-filled next to 23-45 sales a game; 27-31% if the first is part of the second).
3. **S2 as two-step plans**, each with a payoff: Holdings → Halls, Markets → Purse + Merchant /
   Treasurer Honours, Watch → Valour + Hall of Banners / Warden, Lore → Lore run + Sage, and Halls
   only. Compare each with fair × 0.6-1.5.
4. **R3 in Renown as well as %,** and only after Great Works.
5. **Score scale (R4).** Winner median 31-33 without Great Works. Design's note in RULES.md
   (neighbour share) assumed a winning score of 60-65; at 32, the 5-Renown Honour is about 15% of
   a winning score and a Lore run of 6 (18) would be over half. Re-check Honour and Purse sizes
   once Great Works land.

### 5.3 What this means for design (research view)

- **Lore payoff** is the one card-level change with support from both the arithmetic and the
  sim. Options: raise the run table (e.g. 1, 3, 6, 10, 15, 21), give every Lore card 1 printed
  Renown, or cut Lore costs further. Measure with a run-planning bot before choosing.
- **Halls as a complete plan** is fine (it's the genre's civic-points backbone), but if nothing
  else is a complete plan, the game narrows to "build Halls". S2 with two-step plans will show
  whether Holdings → Halls and Watch → Valour actually compete.
- **Trade often doesn't move goods.** Up to about 30% of purchases are filled from the bank at the
  market price (R6.7) because the seller ran out. That is cheaper than the bank's 5, so a bare
  "a neighbour held it at turn start" acts as a discount. Not an originality issue; a balance
  one to watch alongside N1 (forced sales).
- **Tunables mismatch** (bots §0): the content and engine use different keys, so a re-tune in
  `src/content` won't reach the sim. Engine and design should share one table before D7.

## 6. What S1 means (answer to balance, card R9)

Balance asked (`docs/BALANCE.md`, "S1 definition, for research"): is S1 the winner's top source
of the 8, or the top R12.2 group, where Town is 3 sources added together? Level 2 passes by
sources on the package (Great Work 39-46%) and fails by group (Town 58-76%).

**Answer: S1 is by the 8 sources.** That is what §5.2 item 1 already proposed; the §2.2 row
still said "R12.2 a-g" and is now fixed. The group view stays as a report line, S1g, with a
looser flag.

Why sources:

1. **S1 asks whether winners win in different ways.** A way to win is a plan: Halls, Landmark
   conditions, the Great Work, Raids, Lore, money. The Town group adds three of those (Hall
   Renown, Landmark scores, other card scores), so it measures the score sheet's layout, not
   the plans. With 3 of about 6 live sources inside it, Town tops an evenly spread field about
   half the time with no plan dominating. A 55% cap on that sum is far stricter than the same
   cap on one source.
2. **The 55% was set for single categories.** It came from Duel's victory split. That
   reference is loose either way, since Duel's 55% "civilian" victory is itself a sum of point
   sources. The cap makes sense for one source and no sense for a sum of three.
3. **The breadth clause already guards against a narrow game.** "At least 4 sources ≥ 10% of
   winners" fails when winners lean on two sources, which is balance's actual worry at level 2
   (Town and Great Work).

Why keep a group line (S1g, flag over 75%): players see the six groups, not the 8 sources. If
three in four winners take most of their Renown from Town, the game reads as "build scoring
cards" whatever the split inside. 75% is a judgement number, not derived; it means "at least
a quarter of winners win mainly elsewhere".

Caveat: sources are a proxy for plans, not plans. A Watch plan's Watchers' Cairn Renown counts
as Landmark, not Valour. S2 (specialist plans) is the direct test.

**What this means for L3** (balance's question, research view):

- **S1's cap does not need L3.** Level 2 passes it on the l2-final-2 package (top source Great
  Work at 37-47% in BALANCE.md's l2-final-2 row; Hall no longer top). S1g: Town at 58-76% sits
  under the 75% flag except at the top of that range.
- **The breadth clause decides.** At level 2 before the package, 2-4 sources reached 10% of
  winners. If the package gives 4 or more at every seat count, S1 passes in full and L3 isn't
  needed for S1. If it gives 2-3, S1 still fails, and the fix is the one balance names: a third
  group that pays a level-2 player (Raids, Lore or Purse). That is a design or bots question
  (bots: level 2 can't see a Lore run's future value), not a tunables one.
- Ask for one more number from balance: sources at ≥ 10% of level-2 winners on l2-final-2, per
  seat count.

## Sources

- [ZeusAI: Learning to Play 7 Wonders Duel Without Human Supervision (arXiv 2406.00741)](https://arxiv.org/html/2406.00741v1)
- [Sevenee: statistical analysis of 450+ Duel games](https://sevenee.mattle.online/lobby/forum/topic/mvxoybDcABT6Q9Kyn/statistical-analysis-on-7-wonders-duel-components-and-strategies-with-450-game-plays)
- [BGA forum: 7WD in Numbers](https://forum.boardgamearena.com/viewtopic.php?t=25369),
  [BGA forum: first player advantage in Duel](https://forum.boardgamearena.com/viewtopic.php?t=17661&start=10),
  [BGA Duel tips](http://en.boardgamearena.com/doc/Tips_sevenwondersduel)
- [BGA report #62942 (Duel wonder pick)](https://uk.boardgamearena.com/bug?id=62942),
  [BGA report #13572 (per-city stats request)](https://ca.boardgamearena.com/bug?id=13572),
  [BGA forum: stats on starting boards](https://forum.boardgamearena.com/viewtopic.php?p=44231),
  [BGA report #24999 (live point total request)](https://ca.boardgamearena.com/bug?id=24999)
- [BGA Pythia 7 Wonders helper (Greasy Fork)](https://greasyfork.org/en/scripts/406492-bga-pythia)
- [BGA 7 Wonders table example](https://en.boardgamearena.com/table?table=98915946)
- 7 Wonders scores: [brain-games.com](https://brain-games.com/blogs/board-game-explorer/7-wonders-balancing-science-military-and-culture),
  [Cardboard Mountain strategy](https://cardboardmountain.com/7-wonders-strategy/)
- [colonist.io Rush FAQ](https://blog.colonist.io/colonist-rush-faq/)
- Balance practice: [Goonhammer 40k meta review (go-first band)](https://www.goonhammer.com/the-march-2021-40k-meta-review),
  [MEQA balance framework](https://neutronium-landing.pages.dev/blog/meqa-game-balance-framework),
  [AI playtesting write-up](https://bennycheung.github.io/ai-playtesting-when-your-game-tests-itself)
- Our docs: `docs/RULES.md`, `docs/design/CARDS.md`, `docs/design/research/originality-review.md`,
  `docs/design/research/online-ux.md`
