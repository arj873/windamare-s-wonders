# Research: card drafting and tableau building (card R1)

Owner: research lane. Status: **first cut** (2026-10-29). Per-game long notes live in
`docs/design/research/games.md`. Numbers marked _(unverified)_ come from memory or a single weak
source; treat them as approximate until a rulebook check confirms them.

Purpose: give the design lane what it needs to write an **original** drafting game. Mechanics are
described in our own words. Section 4 lists which systems are 7 Wonders signatures (design must
replace them) and which are genre-common (fine to use).

---

## 1. TL;DR for design

1. **Simultaneous pick-and-pass is the genre's core value.** It keeps a 3 to 7 player game at
   roughly 30 minutes with near-zero downtime. Every successful game below protects it.
2. **Interaction is the genre's main complaint.** "Multiplayer solitaire" shows up in reviews of
   7 Wonders, It's a Wonderful World and Ark Nova. Neighbour-only interaction (7 Wonders, Paper
   Tales) keeps it bounded and readable; we should keep some, but give it visible stakes.
3. **Two players is the weak count.** Base 7 Wonders needs a dummy-player variant that most
   reviewers dislike; its publisher built a separate game (Duel) to fix it. Plan a dedicated
   2-player mode from day one rather than a dummy.
4. **End-of-game-only scoring hides the leader.** That limits leader-bashing (good) but makes the
   game feel opaque to new players (bad). A browser game can show a live score estimate, which
   physical games cannot (whether BGA's 7 Wonders shows live scores: _unverified_).
5. **Watch exponential set scoring.** Squared or triangular set scoring (7 Wonders science,
   Sushi Go dumplings) creates a runaway path that only neighbours can stop by hate-drafting.
   Either cap it or make denial cheap and visible.

---

## 2. Headline references (summary table)

Full notes per game: `research/games.md`.

| Game (year, designer)                  | Players            | Length     | Draft shape                                                                              | Cards played per player                | Interaction                                                                 | Scoring                                     |
| -------------------------------------- | ------------------ | ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| 7 Wonders (2010, Bauza)                | 3-7 (2 via dummy)  | ~30 min    | 3 rounds, deal 7, play 6, last card discarded; pass direction alternates                 | 18                                     | Neighbour trade, neighbour military, hate-draft                             | End only; 7+ categories summed              |
| 7 Wonders Duel (2015, Bauza & Cathala) | 2                  | ~30 min    | No passing; take from an open/closed card layout per round                               | ~23 incl. wonders _(unverified)_       | Tug-of-war military track, trade cost rises with rival's production, denial | 3 win conditions: 2 instant, 1 on points    |
| 7 Wonders Architects (2021, Bauza)     | 2-7                | ~25 min    | Turn-based; take 1 of 3 cards (left deck face-up, right deck face-up, central face-down) | Varies; ends when one wonder completes | Shared decks with neighbours, periodic war                                  | Points, game ends on first completed wonder |
| Sushi Go! (2013, Walker-Harding)       | 2-5                | ~15 min    | 3 rounds; hand 10/9/8/7 for 2/3/4/5 players; play every card                             | 24-30                                  | Hate-draft, majorities                                                      | Per round + one end-game majority           |
| It's a Wonderful World (2019, Guérard) | 1-5                | ~45 min    | 4 rounds; draft 7, then plan: build or recycle each card                                 | 28 drafted                             | Very low (draft + 2 production majorities)                                  | End only; card VP + multipliers             |
| Fairy Tale (2004, Nakamura)            | 2-5                | ~20 min    | 4 rounds; draft 5, keep 3, discard 2                                                     | 12                                     | Flip (disable) other players' cards, hate-draft                             | End only; sets and multipliers              |
| Among the Stars (2012, Bagiartakis)    | 2-4 (more w/ exp.) | 30-60 min  | 4 rounds of pick-and-pass; build or discard for money _(unverified)_                     | ~24 _(unverified)_                     | Low; optional aggressive cards                                              | Mostly at placement; adjacency matters      |
| Seasons (2012, Bonnessée)              | 2-4                | ~60 min    | Pre-game draft of 9 cards, split into 3 packets of 3; main game drafts dice              | 9 power cards                          | Take-that cards, dice denial                                                | Crystals + card VP                          |
| Paper Tales (2017, Uesugi)             | 2-5                | ~30 min    | 4 rounds, simultaneous draft, units age and die                                          | Varies                                 | War vs both neighbours                                                      | Legend points per round                     |
| Ark Nova (2021, Wigge)                 | 1-4                | 90-150 min | Not a draft; open card display + 5 rotating action cards                                 | Varies                                 | Low; shared display, races for bonuses                                      | Two converging tracks                       |

---

## 3. Patterns and pitfalls (numbers first)

### 3.1 Hand size and cards per round

| Game                      | Dealt per round        | Kept/played per round                 | Rounds     | Plays per game |
| ------------------------- | ---------------------- | ------------------------------------- | ---------- | -------------- |
| 7 Wonders                 | 7                      | 6 (7th discarded)                     | 3          | 18             |
| Sushi Go!                 | 7-10 (by player count) | all                                   | 3          | 21-30          |
| It's a Wonderful World    | 7 (5p)                 | all 7 drafted; each built or recycled | 4          | 28             |
| Fairy Tale                | 5                      | 3 (2 discarded)                       | 4          | 12             |
| Seasons (prelude)         | 9                      | 9                                     | 1 pre-game | 9              |
| Blood Rage _(unverified)_ | 8                      | 6 (2 discarded)                       | 3          | 18             |

**Pattern.** Hands of 5 to 10, with 6 to 8 the sweet spot. Total plays per player cluster at
12 to 30; about 18 is enough to build a recognisable "engine" while the game stays at ~30 min.

**Pitfall: the last card.** When every dealt card is played, the last pick is forced and
meaningless (Sushi Go). 7 Wonders discards the 7th card; Fairy Tale discards 2 of 5. Dealing
one more card than you play keeps the last decision real.

**Pitfall: hand size vs player count.** With N players and hand size H, a card you pass returns
to you only if H > N. In 7 Wonders at 3 players (7 cards) you see each hand twice or three times,
so you can plan around it; at 7 players you never see a hand twice. Design should check its
hand size against both 3p and max-player tables: at low counts the draft is a memory game, at
high counts it is pure tactics.

### 3.2 Simultaneity and downtime

- All pick-and-pass games here resolve picks simultaneously; game length barely grows with
  player count (7 Wonders is ~30 min at 3 or 7). This is why the genre suits 6-7 players.
- The only wait is the slowest picker. Online (BGA) adds a per-turn clock; BGA lists
  simultaneous-play games (7 Wonders, Sushi Go, Draftosaurus) as a known pain for tournament time
  allocation. Implication for us: one shared turn timer, auto-pick on timeout.
- Turn-based variants (Architects, Duel, Ark Nova) bring back downtime; Ark Nova reviews report
  4-hour first games at 4 players.

### 3.3 Interaction

| Interaction kind                                              | Where                   | Reviewer reaction                           |
| ------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| Hate-drafting (take a card to deny it)                        | All pick-and-pass games | Accepted; strongest at 2-3 players          |
| Neighbour trade (pay a neighbour for a resource they produce) | 7 Wonders               | Praised as smooth; scales to 7 players      |
| Neighbour combat at round end                                 | 7 Wonders, Paper Tales  | Praised; gives a reason to watch neighbours |
| Disable / flip opponents' cards                               | Fairy Tale, Seasons     | Divisive ("take that")                      |
| Tug-of-war track                                              | 7 Wonders Duel          | Strongly praised; only works at 2           |
| Production majorities                                         | It's a Wonderful World  | Too weak; game called solitaire             |

**Pattern.** Neighbour-only interaction keeps reading load constant as players grow. Players
want interaction they can _see_ (a track moving, a token changing hands).

### 3.4 Scoring spreads and runaway leaders

- **Multiple point categories, summed at the end** (7 Wonders has seven or so) lets several
  strategies compete and hides the leader. Downside: new players cannot tell who is winning.
- **Super-linear set scoring** (7 Wonders science, Sushi Go dumplings) is the main runaway
  risk. The fix in base 7 Wonders is social (neighbours hate-draft science); Duel turns it into
  an explicit instant-win race the opponent can see and block.
- **Majority bonuses with a penalty for last** (Sushi Go pudding: most gains, fewest loses)
  punish ignoring a category without being take-that.
- **Converging tracks** (Ark Nova): two scores move toward each other and the game ends when they
  meet; the end timer is player-controlled.
- **Catch-up levers seen:** first-player order rotation, discard-for-money floors (7 Wonders,
  Among the Stars), recycle-for-resource (It's a Wonderful World), per-round war vs neighbours
  rather than global (Paper Tales) so a leader cannot gang up on a weak player.

Numbers on typical score spreads: _not yet collected_; to do in the deepening pass
(BGA statistics, if public).

### 3.5 Two-player handling

| Approach                       | Example                | Verdict in reviews                                   |
| ------------------------------ | ---------------------- | ---------------------------------------------------- |
| Dummy third player             | 7 Wonders base 2p      | Disliked ("never play it"); dropped from 2nd edition |
| Separate dedicated game        | 7 Wonders Duel         | Very well received; tug-of-war and open card layout  |
| Bigger hands, same rules       | Sushi Go! (10 cards)   | Works but heavy hate-drafting                        |
| Pick-2-discard-1 or burn cards | Various _(unverified)_ | Common fix for "I know your whole hand"              |

**Pattern.** In a 2-player pass, you see every card your opponent gets. Drafts become pure
denial. Duel replaces passing with a partly face-down layout so information stays incomplete.

### 3.6 Length targets

7 Wonders ~30 min, Sushi Go ~15, Fairy Tale ~20, Architects ~25, Paper Tales ~30,
It's a Wonderful World ~45, Seasons ~60, Ark Nova 90-150. For a browser game vs bots,
**20-30 minutes** at 3-7 players is the competitive band.

---

## 4. 7 Wonders signatures vs genre-common (input for D3 / ORIGINALITY.md)

**Replace (distinctive to 7 Wonders, or tightly identified with it):**

| System                                                                                                                          | What it is                           | Why it's identifying                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| Three ages, deal 7, play 6, discard the 7th, pass direction alternating left/right/left                                         | Exact draft cadence                  | The game's skeleton; copying the numbers copies the feel              |
| Wonder board with 2-4 stages built by tucking a drafted card face-down                                                          | Personal monument fed by spent cards | The tuck-a-card build is the brand's best-known trick                 |
| Seven named resources (4 raw, 3 manufactured) bought from neighbours at a fixed coin price, discounted by specific yellow cards | Resource trade economy               | Price and structure are signature                                     |
| Military: compare shields with each neighbour at each age end, fixed win/loss tokens rising by age                              | Neighbour combat                     | Specific scoring table                                                |
| Science: three symbols scored as count-squared per symbol plus a bonus per complete set                                         | Set scoring                          | Most recognisable formula in the game                                 |
| Card colour families (brown, grey, blue, yellow, red, green, purple guilds)                                                     | Card taxonomy                        | Colour-to-role map is the visual identity                             |
| Free building via named predecessor ("chain")                                                                                   | Upgrade links                        | Fine as a genre idea; copy the chain list and it's not                |
| Discard a card for a fixed 3 coins                                                                                              | Floor action                         | Common idea (Among the Stars has it too); amount and wording are 7W's |
| Coin-to-point conversion at end                                                                                                 | Leftover money scoring               | Generic, but the exact ratio is 7W's                                  |
| Guilds that score by what neighbours built                                                                                      | Neighbour-scoring cards              | Concept is a signature of the base game                               |

**Use freely (genre-common):**

- Simultaneous secret pick, reveal, pass the rest.
- Multiple drafting rounds with changing pass direction (choose our own cadence).
- Tableau of played cards with persistent effects; cards that discount or unlock later cards.
- A personal monument/project to invest in (design our own build mechanic, not tuck-a-card).
- Neighbour-only interaction (trade, conflict, scoring), as in Paper Tales.
- Dual-use cards (build it or burn it for a resource), as in It's a Wonderful World.
- Majority bonuses, set collection, multipliers, end-of-game scoring.
- Card counts scaled to player count.

---

## 5. Open questions (deepening pass)

1. Public BGA stats for 7 Wonders: win rate by strategy and score spread. Will look for them.
2. 7 Wonders 2nd edition (2020) changes and the reasons given.
3. Between Two Cities, Draftosaurus, Res Arcana, Blood Rage, Terraforming Mars draft variant,
   Tides of Time (2p) to add.
4. Verify numbers marked _(unverified)_ against rulebooks.

---

## Sources (first cut)

Rules summaries and rulebooks:

- 7 Wonders: [BGA game panel](https://en.boardgamearena.com/gamepanel?game=sevenwonders),
  [Order of Gamers reference](https://www.orderofgamers.com/downloads/7Wonders_v2.pdf),
  [officialgamerules.org](https://officialgamerules.org/game-rules/7-wonders/)
- 7 Wonders Duel: [officialgamerules.org](https://officialgamerules.org/game-rules/7-wonders-duel-rules/),
  [BGA](https://en.boardgamearena.com/gamepanel?id=1266),
  [Bar Games 101](https://bargames101.com/7-wonders-duel/)
- 7 Wonders Architects: [officialgamerules.org](https://officialgamerules.org/game-rules/7-wonders-architects/),
  [RulesPal](https://rulespal.com/7-wonders-architects/rulebook)
- Sushi Go!: [BGA help](https://en.doc.boardgamearena.com/Gamehelpsushigo),
  [rules PDF](https://www.world-of-board-games.com.sg/docs/Sushi-Go.pdf)
- It's a Wonderful World: [rulebook PDF](https://its-a-wonderful-world.game-park.com/rules-en.pdf),
  [UltraBoardGames](https://ultraboardgames.com/its-a-wonderful-world/game-rules.php)
- Fairy Tale: [Wikipedia](<https://en.wikipedia.org/wiki/Fairy_Tale_(game)>),
  [rules PDF](https://fgbradleys.com/wp-content/uploads/rules/FairyTalesRules.pdf)
- Among the Stars: [Kulkmann's Gamebox](https://boardgame.de/reviews/amostar.htm)
- Seasons: [rulebook PDF](https://cdn.svc.asmodee.net/production-libellud/uploads/2022/03/SEASONS_RULES_EN.pdf),
  [BGA help](https://en.doc.boardgamearena.com/Gamehelpseasons)
- Paper Tales: [Dized aging rules](https://rules.dized.com/paper-tales/rule/aging-phase/category-aging-phase)
- Ark Nova: [Wikipedia](https://en.wikipedia.org/wiki/Ark_Nova),
  [BGA tips](https://en.doc.boardgamearena.com/Tips_arknova)

Reviews:

- 7 Wonders 2p complaints and Duel as fix: [Mostly Board Games](https://mostlyboardgames.blogspot.com/p/7-wonders-duel.html),
  [Meeple Mountain (Duel)](https://meeplemountain.com/reviews/7-wonders-duel),
  [GrogHeads (Duel)](https://grogheads.com/review/10278),
  [120 Games blog](https://120-games.blogspot.com/2019/01/you-cant-win-them-all.html)
- 7 Wonders Architects: [Zatu](https://zatu.com/blogs/reviews/7-wonders-architects-review),
  [Board Game Cafe](https://boardgamecafe.net/2022/02/26/7-wonders-architects),
  [Gaming Trend](https://gamingtrend.com/feature/reviews/7-wonders-architects-review-⏤-building-a-foundation)
- It's a Wonderful World: [Board Game Quest](https://www.boardgamequest.com/its-a-wonderful-world-review/)
- Fairy Tale: [Board Game Quest](https://www.boardgamequest.com/fairy-tale-card-game-review)
- Seasons: [Board Game Quest](https://www.boardgamequest.com/seasons-board-game-review/),
  [Opinionated Gamers](https://opinionatedgamers.com/2012/08/10/review-of-seasons-libelludasmodee/)
- Paper Tales: [Opinionated Gamers (Dale Yu)](https://opinionatedgamers.com/2017/09/05/dale-yu-review-of-paper-tales),
  [Opinionated Gamers (Chris Wray)](https://opinionatedgamers.com/2018/10/02/paper-tales-game-review-by-chris-wray/)
- Ark Nova: [Board Game Quest](https://www.boardgamequest.com/ark-nova-review/),
  [Board-Game.co.uk](https://board-game.co.uk/ark-nova-review)
- BGA simultaneous-play timer issue: [BGA bug #41933](https://ca.boardgamearena.com/bug?id=41933),
  [BGA clock news](https://ar.boardgamearena.com/news?id=405)
