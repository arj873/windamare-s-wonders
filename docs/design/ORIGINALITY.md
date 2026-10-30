# Originality: where 7 Wonders ends and Windamere's Wonders begins (card D3)

Owner: design lane. Status: **approved (H1, 2026-10-29)**, rows 1-6, 8, 10-13, 16 and 18 revised
for D2c (new goods, single pick, neighbour trade) and research's red-team review
(`docs/design/research/originality-review.md`, R4).
This file is the design brief and the line every lane works to (AGENTS.md hard rule 5).
`docs/RULES.md` implements it; `docs/design/CARDS.md` fills it with cards.

Input: research R1 (`docs/design/RESEARCH.md` §4) and R4 (`originality-review.md` §1, §5), plus
our own knowledge of 7 Wonders. Where we describe 7 Wonders below it is in our own words, from
memory, to say what we must **not** do. Numbers about 7 Wonders are from memory and only matter as
"avoid this".

## 1. The line

1. **Genre is free, the game is not.** Simultaneous hidden picks, passing hands, a tableau, a
   personal monument, neighbour interaction, dual-use cards, counts scaled to player count: all
   fine. 7 Wonders' specific systems, numbers, names, card list, boards and art: not fine.
2. **A replacement must play differently, not just read differently.** Renaming shields to
   "Guard" is not a replacement. Each row in §3 says what decision changes for the player.
3. **No 7 Wonders numbers.** Not the cadence (3 rounds, deal 7, play 6, 18 plays), not the 2-coin
   trade or Duel's "2 + what the seller makes", the 1-coin trade discounts, the 3-coin discard,
   the 3 starting coins, 1 point per 3 coins, the 1/3/5 war tokens and −1, the science
   square-plus-7 formula, "guilds = players + 2", or the wonder's "3, special, 7". Avoid a
   printed 7 where a 6 or an 8 works (R4 O15). Our numbers are in RULES.md.
4. **No 7 Wonders names or terms** (§5): card names, wonder names, and the words _Age_,
   _stage_, _shield_, _science_, _guild_, _chain_, _caravan_, _treasury_ in our rules and UI.
5. **No 7 Wonders look.** No laurel coin, no compass/gear/tablet trio, no wonder-board layout,
   and no colour-to-role map (red = war, green = science, blue = civic, yellow = trade,
   purple = late scoring, brown/grey = resources). Art picks colours for our six kinds (§3 row 8).
6. **New system or card? Check it against §3 and §6 before it ships.** Add a row if it touches a
   7 Wonders system not listed.

## 2. The game in one paragraph

Two to seven towns sit along the Wend, the ring road round the mere of Windamere. Over four
**Seasons** (Spring, Summer, Autumn, Winter) each town drafts from a hand of 6. Each turn you take
**one card** and either **Build** it into your town or **Spend** it for the goods, coins or labour
printed on its Spend band. On the fifth turn you keep both last cards: build or Spend one, and
the other is Spent for you (the **glean**). Goods (**reed, peat, salt, wax, horn**) are tokens you
store and spend; your **Holdings** yield more every turn except in Winter. Missing a good? Buy it
out of a neighbour's store at the Season's market price, and the coins are theirs. **Labour**
raises your **Great Work** up a four-tier track. Each Season ends with a **Raid** whose strength
everyone knew from the Season's start: meet it with your **Guard** or lose coins, and neighbours
who held take a bounty from you. **Lore** cards carry ranks 1 to 6 and score runs. Three public
**Honours** per game reward the town that leads a category. The greatest Renown after the Winter
Raid wins. About 15 minutes online (estimate, untested; RULES.md R18).

## 3. 7 Wonders signature systems and our replacements

| #   | 7 Wonders system                | What 7 Wonders does (our words)                                                                                                       | Our replacement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | What plays differently                                                                                                                                                                                                                                                              |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Draft cadence                   | 3 rounds; deal 7; take 1 card a turn; 6 turns; the 7th card is discarded; pass left, right, left; 18 plays.                           | 4 Seasons; deal **6**; take 1 card a turn; **5 turns**; the 6th card is your **glean**: on the last turn you hold both cards, use one and the other is Spent for you. Pass left, right, left, right. 20 picks and 4 gleans a game.                                                                                                                                                                                                                                                                           | No dead last card: the last hand is a real choice of two, and both end up working for you. Four Seasons with a no-Yield Winter give the year a shape (stock up, then spend down) that three equal rounds do not.                                                                    |
| 2   | Uses of a card                  | Three uses: build it, tuck it under the wonder (paying the stage cost), or discard it for a flat 3 coins.                             | **Two uses**: **Build** it, or **Spend** it for **its own printed Spend band** (e.g. 2 peat, or 4 coins, or 2 labour, or 1 salt + 1 coin). No flat floor, and no "feed the monument" use: the Great Work fills from labour (row 3).                                                                                                                                                                                                                                                                          | Every card has its own fuel value, so a card you take to deny a neighbour is never a flat 3 coins: it may be the peat you need. "Build or burn" becomes "which card is worth more as a building than as fuel".                                                                      |
| 3   | Wonder board with stages        | A unique board gives a starting resource and 2 to 4 stages, built in order by tucking a drafted card and paying resources.            | **Great Work**: choose 1 of 2 dealt at setup. A passive **Perk** from turn one, and a **4-tier labour track** (3, 6, 10, 15 labour). Labour from Spend bands and labour Holdings fills the track; a tier completes by itself at its threshold. No card tucked, no goods paid. Every tier pays some Renown, most with a small effect; no "3, special, 7" (R4 O7).                                                                                                                                             | The monument has no action and no cost: it grows from the labour on the cards you Spend and the Holdings you build, so labour competes with goods and coins on every Spend. Progress is a visible bar, not a yes/no build.                                                          |
| 4   | Resources and production        | Seven named resources (four raw, three crafted). Production is capacity: usable every turn, never spent, never stored.                | Five goods unique to us: **reed, peat, salt, wax, horn**. Goods are **tokens**: Holdings yield them into your store every turn, building spends them, leftovers carry over. **Winter has no Yield.** No raw/crafted split. Goods you sell leave your store (row 5).                                                                                                                                                                                                                                          | Saving up matters: you stock goods in Autumn to build in Winter. A Holding is income, not a permanent discount. One expensive card can drain you, and so can your neighbours' purchases: the store is a resource you manage.                                                        |
| 5   | Neighbour trade                 | Buy a good a neighbour **produces** for a flat 2 coins, paid to them; they lose nothing; some cards cut the price to 1 from one side. | **Buy out of a neighbour's store.** The good **moves**: it leaves their store and goes straight into your Build; the coins go to them; they cannot refuse. **Market price by Season**: 1, 3, 4, 5 coins (never 2). **At most 2 goods from each neighbour a turn**, and only what they held at the turn's start. Their own Build is paid first; a purchase they can't fill comes from the bank at the same price. Otherwise the bank charges 6, or an Exchange takes 2 of one good. No card lowers the price. | Selling costs the seller: a full store feeds your neighbours and empties as they buy, so you choose between hoarding for Winter and spending before they drain you. Supply is what neighbours **saved**, not what they built. Rising prices make Autumn stock Winter's trade goods. |
| 6   | War with neighbours             | Compare shields with each neighbour at each round's end; the winner takes a round-scaled token, the loser a minus token.              | **Raids**: each Season has a Raid card with a **public strength**, shown at the Season's start. At its end each town compares its **Guard** with the Raid, not with neighbours. Meet it: **Valour** points. Fall short: lose 1 coin per point short, and each neighbour that held **takes 1 coin from you** (**bounty**). Watch Guard varies within a Season (R4 O9).                                                                                                                                        | It is a target you plan for, not an arms race: both neighbours can win, and over-building Guard gains nothing beyond the Raid. The neighbour stake is the bounty: your weakness pays them out of your own purse.                                                                    |
| 7   | Science symbol sets             | Three symbols; each scores its count squared, plus a bonus per complete set of all three.                                             | **Lore** cards carry a **rank 1 to 6**. Score every run of consecutive ranks you own (1, 3, 6, 10, 14, 18 points for runs of 1 to 6). Duplicate ranks score nothing. Rank 1 appears only in Spring and rank 6 only in Winter.                                                                                                                                                                                                                                                                                | You need one specific card (the 4), not more of a symbol. A gap splits a run, so denial is targeted and everyone can see which rank you lack. Capped at 18 points, per research's runaway warning.                                                                                  |
| 8   | Seven card colours              | Brown and grey resources, blue civic points, yellow commerce, red war, green science, purple guilds.                                  | **Six kinds**: Holding (yields), Hall (points, upgrade lines), Market (coins, Exchanges, Tolls, sale bonuses), Watch (Guard), Lore (ranks), Landmark (late self-scoring). Colours from art, not the 7 Wonders role map (R4 O1).                                                                                                                                                                                                                                                                              | No resource split into two families, no guild family; the kinds count for Honours and Landmarks, so the mix you build is itself a scoring choice.                                                                                                                                   |
| 9   | Free chain builds               | Owning a named card lets you build a named later card for free; you keep both.                                                        | **Upgrades**: a card may list "upgrades X". If you own X you may build it for its lower **upgrade cost**; X is covered and stops counting (no effect, no points, no kind).                                                                                                                                                                                                                                                                                                                                   | An upgrade is a trade, not a gift: cheaper, but you lose what X gave. Your town changes shape instead of only growing.                                                                                                                                                              |
| 10  | Guilds                          | Late cards that score from what your neighbours built, one per colour; the deck holds players + 2 of them.                            | **Landmarks** (from Summer on) score **your own town** in varied shapes: a threshold ("6 if 3+ Watches"), a spread ("2 per Season you have a Hall from"), sets, stored goods, or beating each neighbour in one measure. Not one per kind (R4 O13). Plus **3 Honours** per game, drawn from 8: public awards for the town that leads a category at the end, shown live all game.                                                                                                                              | No card counts a neighbour's cards. Late goals are visible from the start (Honours) and contested by the whole table, and Landmark conditions ask for a shape of town, not "more of colour X".                                                                                      |
| 11  | Flat-point civic cards          | Cards worth fixed points, some in chains (e.g. a religious line ending at 7 in the last round).                                       | **Halls** are worth fixed points on upgrade lines with our numbers: Moot Stone → Moot Hall → Wend Council House → High Hall (2 → 4 → 6 → 9), and a lakeside line Ferry Steps → Boathouse → Ice Fair Hall (2 → 5 → 8) that skips Autumn (R4 O6). Upgrading replaces the lower Hall.                                                                                                                                                                                                                           | Building a second fresh Hall gives more points than upgrading, upgrading is cheaper: a cost-versus-points decision the chain system never asked.                                                                                                                                    |
| 12  | Commerce cards                  | Coins, cheaper neighbour trade, a choice of resources each turn, coins or points by cards owned.                                      | **Markets**: coin income each Yield, Exchanges (2 of one good for 1 of any), **Tolls** (coins when a neighbour builds), **sale bonuses** (coins from the bank when a neighbour buys from you). **No card makes buying cheaper**, on either side.                                                                                                                                                                                                                                                             | Commerce rewards being the supplier and the crossroads, not cheapening your purchases. A Market makes your store worth more to you when neighbours drain it.                                                                                                                        |
| 13  | Starting money and money points | 3 starting coins; 1 point per 3 coins at the end.                                                                                     | 5 starting coins and no goods; **Purse**: 1 point per 4 coins; leftover goods score nothing. The bank sells a missing good for 6 coins.                                                                                                                                                                                                                                                                                                                                                                      | Hoarding goods into Winter is a gamble twice over: neighbours can buy your stock out from under you, and leftovers are dead at the end.                                                                                                                                             |
| 14  | One copy per card               | You may not build two copies of the same card.                                                                                        | **Duplicates allowed**, except Landmarks (one of each per town).                                                                                                                                                                                                                                                                                                                                                                                                                                             | Doubling a Holding is a real engine move; duplicate Lore is dead weight by its own scoring, not by a rule.                                                                                                                                                                          |
| 15  | Discard-pile powers             | Some wonders let you build from the discard pile or build one card free each round.                                                   | The discard pile is hidden and nothing reads it. Perks and tiers are economic or scoring.                                                                                                                                                                                                                                                                                                                                                                                                                    | No tracking of the discard; nothing rescues a spent card.                                                                                                                                                                                                                           |
| 16  | Two players                     | A dummy third city run by the players, or a separate game (Duel) that prices bank purchases by the opponent's production.             | Same rules with one neighbour: **hands of 10** from the 4-seat deck, **take one card and Burn one** on turns 1-4, take one and glean the other on turn 5; 4 cards a Season stay undealt. Trade is the same store rule (row 5) with a limit of 2 goods a turn.                                                                                                                                                                                                                                                | No dummy to run and no Duel price formula. The Burn denies your opponent a card; only turn-1 Burns and the undealt cards stay truly hidden, since the opponent can often work out the rest (R4 D7).                                                                                 |
| 17  | Tie-break                       | Most coins.                                                                                                                           | Most Great Work tiers, then most coins, then a shared win.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ties reward the monument, the system unique to each town.                                                                                                                                                                                                                           |
| 18  | Scoring visibility              | Points are summed on a score pad at the end, one column per card colour plus war, coins and wonder; the leader stays hidden.          | Six groups in our own order: **Town** (Halls and Landmarks together), **Great Work**, **Raids**, **Lore**, **Honours**, **Purse** (R4 O12). Every input is public: Honours holders, Raid results and a live score estimate are on screen all game (UI lane).                                                                                                                                                                                                                                                 | New players can see who leads and why (research §1.4); hidden hands keep the draft uncertain. The sheet does not map column for column onto the 7 Wonders pad.                                                                                                                      |

Not replaced because they are genre-common (research §4): simultaneous hidden pick and reveal,
taking one card a turn, passing the rest of the hand, changing pass direction between rounds, a
tableau of persistent cards, a personal monument, neighbour interaction including paying a
neighbour for goods, dual-use cards, majority awards, card counts by player count. For each of
these the mechanism details and numbers are ours.

## 4. Why this hangs together

- **Every card is a building or fuel.** A pick is "build this, or burn it for its band". Goods,
  coins and labour all come out of Spend bands, so the draft and the economy are the same
  decision.
- **Stored goods make Seasons different.** Spring builds Holdings, Summer and Autumn convert
  income into points, Winter has no Yield and runs on what you saved, or on what you can buy out
  of a neighbour's store at the dearest price of the year.
- **Interaction you can see.** Goods leave a neighbour's store when you buy; bounty coins move
  when a Raid lands; Honour badges change hands; Tolls pay when a neighbour builds. Research
  §3.3: players want visible interaction. RULES.md's design note estimates 20-35% of a winning
  score now moves with the neighbours (was under 10%, R4 D1; untested).
- **Everything is public except hands and picks.** Stores, Guard, labour, Lore ranks, Honours:
  all on the table. That is what makes a live score estimate and informed buying possible.

## 5. Blocklist: names and terms we do not use

**Terms** (rules, UI, card text, code identifiers visible to players): Age, wonder board,
wonder stage, shield, military/conflict token, science, compass/gear/tablet, guild, chain (as a
mechanic), caravan, treasury, trading post, Free City.
Use instead: Season, Great Work, tier, Guard, Valour, Lore, rank, upgrade, Toll, Purse.

**Goods we do not use**: 7 Wonders' wood, stone, clay, ore, glass, cloth/loom, papyrus (or
timber, brick as near copies), and Colonizers' lumber, brick, wool, grain, ore. Ours: reed, peat,
salt, wax, horn.

**7 Wonders card names** (from memory, research to verify; do not use these or near copies):
Lumber Yard, Stone Pit, Clay Pool, Ore Vein, Tree Farm, Excavation, Clay Pit, Timber Yard,
Forest Cave, Mine, Sawmill, Quarry, Brickyard, Foundry, Loom, Glassworks, Press, Pawnshop, Baths,
Altar, Theater, Aqueduct, Temple, Statue, Courthouse, Pantheon, Gardens, Town Hall, Palace,
Senate, Tavern, East Trading Post, West Trading Post, Marketplace, Caravansery, Forum, Vineyard,
Bazar, Haven, Lighthouse, Chamber of Commerce, Arena, Stockade, Barracks, Guard Tower, Walls,
Training Ground, Stables, Archery Range, Fortifications, Circus, Arsenal, Siege Workshop,
Apothecary, Workshop, Scriptorium, Dispensary, Laboratory, Library, School, Lodge, Observatory,
University, Academy, Study, and every "… Guild". From 7 Wonders Duel (R4 O5, O10): Palisade,
Moneylenders. Near copies to avoid (R4 O8-O10): Smeltery, Kiln, Rampart, Harbour, Moneylender.

**Wonders**: no real-world ancient wonder (Colossus, Lighthouse of Alexandria, Temple of
Artemis, Hanging Gardens, Statue of Zeus, Mausoleum, Pyramids). Great Works are Windamere places.

## 6. Checklist for a new card or system

1. Name not on the blocklist, and not a near copy (Sawmill → "Saw Mill" is still a copy).
2. Cost and effect not lifted from a 7 Wonders card, even renamed.
3. Uses our vocabulary (§5) and our numbers (RULES.md).
4. If it touches a system in §3, it obeys our replacement, not the original.
5. Kinds and icons follow ART.md, never the 7 Wonders colour map.

## 7. Decisions (H1, the human, 2026-10-29)

1. **Goods**: not Colonizers' five; a set unique to this game. Done: reed, peat, salt, wax, horn
   (RULES.md, top).
2. **Pick**: a single pick (Build or Spend one card), not the pair. Done: R4.1, cadence R3,
   2-player R14.
3. **Neighbour trade**: "whatever is closest to the original game", with our mechanism and
   numbers. Done: R6.6-R6.7, row 5, checked against research's traps (R4 §5.2): the good moves
   out of the seller's store (not capacity), the price is by Season (1, 3, 4, 5: not flat 2
   and no Season at 2, research R4 §5.3; not Duel's formula), a limit of 2 per neighbour a turn,
   and no card makes buying cheaper.
