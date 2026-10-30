# Originality: where 7 Wonders ends and Windamere's Wonders begins (card D3)

Owner: design lane. Status: **draft for human review** (2026-10-29).
This file is the design brief and the line every lane works to (AGENTS.md hard rule 5).
`docs/RULES.md` implements it; `docs/design/CARDS.md` fills it with cards.

Input: research R1 first cut (`agent/research:docs/design/RESEARCH.md` §4), plus our own
knowledge of 7 Wonders. Where we describe 7 Wonders below it is in our own words, from memory,
to say what we must **not** do. Numbers about 7 Wonders are from memory and only matter as
"avoid this"; research may correct them.

## 1. The line

1. **Genre is free, the game is not.** Simultaneous hidden picks, passing hands, a tableau, a
   personal monument, neighbour interaction, dual-use cards, counts scaled to player count: all
   fine. 7 Wonders' specific systems, numbers, names, card list, boards and art: not fine.
2. **A replacement must play differently, not just read differently.** Renaming shields to
   "Guard" is not a replacement. Each row in §3 says what decision changes for the player.
3. **No 7 Wonders numbers.** Not the cadence (3 rounds, deal 7, play 6), not the 2-coin trade,
   the 3-coin discard, the 3 starting coins, 1 point per 3 coins, the 1/3/5 war tokens and −1,
   the science square-plus-7 formula, or "guilds = players + 2". Our numbers are in RULES.md.
4. **No 7 Wonders names or terms** (§5): card names, wonder names, and the words _Age_,
   _stage_, _shield_, _science_, _guild_, _chain_ in our rules and UI.
5. **No 7 Wonders look.** No laurel coin, no compass/gear/tablet trio, no wonder-board layout,
   and no colour-to-role map (red = war, green = science, blue = civic, yellow = trade,
   purple = late scoring, brown/grey = resources). Art picks colours for our six kinds (§3 row 8).
6. **New system or card? Check it against §3 and §6 before it ships.** Add a row if it touches a
   7 Wonders system not listed.

## 2. The game in one paragraph

Two to seven towns sit along the Wend, the ring road round the mere of Windamere. Over four
**Seasons** (Spring, Summer, Autumn, Winter) each town drafts from a hand of 9. Each turn you take
**a pair**: you **Build** one card into your town and **Spend** the other for the goods, coins or
labour printed on its Spend band. Goods (lumber, brick, wool, grain, ore) are tokens you store
and spend; your **Holdings** yield more every turn except in Winter. **Labour** raises your
**Great Work** up a four-tier track. Each Season ends with a **Raid** whose strength everyone
knew from the Season's start: meet it with your **Guard** or lose coins, and neighbours who held
earn a bounty from your fall. **Lore** cards carry ranks 1 to 6 and score runs. Three public
**Honours** per game reward the town that leads a category. The richest reputation after the
Winter Raid wins. Target length about 25 minutes (estimate, untested).

## 3. 7 Wonders signature systems and our replacements

| #   | 7 Wonders system                | What 7 Wonders does (our words)                                                                                                      | Our replacement                                                                                                                                                                                                                                                                                                                  | What plays differently                                                                                                                                                                                 |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Draft cadence                   | 3 rounds; deal 7; take 1 card a turn; 6 turns; the 7th card is discarded; pass left, right, left.                                    | 4 Seasons; deal 9; take **2 cards a turn** (a pair); 4 turns; the 9th card is discarded; pass left, right, left, right.                                                                                                                                                                                                          | Hands shrink two cards a turn, so a season is 4 decisions, each a pair. You see fewer hands per season and every pick also strips a card from the hand you pass. 16 builds a game instead of 18 plays. |
| 2   | Turn options and the floor      | Use the one card: build it, put it under the wonder, or discard it for a fixed 3 coins.                                              | Of the pair, **Build** at most one; **Spend** the other(s) for its own printed Spend band (e.g. 2 brick, or 3 coins, or 2 labour). No fixed floor value. The Spend resolves first, so it can pay for the Build in the same turn.                                                                                                 | Every card is judged twice (as a building and as fuel). The question is "which card pays for which", not "build or bin". Burning a card is never the same value twice.                                 |
| 3   | Wonder board with stages        | A unique board gives a starting resource and 2 to 4 stages, built in order by tucking a drafted card face down and paying resources. | **Great Work**: choose 1 of 2 dealt at setup. A passive **Perk** from turn one, and a **4-tier labour track**. Labour from Spend bands and labour Holdings fills the track; a tier completes by itself when its threshold is reached. No card tucked, no goods paid.                                                             | The monument never costs a pick. It grows as a side effect of which cards you Spend, so you steer it every turn without an "advance the wonder" action. Progress is a visible bar, not a yes/no build. |
| 4   | Resources and production        | Seven named resources (four raw, three crafted). Production is capacity: usable every turn, never spent, never stored.               | Five goods: **lumber, brick, wool, grain, ore** (the Windamere set from Colonizers). Goods are **tokens**: Holdings yield them into your store every turn, building spends them, leftovers carry over. **Winter has no yield.** No raw/crafted split.                                                                            | Saving up matters: you stock goods in Autumn to build in Winter. A Holding is income, not a permanent discount. One expensive card can drain you; the store is a resource you manage.                  |
| 5   | Neighbour trade                 | Buy a resource a neighbour produces for 2 coins paid to that neighbour; some commerce cards cut the price to 1.                      | **No buying from neighbours.** A missing good costs **3 coins at the bank**, or 2 of one good through an **Exchange** card. Neighbour economy sits on **Caravan** cards (Markets) that pay you when your neighbours build or yield.                                                                                              | Coins never move between players, so no one can block or bail you out. The neighbour link is something you draft on purpose, and it rewards watching what neighbours build, not what they produce.     |
| 6   | War with neighbours             | Compare shields with each neighbour at each round's end; the winner takes a round-scaled token, the loser a minus token.             | **Raids**: each Season has a Raid card with a **public strength**, shown at the Season's start. At its end each town compares its **Guard** with the Raid, not with neighbours. Meet it: **Valour** points. Fall short: lose 1 coin per point short. Each neighbour that held gains 1 coin per plundered neighbour (**bounty**). | It is a target you plan for, not an arms race: both neighbours can win, and over-building Guard gains nothing beyond the Raid. The neighbour stake is the bounty: your weakness pays them.             |
| 7   | Science symbol sets             | Three symbols; each scores its count squared, plus a bonus per complete set of all three.                                            | **Lore** cards carry a **rank 1 to 6**. Score every run of consecutive ranks you own (1, 3, 6, 10, 14, 18 points for runs of 1 to 6). Duplicate ranks score nothing. Rank 1 appears only in Spring and rank 6 only in Winter.                                                                                                    | You need one specific card (the 4), not more of a symbol. A gap splits a run, so denial is targeted and everyone can see which rank you lack. Capped at 18 points, per research's runaway warning.     |
| 8   | Seven card colours              | Brown and grey resources, blue civic points, yellow commerce, red war, green science, purple guilds.                                 | **Six kinds**: Holding (yields), Hall (points, upgrade lines), Market (coins, Exchanges, Caravans), Watch (Guard), Lore (ranks), Landmark (late self-scoring). Colours from art, not the 7 Wonders role map.                                                                                                                     | No resource split into two families, no guild family; the kinds count for Honours and Landmarks, so the mix you build is itself a scoring choice.                                                      |
| 9   | Free chain builds               | Owning a named card lets you build a named later card for free; you keep both.                                                       | **Upgrades**: a card may list "upgrades X". If you own X you may build it for its lower **upgrade cost**; X is covered and stops counting (no effect, no points, no kind).                                                                                                                                                       | An upgrade is a trade, not a gift: cheaper, but you lose what X gave. Your town changes shape instead of only growing.                                                                                 |
| 10  | Guilds                          | Late cards that score from what your neighbours built; the deck holds players + 2 of them.                                           | **Landmarks** (Autumn and Winter) score from **your own town** or from beating each neighbour in one count. Plus **3 Honours** per game, drawn from a pool of 8: public awards for the town that leads a category at the end, shown live all game.                                                                               | No card counts a neighbour's cards. Late goals are visible from the start (Honours) and contested by the whole table, not only by your two neighbours.                                                 |
| 11  | Flat-point civic cards          | Cards worth fixed points, some in chains.                                                                                            | **Halls** are worth fixed points on upgrade lines (e.g. 2 → 4 → 7). Upgrading replaces the lower Hall.                                                                                                                                                                                                                           | Building a second fresh Hall gives more points than upgrading, upgrading is cheaper: a cost-versus-points decision the chain system never asked.                                                       |
| 12  | Commerce cards                  | Coins, cheaper neighbour trade, a choice of resources each turn, coins or points by cards owned.                                     | **Markets**: coin income each Yield, Exchanges (2 of one good for 1 of any), Caravans (coins when neighbours build or yield). No trade discounts (there is no trade to discount).                                                                                                                                                | Commerce is about converting and about income from neighbours' activity, not about cheapening a trade.                                                                                                 |
| 13  | Starting money and money points | 3 starting coins; 1 point per 3 coins at the end.                                                                                    | 5 starting coins and no goods; **1 point per 4 coins**; leftover goods score nothing.                                                                                                                                                                                                                                            | Hoarding goods into Winter is a gamble: leftovers are dead, so you plan the Winter build list.                                                                                                         |
| 14  | One copy per card               | You may not build two copies of the same card.                                                                                       | **Duplicates allowed**, except Landmarks (one of each per town).                                                                                                                                                                                                                                                                 | Doubling a Holding is a real engine move; duplicate Lore is dead weight by its own scoring, not by a rule.                                                                                             |
| 15  | Discard-pile powers             | Some wonders let you build from the discard pile or build one card free each round.                                                  | The discard pile is hidden and nothing reads it. Perks and tiers are economic or scoring.                                                                                                                                                                                                                                        | No tracking of the discard; nothing rescues a burned card.                                                                                                                                             |
| 16  | Two players                     | A dummy third city run by the players, or a separate game (Duel).                                                                    | Same rules, **hands of 12, take 3 a turn: Build, Spend and Burn** (the burned card is discarded face down). 3 cards a Season stay undealt.                                                                                                                                                                                       | No dummy to run. You choose which card your opponent never sees; undealt cards keep some hidden information (research §3.5).                                                                           |
| 17  | Tie-break                       | Most coins.                                                                                                                          | Most Great Work tiers, then most coins, then a shared win.                                                                                                                                                                                                                                                                       | Ties reward the monument, the system unique to each town.                                                                                                                                              |
| 18  | Scoring visibility              | Points are summed on a score pad at the end; the leader stays hidden.                                                                | Same multi-category end scoring (genre), but every input is public: Honours holders, Raid results and a live score estimate are on screen all game (UI lane).                                                                                                                                                                    | New players can see who leads and why (research §1.4); hidden hands keep the draft uncertain.                                                                                                          |

Not replaced because they are genre-common (research §4): simultaneous hidden pick and reveal,
passing the rest of the hand, changing pass direction between rounds, a tableau of persistent
cards, a personal monument, neighbour-only interaction, dual-use cards, majority awards, card
counts by player count. For each of these the numbers are ours.

## 4. Why this hangs together

- **The pair is the engine.** A pick is "Build A, Spend B to pay for it". Goods, coins and labour
  all come out of Spend bands, so the draft and the economy are the same decision.
- **Stored goods make Seasons different.** Spring builds Holdings, Summer and Autumn convert
  income into points, Winter has no yield and runs on what you saved.
- **Interaction you can see.** Bounty coins move when a Raid lands; Honour badges change hands;
  Caravans pay when a neighbour builds. Research §3.3: players want visible interaction.
- **Everything is public except hands and picks.** Stores, Guard, labour, Lore ranks, Honours:
  all on the table. That is what makes a live score estimate possible.

## 5. Blocklist: names and terms we do not use

**Terms** (rules, UI, card text, code identifiers visible to players): Age, wonder board,
wonder stage, shield, military/conflict token, science, compass/gear/tablet, guild, chain (as a
mechanic), Free City, papyrus, loom, glass (as a resource).
Use instead: Season, Great Work, tier, Guard, Valour, Lore, rank, upgrade.

**7 Wonders card names** (from memory, research to verify; do not use these or near copies):
Lumber Yard, Stone Pit, Clay Pool, Ore Vein, Tree Farm, Excavation, Clay Pit, Timber Yard,
Forest Cave, Mine, Sawmill, Quarry, Brickyard, Foundry, Loom, Glassworks, Press, Pawnshop, Baths,
Altar, Theater, Aqueduct, Temple, Statue, Courthouse, Pantheon, Gardens, Town Hall, Palace,
Senate, Tavern, East Trading Post, West Trading Post, Marketplace, Caravansery, Forum, Vineyard,
Bazar, Haven, Lighthouse, Chamber of Commerce, Arena, Stockade, Barracks, Guard Tower, Walls,
Training Ground, Stables, Archery Range, Fortifications, Circus, Arsenal, Siege Workshop,
Apothecary, Workshop, Scriptorium, Dispensary, Laboratory, Library, School, Lodge, Observatory,
University, Academy, Study, and every "… Guild".

**Wonders**: no real-world ancient wonder (Colossus, Lighthouse of Alexandria, Temple of
Artemis, Hanging Gardens, Statue of Zeus, Mausoleum, Pyramids). Great Works are Windamere places.

## 6. Checklist for a new card or system

1. Name not on the blocklist, and not a near copy (Sawmill → "Saw Mill" is still a copy).
2. Cost and effect not lifted from a 7 Wonders card, even renamed.
3. Uses our vocabulary (§5) and our numbers (RULES.md).
4. If it touches a system in §3, it obeys our replacement, not the original.
5. Kinds and icons follow ART.md, never the 7 Wonders colour map.

## 7. Open questions for the human

1. **Goods.** We use Colonizers of Windamere's five goods so the two games share a world and
   icons. OK, or do you want a set of goods unique to this game?
2. **The pair pick.** It is our biggest departure and makes each turn heavier than a single pick.
   If playtests find it slow, the fallback is a single pick with a per-card Spend band (rows 2-4
   still hold). Keep the pair?
3. **No neighbour trade.** Research says neighbour trade is well liked. We dropped it to stay
   clear of 7 Wonders and put neighbour stakes into bounties and Caravans instead. Acceptable?
