# Research: card drafting and tableau building (card R1)

Owner: research lane. Status: **R1 complete, pass 2** (2026-10-29). Per-game long notes live in
`docs/design/research/games.md`. Numbers marked _(unverified)_ come from memory or a single weak
source; treat them as approximate. Method: web search summaries of rulebooks, rules sites, reviews
and forum threads; no rulebook PDF was opened page by page, so exact numbers carry that caveat.

Purpose: give the design lane what it needs to write an **original** drafting game. Mechanics are
described in our own words. Section 4 lists which systems are 7 Wonders signatures (design must
replace them) and which are genre-common (fine to use). Section 5 turns the findings into
suggested starting ranges; design owns every final number.

---

## 1. TL;DR for design

1. **Simultaneous pick-and-pass is the genre's core value.** It keeps a 3 to 7 player game at
   roughly 30 minutes with near-zero downtime. Every successful game below protects it.
2. **Interaction is the genre's main complaint.** "Multiplayer solitaire" shows up in reviews of
   7 Wonders, It's a Wonderful World and Ark Nova. Neighbour-only interaction (7 Wonders, Paper
   Tales, Between Two Cities) keeps it bounded and readable; keep it, and make it visible.
3. **Two players is the weak count.** Base 7 Wonders needed a dummy-player variant that reviewers
   dislike; its publisher built a separate game (Duel) to fix it. Plan a dedicated 2-player mode
   from day one rather than a dummy.
4. **End-of-game-only scoring hides the leader.** That limits leader-bashing (good) but makes the
   game opaque to new players (bad). A browser game can show a live score estimate and a
   per-category breakdown, which physical games cannot.
5. **Watch super-linear set scoring and seat advantages.** Squared or triangular set scoring
   (7 Wonders science, Sushi Go dumplings) is the runaway path; asymmetric starting boards and
   first-player order are the other measurable imbalance (Duel: ~54% first-player win rate in
   human data). Our bots lane should measure both from the first sim.

---

## 2. Headline references (summary table)

Full notes per game: `research/games.md`.

| Game (year, designer)                  | Players           | Length     | Draft shape                                                                   | Plays per player                        | Interaction                                                            | Scoring                               |
| -------------------------------------- | ----------------- | ---------- | ----------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| 7 Wonders (2010, Bauza)                | 3-7 (2 via dummy) | ~30 min    | 3 rounds; deal 7, play 6, last card discarded; pass direction flips mid-game  | 18                                      | Neighbour trade, neighbour military, hate-draft                        | End only; ~7 categories summed        |
| 7 Wonders Duel (2015, Bauza & Cathala) | 2                 | ~30 min    | No passing; alternate taking uncovered cards from a 20-card layout per round  | ~30 (10 per round, extra turns vary it) | Tug-of-war military, trade price rises with rival's production, denial | 2 instant wins + points               |
| 7 Wonders Architects (2021, Bauza)     | 2-7               | ~25 min    | Turn-based; take 1 of 3 (left deck face-up, right deck face-up, centre blind) | Varies; ends when one wonder completes  | Shared decks with neighbours, periodic war                             | Points; first finished wonder ends it |
| Sushi Go! (2013, Walker-Harding)       | 2-5               | ~15 min    | 3 rounds; hand 10/9/8/7 for 2/3/4/5 players; play every card                  | 21-30                                   | Hate-draft, majorities                                                 | Per round + one end-game majority     |
| It's a Wonderful World (2019, Guérard) | 1-5               | ~45 min    | 4 rounds; draft 7 (2p: from 10), then build or recycle each card              | 28 drafted                              | Very low (draft + production majorities)                               | End only; card VP + multipliers       |
| Fairy Tale (2004, Nakamura)            | 2-5               | ~20 min    | 4 rounds; draft 5, play 3, discard 2                                          | 12                                      | Flip (disable) other players' cards, hate-draft                        | End only; sets and multipliers        |
| Among the Stars (2012, Bagiartakis)    | 2-4 (+ exp.)      | 30-60 min  | 4 rounds; deal 6, play all 6; each pick: build, or discard for credits        | 24                                      | Low; optional aggressive cards                                         | Mostly at placement; adjacency        |
| Seasons (2012, Bonnessée)              | 2-4               | ~60 min    | Pre-game draft of 9 cards split into 3 packets; main game drafts dice         | 9 power cards                           | Take-that cards, dice denial                                           | Crystals + card VP                    |
| Paper Tales (2017, Uesugi)             | 2-5               | ~30 min    | 4 rounds, simultaneous draft; units age and die                               | Varies                                  | War vs both neighbours each round                                      | Points each round                     |
| Ark Nova (2021, Wigge)                 | 1-4               | 90-150 min | Not a draft; open card display + 5 rotating action cards                      | Varies                                  | Low; shared display, races for bonuses                                 | Two converging tracks                 |

**Also relevant (shorter notes in `research/games.md`):**

| Game                              | Why it matters to us                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Between Two Cities (2015)         | Each player co-builds one city with each neighbour; your score is your **lower** city. Strongest anti-solitaire rule found. |
| Draftosaurus (2018)               | Each turn one player rolls a die that restricts where everyone else may place. Cheap, shared, visible interaction.          |
| Blood Rage (2015)                 | Deal 8, draft 6, last 2 discarded; 2p keeps 2 per pass; carry 1 card into the next round.                                   |
| Tides of Time (2015)              | 2-player-only draft with 18 cards; hate-draft heavy; newcomers lose to players who know the pool.                           |
| Res Arcana (2019)                 | Opening draft of a small personal deck; one critic says a good game is decided when the draft ends.                         |
| Terraforming Mars (draft variant) | Draft 4 per generation, then pay to keep; reported to add time; the digital port added it after player requests.            |
| 7 Wonders Leaders / Cities        | Leaders: a pre-game mini-draft of 4 leader cards. Cities: debt and cards that hurt others, to add interaction.              |

---

## 3. Patterns and pitfalls (numbers first)

### 3.1 Hand size and cards per round

| Game                   | Dealt per round        | Kept / played per round                 | Rounds     | Plays per game |
| ---------------------- | ---------------------- | --------------------------------------- | ---------- | -------------- |
| 7 Wonders              | 7                      | 6 (7th discarded)                       | 3          | 18             |
| Sushi Go!              | 7-10 (by player count) | all                                     | 3          | 21-30          |
| It's a Wonderful World | 7 (2p: 10, draft 7)    | 7; each built or recycled               | 4          | 28             |
| Fairy Tale             | 5                      | 3 (2 discarded)                         | 4          | 12             |
| Among the Stars        | 6                      | 6                                       | 4          | 24             |
| Blood Rage             | 8                      | 6 (2 discarded unseen); 2p keeps 2/pass | 3          | 18             |
| Draftosaurus           | 6 _(unverified)_       | 6                                       | 2          | 12             |
| Seasons (prelude)      | 9                      | 9                                       | 1 pre-game | 9              |

**Pattern.** Hands of 5 to 10, with 6 to 8 the sweet spot. Total plays per player cluster at
12 to 30. Four rounds is as common as three (It's a Wonderful World, Fairy Tale, Among the Stars,
Paper Tales all use four).

**Pitfall: the last card.** When every dealt card is played, the last pick is forced and
meaningless (Sushi Go, Among the Stars). 7 Wonders discards the 7th card; Blood Rage discards the
last 2; Fairy Tale discards 2 of 5. A design commentary on drafting calls removing the last
couple of picks good practice because they "are not real choices".

**Pitfall: hand size vs player count.** With N players and hand size H, you see a hand again
only if H > N. In 7 Wonders at 3 players (7 cards) each hand comes back to you twice, so you can
plan around it; at 7 players you never see a hand twice. Check hand size against both the
smallest and largest table: at low counts the draft is a memory game, at high counts pure tactics.

**Pitfall: player-count scaling of the deck.** 7 Wonders tags each card with the minimum player
count that uses it, so the deck grows by one hand per extra player. Sushi Go instead varies hand
size. Either works; the tag approach keeps hand size (and so the round length) constant.

### 3.2 Simultaneity and downtime

- All pick-and-pass games here resolve picks simultaneously; game length barely grows with
  player count (7 Wonders is ~30 min at 3 or 7). This is why the genre suits 6-7 players.
- The only wait is the slowest picker. Board Game Arena (BGA) adds a per-turn clock and lists
  simultaneous-play games (7 Wonders, Sushi Go, Draftosaurus) as a known pain for tournament time
  allocation. Implication for us: one shared turn timer, auto-pick on timeout.
- Turn-based models (Architects, Duel, Ark Nova) bring back downtime; Ark Nova reviews report
  4-hour first games at 4 players.
- Draft variants added to non-draft games (Terraforming Mars) are reported to lengthen play;
  keeping more cards per pass (pick 2) roughly halves the number of passes.
- End-of-game tallying is a downtime spike in physical play ("the game screeches to a halt as
  everyone counts"). Digital removes it; the scoring screen should be fast and readable.

### 3.3 Interaction

| Interaction kind                                    | Where                          | Reviewer reaction                                   |
| --------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| Hate-drafting (take a card to deny it)              | All pick-and-pass games        | Accepted; decisive at 2-3 players, weak at 5+       |
| Neighbour trade (pay a neighbour for a resource)    | 7 Wonders                      | Praised as smooth; scales to 7 players              |
| Neighbour combat each round                         | 7 Wonders, Paper Tales         | Praised; a reason to watch neighbours               |
| Co-owned scoring with each neighbour (lower counts) | Between Two Cities             | Praised; forces cooperation and competition at once |
| Shared constraint set by one player                 | Draftosaurus (placement die)   | Praised as "the star of the show"                   |
| Disable / flip opponents' cards                     | Fairy Tale, Seasons, 7W Cities | Divisive ("take that")                              |
| Tug-of-war track                                    | 7 Wonders Duel                 | Strongly praised; only works at 2                   |
| Production majorities                               | It's a Wonderful World         | Too weak; game still called solitaire               |

**Patterns.**

- Neighbour-only interaction keeps reading load constant as player count grows.
- Players want interaction they can _see_: a track moving, a token changing hands.
- Hate-drafting at 4+ players is usually a net loss for the hater: it spends a pick to hold back
  one rival and helps everyone else. Its burden falls on the leader's two neighbours. At 2 players
  it is the whole game (Tides of Time, Sushi Go 2p, 7W 2p).

### 3.4 Scoring spreads and runaway leaders

**Numbers found (all weak sources; treat as order-of-magnitude):**

| Metric                                   | Value                                 | Source quality                                  |
| ---------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| 7 Wonders typical winning score          | ~55-65 points; ~60 most cited         | Informal guides; one claims BGA data, no sample |
| 7 Wonders points per card play (derived) | ~3.3 (60 points / 18 plays)           | Our arithmetic on the above                     |
| Duel first-player win rate, human games  | 53.6% (245 of 457 untied); ~55% (BGA) | Community analyses, 2019-2021                   |
| Duel first-player win rate, AI self-play | 66.8% over 10k games                  | arXiv paper (2024), not human play              |
| Duel win type split, one top BGA player  | points 35%, science 25%, military 27% | One player; illustrative only                   |
| 7 Wonders base wonder-board win rates    | blog table shows some boards 70-80%   | No method given; **do not rely on it**          |

**Patterns.**

- **Many point categories, summed at the end** (7 Wonders has about seven) let several strategies
  compete and hide the leader. Downside: new players cannot tell who is winning.
- **Super-linear set scoring** (7 Wonders science, Sushi Go dumplings) is the main runaway risk.
  Base 7 Wonders relies on neighbours hate-drafting it; Duel turns it into an explicit
  instant-win race the opponent can see and block.
- **Majority with a penalty for last** (Sushi Go pudding: most gains, fewest loses) punishes
  ignoring a category without take-that.
- **Lower-of-two scoring** (Between Two Cities): you can't win by pumping one thing.
- **Decay** (Paper Tales: units die after two rounds) caps engine snowball.
- **Converging tracks** (Ark Nova): two scores move toward each other; game ends when they meet.
- **Floors:** discard-for-money (7 Wonders, Among the Stars), recycle-for-resource (It's a
  Wonderful World). Bad hands still do something.
- **Seat effects are real and measurable.** Even a well-tested design (Duel) shows a ~4-5 point
  first-player edge in human data. Asymmetric starting boards need per-board win-rate checks.

### 3.5 Two-player handling

| Approach                      | Example                                               | Verdict in reviews                                                                       |
| ----------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Dummy third player            | 7 Wonders 1st edition 2p                              | Disliked ("should never be played"); reportedly dropped in 2nd edition _(single source)_ |
| Separate dedicated game       | 7 Wonders Duel                                        | Very well received; tug-of-war and open, partly hidden layout                            |
| Bigger hands, same rules      | Sushi Go! (10), It's a Wonderful World (10, draft 7)  | Works; heavy hate-drafting                                                               |
| Keep 2 per pass               | Blood Rage 2p                                         | Standard fix; halves passes, keeps hands from being fully known                          |
| Each player builds two things | Between Two Cities 2p (two cities each, total counts) | Rules change; lower-of-two rule dropped                                                  |
| Designed for 2 only           | Tides of Time                                         | Liked; tiny pool, pure denial                                                            |

**Pattern.** In a 2-player pass you see every card your opponent gets, so drafts become pure
denial. The good fixes add hidden information (face-down layout, cards discarded unseen) or
change the take rate (keep 2 per pass).

### 3.6 Length targets

Sushi Go ~15 min, Draftosaurus ~15, Fairy Tale ~20, Architects ~25, 7 Wonders ~30, Duel ~30,
Paper Tales ~30, It's a Wonderful World ~45, Seasons ~60, Ark Nova 90-150. For a browser game
vs bots, **20-30 minutes** at 3-7 players is the competitive band; online, bots and auto-scoring
should land a 3-player game nearer 15-20.

### 3.7 Learnability

- 7 Wonders: icon-heavy; first game is rough; reviewers say it is quick once known.
- Seasons, Ark Nova, Res Arcana: long card text is the top complaint.
- Sushi Go: each card type has one tiny rule; the most teachable design in the genre.
- Tides of Time: players who know the card pool crush newcomers. A browser game can show the full
  pool and "cards still to come" on demand, which removes this gap.

---

## 4. 7 Wonders signatures vs genre-common (input for D3 / ORIGINALITY.md)

**Replace (distinctive to 7 Wonders, or tightly identified with it):**

| System                                                                                                                 | What it is                           | Why it's identifying                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Three ages, deal 7, play 6, discard the 7th, pass direction flipping in the middle age                                 | Exact draft cadence                  | The game's skeleton; copying the numbers copies the feel                 |
| Wonder board with 2-4 stages built by tucking a drafted card face-down                                                 | Personal monument fed by spent cards | The tuck-a-card build is the brand's best-known trick (Duel uses it too) |
| Seven named resources (4 raw, 3 manufactured) bought from neighbours at a fixed coin price, cut by specific cards      | Resource trade economy               | Price and structure are signature                                        |
| Military: compare shields with each neighbour at each age end, fixed win/loss tokens rising by age                     | Neighbour combat                     | Specific scoring table                                                   |
| Science: three symbols scored as count-squared per symbol plus a bonus per complete set                                | Set scoring                          | Most recognisable formula in the game                                    |
| Card colour families (brown, grey, blue, yellow, red, green, purple guilds)                                            | Card taxonomy                        | Colour-to-role map is the visual identity                                |
| Free building via named predecessor ("chain"), with the specific chain list                                            | Upgrade links                        | Genre idea is fine; their chain list and symbols are not                 |
| Discard a card for a fixed 3 coins                                                                                     | Floor action                         | Idea is common (Among the Stars also uses 3 credits); pick our own       |
| Coin-to-point conversion at the end at 7W's ratio                                                                      | Leftover money scoring               | Generic idea; the exact ratio is 7W's                                    |
| Guilds that score from what neighbours built, appearing only in the last age                                           | Neighbour-scoring cards              | Concept + timing is a base-game signature                                |
| Duel: rising bank price tied to rival's production; 9-step tug-of-war; 6-of-7 science instant win; pick 4 of 8 wonders | Duel's 2p systems                    | If we copy Duel for our 2p mode, we copy 7 Wonders                       |
| Architects: take from left deck / right deck / blind centre                                                            | Architects' take rule                | Recent and identified with the brand                                     |

**Use freely (genre-common):**

- Simultaneous secret pick, reveal, pass the rest; changing pass direction between rounds.
- Discarding the last card(s) of a hand.
- Tableau of played cards with persistent effects; cards that discount or unlock later cards.
- A personal monument/project to invest in (design our own build mechanic, not tuck-a-card).
- Neighbour-only interaction (trade, conflict, shared scoring) as in Paper Tales, Between Two Cities.
- Dual-use cards (build it or burn it for a resource), as in It's a Wonderful World.
- Majority bonuses, set collection, multipliers, end-of-game scoring.
- Card counts scaled to player count.
- Pre-game mini-draft (Seasons, Res Arcana, Leaders all do it).

---

## 5. Suggested starting ranges for design (research view; design decides)

These are ranges supported by the evidence above, chosen to sit **away from** 7 Wonders' exact
numbers where that costs nothing.

| Knob                      | Evidence-backed range                                                | Note                                                          |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Rounds                    | 3-4                                                                  | Four is common and moves us off 7W's three ages               |
| Hand dealt per round      | 6-8                                                                  | Deal 1-2 more than are played so the last pick is real        |
| Plays per player per game | 15-24                                                                | 18 is 7W; 20 (4 x 5) or 21 (3 x 7) are different and in range |
| Player counts             | 3-7 core, 2 as a dedicated mode                                      | Don't ship a dummy-player 2p                                  |
| 2p mode                   | keep 2 per pass, or open partly hidden row                           | Must not copy Duel's layout and tracks                        |
| Interaction               | neighbour-only, resolved every round, visible on screen              | Add one shared-with-neighbour stake (Between Two Cities idea) |
| Anti-runaway              | at most linear set scoring, or a cap; one decay or lower-of-two rule | Avoid squared formulas                                        |
| Seat balance target       | per-monument and per-seat win rate within ~±5 points of fair in sims | Duel's human first-player edge is ~+4                         |
| Length                    | 20-30 min at 5 players vs bots                                       | Shared turn timer + auto-pick                                 |
| Teachability              | one short rule per card family; full card pool viewable in game      | Sushi Go and Tides of Time lessons                            |

---

## Sources

Rules summaries and rulebooks:

- 7 Wonders: [BGA game panel](https://en.boardgamearena.com/gamepanel?game=sevenwonders),
  [Order of Gamers reference](https://www.orderofgamers.com/downloads/7Wonders_v2.pdf),
  [officialgamerules.org](https://officialgamerules.org/game-rules/7-wonders/),
  [Wikipedia (awards)](<https://en.wikipedia.org/wiki/7_Wonders_(board_game)>)
- 7 Wonders 2nd edition: [Meeples Corner changes](https://meeplescorner.co.uk/hu/blogs/shop-news/7-wonders-2nd-edition-changes),
  [Game Informer](https://gameinformer.com/2020/09/11/remastering-a-classic-7-wonders-2nd-edition),
  [Geeks Under Grace](https://www.geeksundergrace.com/tabletop/7-wonders-second-edition/)
- 7 Wonders Duel: [officialgamerules.org](https://officialgamerules.org/game-rules/7-wonders-duel-rules/),
  [BGA](https://en.boardgamearena.com/gamepanel?id=1266),
  [Bar Games 101](https://bargames101.com/7-wonders-duel/),
  [RulesPal FAQ](https://rulespal.com/7-wonders-duel/faq),
  [Asmodee help sheet](https://cdn.svc.asmodee.net/production-rprod/storage/downloads/games/7wonders-duel/en/7du-en01-helpsheet-15992105300NB8Y.pdf)
- 7 Wonders Architects: [officialgamerules.org](https://officialgamerules.org/game-rules/7-wonders-architects/),
  [RulesPal](https://rulespal.com/7-wonders-architects/rulebook)
- 7 Wonders Leaders / Cities: [I Slay the Dragon (Leaders)](https://islaythedragon.com/game-reviews/heads-of-state-a-review-of-7-wonders-leaders),
  [Frontline Gaming (Cities)](https://frontlinegaming.org/2024/05/22/board-games-review-7-wonders-cities-expansion/)
- Sushi Go!: [BGA help](https://en.doc.boardgamearena.com/Gamehelpsushigo),
  [rules PDF](https://www.world-of-board-games.com.sg/docs/Sushi-Go.pdf)
- It's a Wonderful World: [rulebook PDF](https://its-a-wonderful-world.game-park.com/rules-en.pdf),
  [UltraBoardGames](https://ultraboardgames.com/its-a-wonderful-world/game-rules.php),
  [BGA help](https://en.doc.boardgamearena.com/Gamehelpitsawonderfulworld)
- Fairy Tale: [Wikipedia](<https://en.wikipedia.org/wiki/Fairy_Tale_(game)>),
  [rules PDF](https://fgbradleys.com/wp-content/uploads/rules/FairyTalesRules.pdf)
- Among the Stars: [rules PDF](https://fgbradleys.com/wp-content/uploads/rules/Among%20the%20Stars%20-%20rules.pdf),
  [UltraBoardGames](https://ultraboardgames.com/among-the-stars/game-rules.php),
  [Kulkmann's Gamebox](https://boardgame.de/reviews/amostar.htm)
- Seasons: [rulebook PDF](https://cdn.svc.asmodee.net/production-libellud/uploads/2022/03/SEASONS_RULES_EN.pdf),
  [BGA help](https://en.doc.boardgamearena.com/Gamehelpseasons)
- Paper Tales: [Dized aging rules](https://rules.dized.com/paper-tales/rule/aging-phase/category-aging-phase),
  [Tabletopia rulebook](https://c.tabletopia.com/games/paper-tales-2017/rules/papetales-rulebook-en/en)
- Ark Nova: [Wikipedia](https://en.wikipedia.org/wiki/Ark_Nova),
  [BGA tips](https://en.doc.boardgamearena.com/Tips_arknova)
- Between Two Cities: [RulesPal](https://rulespal.com/between-two-cities/rulebook),
  [Board Game Quest](https://boardgamequest.com/between-two-cities-review)
- Draftosaurus: [Zatu how-to-play](https://zatu.com/blogs/how-to-play/how-to-play-draftosaurus),
  [Opinionated Gamers](https://opinionatedgamers.com/2024/03/21/dale-yu-review-of-draftosaurus/)
- Blood Rage: [Dized drafting rules](https://rules.dized.com/blood-rage/rule/gods-gifts/drafting)
- Tides of Time: [Board Game Quest](https://www.boardgamequest.com/tides-of-time-review/),
  [Zatu](https://zatu.com/blogs/reviews/tides-of-time-review)
- Res Arcana: [Opinionated Gamers](https://opinionatedgamers.com/2019/05/03/dale-yu-review-of-res-arcana/),
  [There Will Be Games](https://www.therewillbe.games/articles-boardgame-reviews/7132-res-arcana-review-converting-life-into-death)
- Terraforming Mars draft: [UltraBoardGames variants](https://ultraboardgames.com/terraforming-mars/variants.php),
  [TweakTown (digital draft update)](https://www.tweaktown.com/pressrelease/13020/asmodee-digital-updates-terraforming-mars-draft-variant-major-improvements-based-players-feedback/index.html)

Statistics:

- [7WD in Numbers (BGA forum)](https://forum.boardgamearena.com/viewtopic.php?t=25369),
  [Duel first-player advantage (BGA forum)](https://forum.boardgamearena.com/viewtopic.php?t=17661&start=10),
  [Sevenee 450-game Duel analysis](https://sevenee.mattle.online/lobby/forum/topic/mvxoybDcABT6Q9Kyn/statistical-analysis-on-7-wonders-duel-components-and-strategies-with-450-game-plays),
  [ZeusAI self-play (arXiv 2406.00741)](https://arxiv.org/html/2406.00741v1),
  [mDuo13 wonder tier list (no method)](https://mduo13.com/blog/7+Wonders:+Wonder+Tier+List),
  [BGA starting-board stats thread](https://forum.boardgamearena.com/viewtopic.php?p=44234)
- Winning score guides: [brain-games.com](https://brain-games.com/blogs/board-game-explorer/7-wonders-balancing-science-military-and-culture),
  [Cardsrealm](https://board.cardsrealm.com/en-tt/articles/7-wonders-review-and-rules-raising-a-civilization-through-the-7-wonders)

Reviews and design commentary:

- 7 Wonders 2p complaints and Duel as fix: [Mostly Board Games](https://mostlyboardgames.blogspot.com/p/7-wonders-duel.html),
  [Meeple Mountain (Duel)](https://meeplemountain.com/reviews/7-wonders-duel),
  [GrogHeads (Duel)](https://grogheads.com/review/10278),
  [120 Games blog](https://120-games.blogspot.com/2019/01/you-cant-win-them-all.html),
  [Meeple Mountain: two-player adaptations](https://www.meeplemountain.com/articles/the-good-the-bad-and-the-ugly-two-player-adaptations/)
- 7 Wonders Architects: [Zatu](https://zatu.com/blogs/reviews/7-wonders-architects-review),
  [Board Game Cafe](https://boardgamecafe.net/2022/02/26/7-wonders-architects),
  [Gaming Trend](https://gamingtrend.com/feature/reviews/7-wonders-architects-review-⏤-building-a-foundation)
- It's a Wonderful World: [Board Game Quest](https://www.boardgamequest.com/its-a-wonderful-world-review/),
  [Opinionated Gamers](https://opinionatedgamers.com/2020/08/03/its-a-wonderful-world/)
- Fairy Tale: [Board Game Quest](https://www.boardgamequest.com/fairy-tale-card-game-review)
- Seasons: [Board Game Quest](https://www.boardgamequest.com/seasons-board-game-review/),
  [Opinionated Gamers](https://opinionatedgamers.com/2012/08/10/review-of-seasons-libelludasmodee/)
- Paper Tales: [Opinionated Gamers (Dale Yu)](https://opinionatedgamers.com/2017/09/05/dale-yu-review-of-paper-tales),
  [Opinionated Gamers (Chris Wray)](https://opinionatedgamers.com/2018/10/02/paper-tales-game-review-by-chris-wray/)
- Ark Nova: [Board Game Quest](https://www.boardgamequest.com/ark-nova-review/),
  [Board-Game.co.uk](https://board-game.co.uk/ark-nova-review)
- Hate-drafting and drafting design: [There Will Be Games: Breezy Drafts](https://therewillbe.games/articles-essays/8769-breezy-drafts),
  [League of Gamemakers: Exploring Drafting](https://www.leagueofgamemakers.com/exploring-drafting),
  [Zatu: why we should love hate-drafting](https://zatu.com/blogs/features/why-we-should-all-love-hate-drafting)
- BGA simultaneous-play timer issue: [BGA bug #41933](https://ca.boardgamearena.com/bug?id=41933),
  [BGA clock news](https://ar.boardgamearena.com/news?id=405)
