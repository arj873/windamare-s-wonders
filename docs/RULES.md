# Windamere's Wonders: rules (card D2)

Owner: design lane. Status: **draft for human review** (2026-10-29). Nothing here is
implemented or playtested yet.

- Rule numbers (**R4.2**) are stable once approved; engine and qa tests cite them. A rule that is
  dropped keeps its number, marked _(retired)_.
- Numbers marked † are first-pass tunables, untested. They all live in one table (**R16**) so the
  engine can load them as data and the bots sim (B1) can tune them.
- Card data (costs, Spend bands, effects, counts) is in `docs/design/CARDS.md`. These rules say
  how cards work; the catalog says which cards exist.
- Originality: `docs/design/ORIGINALITY.md` is the line. Terms used here (Season, Great Work,
  Guard, Lore, upgrade) are ours on purpose.

Words: **town** = a player's seat and everything in it. **Renown** = victory points.
**Store** = a town's goods. **Uncovered** = in the town and not covered by an upgrade (R7.9).

## R1. Components and information

- **R1.1** 2 to 7 towns, each a human or a bot. 3 to 7 use these rules; 2 use the variant in R14.
- **R1.2** Goal: the most Renown after the Winter Raid (R12).
- **R1.3** Goods: five types, in this fixed **goods order**: lumber, brick, wool, grain, ore. The
  supply is unlimited. A town's goods are its **store**.
- **R1.4** Coins: unlimited supply.
- **R1.5** Labour: a counter on the town's Great Work track (R8). It is never spent or lost.
- **R1.6** Cards: four Season decks (Spring, Summer, Autumn, Winter). Every card has a name, a
  kind (R7), a Season, a cost (R6, may be free), a **Spend band** (R5), effects (R13), and a copy
  count for each seat count (CARDS.md).
- **R1.7** Kinds: Holding, Hall, Market, Watch, Lore, Landmark.
- **R1.8** Great Works: a pool of 14 (CARDS.md). Each has a Perk and four tiers (R8).
- **R1.9** Raid cards: three per Season, each with a strength (R9, CARDS.md).
- **R1.10** Honours: a pool of 8 (R11, CARDS.md).
- **R1.11** Public: every town's store, coins, labour, Great Work, tiers, town cards (including
  covered ones), Valour, the chosen Honours, the current Season's Raid, hand sizes, and whether
  each town has picked. Hidden: hands, picks before the reveal, the decks, the discard pile,
  Great Work offers until chosen, and the Raids of later Seasons.

## R2. Setup

- **R2.1** Seats sit in config order, clockwise. A town's **left neighbour** is the next seat
  clockwise, its **right neighbour** the previous one. With 3+ seats these are two different
  towns.
- **R2.2** Each town starts with 5† coins, no goods, 0 labour.
- **R2.3** Shuffle the Honours pool and reveal 3†. They are public all game.
- **R2.4** Shuffle the Great Works pool and deal 2† to each town, face down.
- **R2.5** Every town chooses one of its two at the same time, hidden. A choice may change until
  the last town has chosen. Then all chosen Great Works are revealed together; the others leave
  the game unseen. Perks are active from this moment.
- **R2.6** For each Season, draw one of its three Raid cards at random and keep it face down.
  Reveal the Spring Raid.
- **R2.7** Build each Season deck from CARDS.md for the seat count (2 seats use the 3-seat
  counts, R14.1) and shuffle it.

## R3. Seasons

- **R3.1** The game has four Seasons in order: Spring, Summer, Autumn, Winter.
- **R3.2** Season start: reveal the Season's Raid (Spring's is already up), then deal 9† cards
  from the Season deck to each town.
- **R3.3** Pass direction: Spring left, Summer right, Autumn left, Winter right.
- **R3.4** A Season has 4† turns (R4).
- **R3.5** After the fourth turn's picks are revealed, the one card left in each hand is
  discarded face down, before that turn resolves.
- **R3.6** Season end, after the fourth turn resolves: the Raid (R9), then every "at Season end"
  effect in seat order. Then the next Season starts; after Winter the game ends (R12).
- **R3.7** **Winter has no Yield** (R4.5 step 4 is skipped in all four Winter turns).

## R4. A turn

- **R4.1** **Pick.** Every town picks at the same time, in secret: **two different cards** from
  its hand, each given a role, **Build** or **Spend**. At most one card may Build. So a pick is
  either Build + Spend or Spend + Spend.
- **R4.2** A Build is legal only if the town can pay its cost (R6) from its store and coins
  **plus the gains of the card it Spends this turn** (R5.2), and the card's own build rules hold
  (R7.8 Landmarks, R7.9 upgrades).
- **R4.3** A pick also names every choice it needs: the good for an "any good" Spend gain, how
  each missing good is paid (R6.3), which goods a discount removes (R6.1), which card an upgrade
  covers (R7.9). Defaults: R15.7.
- **R4.4** A town may change or withdraw its pick until the last town submits. When the last
  pick arrives, all picks lock and are revealed together (both cards and their roles).
- **R4.5** **Resolve**, in four steps. Each step runs for every town before the next step starts
  (lockstep, R4.8).
  1. **Spend**: each town gains the Spend bands of the cards it Spent (R5). Spent cards go to the
     discard pile.
  2. **Build**: each town pays for and places its Build card (R6, R7). "When built" effects
     happen now. Then the Great Work check (R8.3).
  3. **Caravans**: effects that react to a neighbour's Build this turn (R13 `caravan`).
  4. **Yield** (not in Winter): every active `yield` and `income` effect (R13.1) pays out. Then
     the Great Work check (R8.3).
- **R4.6** **Pass.** Each town passes the rest of its hand in the Season's direction. The next
  turn starts.
- **R4.7** Steps 1, 2 and 4 read only the town's own pick and state. Step 3 reads which cards the
  neighbours Built in step 2, and only adds coins. So a pick that was legal when submitted is
  still legal when it resolves, and seat order never changes the outcome.
- **R4.8** **Lockstep.** All towns resolve the same turn together, and hands pass (R4.6) only
  after every town has resolved. Within a step, an effect may read its own town as it stands but
  reads other towns only as they stood when the step began. So towns may be processed in any
  order with the same result; seat order only orders the log. The order in which picks arrive
  never matters (R15.9).
- **R4.9** There is no "draft ahead" (picking from the next hand before the table has resolved).
  _Note for a later async mode (research online-ux.md §5 Q1):_ the only rule that ties a turn to
  the neighbours' picks is the Caravan (step 3), whose coins can decide what a town affords next
  turn. An async mode would move Caravan payouts to Season end first. Season ends (Raid, bounty,
  the new deal) are a full-table sync anyway.

## R5. Spend bands

- **R5.1** Every card shows a Spend band: a list of gains. A gain is a number of one good, coins,
  labour, or "any good" (one good of the town's choice per unit).
- **R5.2** Spend gains arrive in step 1, so they can pay for the same turn's Build.
- **R5.3** A Spent card is discarded face down. It never counts as built and counts for nothing.
- **R5.4** Effects may add to Spend gains (R13 `spendBonus`). The bonus is part of step 1.

## R6. Costs and paying

- **R6.1** A cost is a list of goods and coins, or free. Effects may lower a cost (R13
  `discount`); no part of a cost goes below 0.
- **R6.2** Pay each good in the cost from the store. Pay coins from coins.
- **R6.3** For each good the store lacks, pay one of:
  1. **Bank**: 3† coins.
  2. **Exchange**: an uncovered card with an `exchange` effect for good X lets the town pay 2† X
     instead of the missing good. An Exchange may be used any number of times in a turn. X cannot
     be the missing good itself.
- **R6.4** Paid goods and coins return to the supply. Store and coins never go below 0. A Build
  the town cannot pay for is not legal (R4.2).
- **R6.5** Which goods are "missing" is decided after the town's own goods of each type are used
  first: a town may not buy a good from the bank while holding enough of it.

## R7. Kinds, building, upgrades

- **R7.1** A built card stays in the town for the rest of the game, in build order, unless it is
  covered (R7.9).
- **R7.2** **Holding**: produces, through a `yield` (gains at each Yield) or a `seasonEnd`
  effect (gains at each Season end).
- **R7.3** **Hall**: worth printed Renown.
- **R7.4** **Market**: coins, Exchanges and Caravans.
- **R7.5** **Watch**: adds Guard (R9).
- **R7.6** **Lore**: has a rank from 1 to 6 (R10).
- **R7.7** **Landmark**: scores at game end by its condition (R12.2e).
- **R7.8** A town may build several copies of the same card, except a **Landmark**: at most one
  copy of each Landmark per town.
- **R7.9** **Upgrades.** A card that lists "upgrades X" and an **upgrade cost** may be built for
  its upgrade cost if the town has an uncovered X; the pick names which X. That X is then
  **covered**: it stays visible under the new card but has no effects, no Renown, no Guard, no
  rank, and does not count toward any count of cards or kinds. A covered card cannot be
  uncovered. The town may instead build the upgrade card at its full cost and cover nothing.
- **R7.10** Every count of cards in these rules ("number of Halls") counts uncovered cards only.

## R8. Great Works

- **R8.1** A Great Work has a **Perk**, active from the reveal (R2.5) to the end, and four tiers,
  I to IV. Each tier has a **labour threshold** and a **reward**. Thresholds rise from tier to
  tier; the standard set is 3, 7, 12, 18† (each Great Work may differ, CARDS.md).
- **R8.2** Labour comes from Spend bands, `yield` effects and other effects that say labour. It
  only ever goes up.
- **R8.3** **Great Work check**: while the town's labour is at or above the threshold of its next
  tier, that tier completes and its reward applies at once. Several tiers may complete in one
  check, in order. The check runs after step 2 and after step 4 of every turn (R4.5).
- **R8.4** Rewards are R13 effects: Renown (scored at the end), one-off gains (an `onBuild` on a
  tier pays when the tier completes), or a lasting effect (e.g. `guard`, `yield`, `lore`), which
  counts from the moment the tier completes.
- **R8.5** Labour beyond the tier IV threshold does nothing.
- **R8.6** Completed tiers count for the tie-break (R12.4) and the Master Builder Honour.

## R9. Raids

- **R9.1** A Raid card has a **strength**. Each Season's Raid is public from the start of that
  Season (R3.2) so towns can prepare.
- **R9.2** A town's **Guard** is the sum of `guard` effects on its uncovered cards and completed
  tiers, plus any other effect that adds Guard.
- **R9.3** At Season end, every town compares its Guard with the Raid's strength, all at once.
- **R9.4** **Held** (Guard ≥ strength): the town gains a Valour token worth the Season's Valour
  value: Spring 1†, Summer 2†, Autumn 3†, Winter 4† Renown.
- **R9.5** **Plundered** (Guard < strength): the town loses 1 coin for each point it falls short,
  or all its coins if it has fewer. It gains no Valour. Goods, labour and cards are never lost.
- **R9.6** **Bounty**: after all plunder, each town that held gains 1† coin for each of its
  neighbours that was plundered (at most 2; with 2 seats at most 1).
- **R9.7** Guard does not carry a surplus: Guard above the strength gives nothing more. Guard is
  not used up; it is compared again at the next Season's end.

## R10. Lore

- **R10.1** Each Lore card has one rank from 1 to 6. A completed tier may also give a rank (R13
  `lore`); it counts like a Lore card for R10 only (not as a card or a kind).
- **R10.2** Take the set of distinct ranks among a town's uncovered Lore cards and completed
  tiers. A **run** is a longest possible block of consecutive ranks in that set.
- **R10.3** Each run scores by its length: 1 → 1, 2 → 3, 3 → 6, 4 → 10, 5 → 14, 6 → 18† Renown.
- **R10.4** A second card of a rank the town already has adds nothing to any run.
- **R10.5** Example: ranks 1, 2, 4, 5, 6, 5 → set {1, 2, 4, 5, 6} → runs {1, 2} and {4, 5, 6} →
  3 + 6 = 9 Renown. Adding a 3 joins them into one run of 6: 18 Renown.

## R11. Honours

- **R11.1** Three Honours are revealed at setup (R2.3). Each names a **measure** of a town.
- **R11.2** At game end, the town with the highest measure gains 5† Renown. If several towns tie
  for highest, each of them gains 2†. A measure of 0 never wins.
- **R11.3** The leader of each Honour is shown all game; only the end result counts.
- **R11.4** The pool, as Honour: measure (`measure id` for data and R13 `scoreBeat`):
  - Warden: Guard (`guard`)
  - Steward: number of Holdings (`holdings`)
  - Patron: number of Halls (`halls`)
  - Merchant: number of Markets (`markets`)
  - Sage: length of the longest Lore run (`loreRun`)
  - Master Builder: completed Great Work tiers (`tiers`)
  - Treasurer: coins (`coins`)
  - Broad Town: number of different kinds among its cards, at most 6 (`kinds`)

## R12. End of game and scoring

- **R12.1** The game ends after the Winter Raid and Winter's Season-end effects.
- **R12.2** Each town scores Renown in these categories:
  - a. **Buildings**: printed Renown (`renown` effects) on its uncovered cards.
  - b. **Great Work**: Renown from completed tiers.
  - c. **Valour**: its Valour tokens (R9.4).
  - d. **Lore**: R10.
  - e. **Landmarks**: each uncovered Landmark's `score…` effect (R13).
  - f. **Honours**: R11.
  - g. **Treasury**: 1 Renown per 4† coins, rounded down. Goods score nothing.
- **R12.3** The town with the most Renown wins.
- **R12.4** Tie: the most completed Great Work tiers wins; still tied, the most coins; still
  tied, the tied towns share the win.
- **R12.5** The full ranking of all towns uses the same order (R12.3, then R12.4).

## R13. Effect vocabulary

Cards, Perks and tier rewards use only these effect types. Each is data: `{ type, ...params }`.
`gains` is an object like `{ "brick": 1, "coins": 2, "labour": 1, "any": 1 }` ("any" = any good,
chosen by the town). `kind` is one of the six kinds. **When** says when the effect acts.

| Type             | Params                     | When                   | Meaning                                                                                       |
| ---------------- | -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `yield`          | `gains` (no "any")         | step 4                 | Gain `gains` each Yield. Holdings.                                                            |
| `income`         | `coins`                    | step 4                 | Gain coins each Yield. Markets.                                                               |
| `onBuild`        | `gains`                    | step 2, once           | Gain `gains` when this card is built ("any" chosen in the pick).                              |
| `onBuildPerKind` | `kind`, `gains`            | step 2, once           | Gain `gains` once per uncovered card of `kind` in the town, this card included if it matches. |
| `renown`         | `amount`                   | end (R12.2a)           | Worth `amount` Renown.                                                                        |
| `guard`          | `amount`                   | Season end (R9)        | Adds `amount` Guard.                                                                          |
| `lore`           | `rank` (1-6)               | end (R10)              | This card's (or tier's) Lore rank.                                                            |
| `exchange`       | `good`                     | paying (R6.3)          | Pay 2† `good` in place of one missing good of another type.                                   |
| `discount`       | `kind`, `amount`           | paying (R6.1)          | Cards of `kind` cost `amount` fewer goods (the town picks which goods; default: goods order). |
| `caravan`        | `kind` (optional), `coins` | step 3                 | Gain `coins` for each neighbour that Built a card (of `kind`, if given) this turn.            |
| `spendBonus`     | `kind`, `gains`            | step 1                 | When the town Spends a card of `kind`, also gain `gains`.                                     |
| `buildBonus`     | `kind`, `gains`            | step 2                 | When the town Builds a card of `kind` (not this card itself), also gain `gains`.              |
| `heldBonus`      | `gains`                    | Season end, after R9.6 | Gain `gains` each time the town holds a Raid.                                                 |
| `seasonEnd`      | `gains`                    | Season end (R3.6)      | Gain `gains` at the end of each Season, after the Raid.                                       |
| `scorePerKind`   | `kind`, `amount`           | end (R12.2e)           | `amount` Renown per uncovered card of `kind` in the town.                                     |
| `scorePerTier`   | `amount`                   | end (R12.2e)           | `amount` Renown per completed Great Work tier.                                                |
| `scorePerValour` | `amount`                   | end (R12.2e)           | `amount` Renown per Valour token.                                                             |
| `scoreSets`      | `amount`                   | end (R12.2e)           | `amount` Renown per full set of Holding, Hall, Market, Watch and Lore in the town.            |
| `scoreGoods`     | `per`, `amount`            | end (R12.2e)           | `amount` Renown per `per` goods left in the store.                                            |
| `scoreBeat`      | `measure`, `amount`        | end (R12.2e)           | `amount` Renown per neighbour whose `measure` is strictly lower (measures as in R11.4).       |

Rules for effects:

- **R13.1** Effects act only while their card is uncovered (or, for a tier, once it is complete).
- **R13.2** Only Spend gains (R5.2) can pay for the same turn's Build. `onBuild`, `buildBonus`,
  `caravan`, `yield`, `income` and tier rewards all arrive after the Build is paid.
- **R13.3** A new effect type needs a rules change here first, then an engine handler.
- **R13.4** "any" appears only in Spend bands and in a card's own `onBuild`, where the pick names
  the good (R4.3). Effects that act outside a pick (`yield`, `caravan`, `heldBonus`, `seasonEnd`,
  tier rewards) never use it. So resolution never stops to ask a town a question (R15.10).

## R14. Two-player variant

- **R14.1** Use the 3-seat card counts. Deal 12† cards to each town per Season; the 3 extra
  cards of each Season deck stay undealt and unseen.
- **R14.2** Each turn a town picks **three** cards: at most one Build, exactly one **Burn**, and
  Spend for the rest (Build + Spend + Burn, or Spend + Spend + Burn).
- **R14.3** A burned card is discarded face down with no effect. The other town sees that a card
  was burned, not which.
- **R14.4** After 4 turns both hands are empty; there is no leftover card (R3.5 does not apply).
- **R14.5** Each town's only neighbour is the other town. It counts once wherever these rules or
  cards say "each neighbour" (bounty, `caravan`, `scoreBeat`).
- **R14.6** Everything else is unchanged.

## R15. Timers, defaults and online play

These answer the open questions from net (MULTIPLAYER.md §2.1, §6) and research (online-ux.md
§4.3, §5).

- **R15.1** Seat range: 2 to 7 (R1.1). Bots count as seats.
- **R15.2** **Changing a pick.** A town may change or withdraw its pick until the last pick of
  the turn arrives (R4.4); there is no early lock. Whether a town has picked is public (a ready
  mark on its seat); what it picked stays hidden until the reveal.
- **R15.3** **Turn clock.** One clock per turn, shared by the whole table (not a clock per
  player). It starts when the hands are dealt or passed. Normal lengths by turn of the Season:
  90, 70, 55, 40† seconds; the Great Work choice: 60† seconds. Room options: Off, Relaxed
  (× 1.5), Normal, Fast (× 0.5), rounded up to whole seconds (Fast: 45, 35, 28, 20 s). Default:
  Normal online, Off in hotseat. Research suggests 30-45 s per pick (online-ux.md §4.3); ours is
  longer because a pick is two cards with roles from up to 9, not one card from 7. The clock is a
  cap: on Normal the whole game stays under 25 minutes (R18).
- **R15.4** When the clock runs out, every town without a pick gets the timeout pick (R15.6), and
  the turn resolves.
- **R15.5** **Away towns** (the player's connection dropped; net decides when a seat counts as
  away). When every town that is not away has picked:
  1. the turn waits up to 15† more seconds (the **away wait**, never past the clock) for away
     towns to come back and pick;
  2. then each away town still without a pick gets the timeout pick, and the turn resolves.

  The away wait applies with the clock Off too, so one dropped player never stalls the table for
  long. A connected town that has not picked is always waited for (up to the clock, if on). A
  town away longer than net's grace period is played by a bot until its player returns
  (MULTIPLAYER.md §2.1.1).

- **R15.6** **Timeout pick**: the pick the Easy bot (bots lane) would make for that town from the
  town's own view, so a timed-out player still gets a sensible turn. **Fallback pick**, used
  until that bot exists and in engine tests (the engine's `defaultPick`): Build nothing; Spend
  the first two cards in hand order (2 seats: Spend the first two, Burn the third). Great Work
  choice: the first offered.
- **R15.7** **Default choices** (UI preselects them; timeouts and simple bots use them):
  - payment: the plan that spends the fewest coins, then the fewest goods; Exchanges in town
    order, goods in goods order;
  - "any good" gain: the first good (goods order) the paired Build is missing; if none, the good
    the town holds fewest of (ties: goods order);
  - upgrade: cover the first matching card in town order;
  - discount: take it off goods in goods order.
- **R15.8** **Recall.** A town may look at the cards it saw in each hand it passed on, until the
  Season ends. (So a bot that remembers has no edge over a human; the engine or UI provides it.)
- **R15.9** **Resolution order.** All picks of a turn are applied together, in lockstep (R4.8).
  The order in which picks arrive never matters, so a fast clicker gains nothing and a replay of
  the same picks gives the same game.
- **R15.10** **Decisions outside a pick.** There is one: the Great Work choice (R2.5). It uses the
  pick flow: hidden, changeable until the last choice arrives, ready marks, its 60† s clock, the
  away wait and a timeout pick (the first offered). Every other choice travels with a pick
  (R4.3, R13.4); no rule or card asks a question during resolution.
- **R15.11** **Hotseat with two or more humans.** Each human picks behind a cover screen ("Pass to
  <name>"). A human's pick locks when they hand the device on; the reveal follows the last
  human's pick. Bots pick without waiting. With one human, R4.4 applies unchanged.

## R16. Tunables

| Constant                    | Value                                    | Rule        |
| --------------------------- | ---------------------------------------- | ----------- |
| Starting coins              | 5                                        | R2.2        |
| Honours per game            | 3 of 8                                   | R2.3        |
| Great Works offered         | 2 of 14                                  | R2.4        |
| Hand size (3-7 seats)       | 9                                        | R3.2        |
| Turns per Season            | 4                                        | R3.4        |
| Cards per pick (3-7 / 2)    | 2 / 3                                    | R4.1, R14.2 |
| Bank price per missing good | 3 coins                                  | R6.3        |
| Exchange rate               | 2 of one good → 1 other                  | R6.3        |
| Tier thresholds (standard)  | 3, 7, 12, 18 labour                      | R8.1        |
| Valour by Season            | 1, 2, 3, 4                               | R9.4        |
| Plunder                     | 1 coin per point short                   | R9.5        |
| Bounty                      | 1 coin per plundered neighbour           | R9.6        |
| Lore run scores             | 1, 3, 6, 10, 14, 18                      | R10.3       |
| Honour award (sole / tied)  | 5 / 2                                    | R11.2       |
| Coins per Renown            | 4                                        | R12.2g      |
| Hand size (2 seats)         | 12                                       | R14.1       |
| Turn clock (Normal)         | 90, 70, 55, 40 s; Great Work choice 60 s | R15.3       |
| Clock options               | Off, Relaxed × 1.5, Normal, Fast × 0.5   | R15.3       |
| Away wait                   | 15 s                                     | R15.5       |

## R17. Clarifications

- **R17.1** You must take exactly two cards each turn (three with 2 seats); you may not pass.
- **R17.2** Spend + Spend is always legal, so every town always has a legal pick.
- **R17.3** A Holding built this turn yields in this turn's step 4 (not in Winter).
- **R17.4** A Caravan triggers on upgrades too: an upgrade is a Build.
- **R17.5** Tier rewards from the step 2 check cannot pay for anything this turn (the Build is
  already paid); they are available from the next turn.
- **R17.6** Plunder takes coins only. A town with 0 coins loses nothing but still gains no Valour.
- **R17.7** Covered cards still show in the town (public history) but count for nothing (R7.9).
- **R17.8** Cards count for Honours, Landmarks and `onBuildPerKind` at the moment they are
  checked; Honours and Landmarks are checked only at game end.

## R18. Length estimate (untested)

16 turns. Assumed pick time: 45-75 s early in a Season, 20-30 s late. With 5-7 towns each turn
waits for the slowest picker.

| Part                                    | No clock (slow table) | Normal clock (cap) |
| --------------------------------------- | --------------------- | ------------------ |
| Picks, 16 turns                         | 16 × 70 s ≈ 19 min    | 4 × 255 s = 17 min |
| Reveal animation, about 6 s a turn      | 2 min                 | 2 min              |
| Great Work choice, 4 Raids, final score | 3 min                 | 3 min              |
| **Total**                               | **about 24 min**      | **at most 22 min** |

That is **under the 25-35 target** (research suggests 20-30 for browser play). If the human
wants 25-35, the lever is a fifth turn per Season: hand 11, 20 turns, about 30 minutes. To be
measured in playtests (qa) and with bots (B1).
