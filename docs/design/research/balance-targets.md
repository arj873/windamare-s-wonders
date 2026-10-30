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

| ID  | Metric                                                                                                            | Target                                                                            | Why                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S1  | Winner's largest Renown category (R12.2 a-g)                                                                      | no category is the largest for > 55% of winners; at least 4 categories ≥ 10% each | Duel's split (~55 / 25 / 20) is the reference band            |
| S2  | Specialist bots (one per plan: Holdings→Halls, Lore, Watch/Valour, Markets/Caravans, Great Work) in a mixed field | each wins fair × 0.6-1.5                                                          | No plan should be dead (R4 originality review D4) or dominant |
| S3  | Share of towns with a Lore run ≥ 3; ≥ 5                                                                           | ≥ 25%; 5-15%                                                                      | CARDS.md §9.4: runs of 5-6 "reachable but not routine"        |
| S4  | Share of towns completing Great Work tier IV                                                                      | 20-50%                                                                            | CARDS.md §9.2: raise thresholds if most finish                |
| S5  | Build rate of each card when seen; Spend rate                                                                     | flag cards built < 5% or > 60% of the times they are picked                       | Finds dominated cards (e.g. Spring Halls) and auto-picks      |

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
