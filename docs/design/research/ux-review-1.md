# UX review 1: the playable table vs our online-UX benchmarks (card R6)

Owner: research lane. Date: 2026-10-30. Build: main `9a7a293` (U3 hotseat vs bots).
Benchmarks: `docs/design/research/online-ux.md` (R2), with colonist.io and BGA as the bar.

**Method.** Heuristic review, not a user test. I drove the game in headless Chrome through
playwright 1.63 (`/usr/bin/google-chrome-stable`) against `pnpm dev`:

1. Desktop 1440×900: one human + 3 Normal bots, clock Off, a full game (Great Work choice, 20
   turns, final scores).
2. Desktop 1440×900: clock 30 s, 12 turns of Spends, then a late-game Build popover.
3. Phone 390×844 (touch): setup, Great Work choice, table, 12 turns, a late Build popover.
4. Desktop: two humans + 2 bots in hotseat, through the cover screens.

Screenshots and logs are in `/home/blop/projects/sevenwonders/.scratch/research/ux/`
(`desktop/`, `desktop2/`, `phone/`, `probe2/`; not committed). Not tested: online rooms,
animation timing (static screenshots only), screen readers beyond the ARIA labels, colour-blind
simulation, reduced motion.

---

## 1. Top 10 issues, ranked

| #   | Sev  | Screen                              | What is wrong                                                                                                                                                                                                                                                                                                                                                 | Suggested fix                                                                                                                                                                                                                                           | Lane    |
| --- | ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | HIGH | Table: hand                         | **You can't tell what you can build until you tap each card.** Hand cards show cost and effect but no affordability. Legality depends on store, coins and neighbours' stores (R4.2, R6.6), so the player has to open every card. R2 benchmark #3 ("show affordability on the card before the tap") is not met.                                                | A badge on each hand card from the engine's legal picks: "✓ Build", "Build: buy 2 (5g)", or "✗ can't build". Add the total coin cost of the default payment                                                                                             | ui      |
| 2   | HIGH | Table: pick popover                 | **The highlighted default can spend your whole purse at the bank.** Turn 1, Hurdle Fence (guard 1): the primary Build is "Reed from the bank (5g)" with 5 coins in hand. After it, coins 0 and the Renown estimate drops from ~1 to ~0. Nothing warns that the bank charges 5 while neighbours sell at the Spring price of 1 once they hold the good.         | Show the coin effect on the Build button ("Coins 5 → 0"). Mark bank purchases in a warning colour. When the only payment is the bank, don't style Build as the primary action                                                                           | ui      |
| 3   | HIGH | Phone 390×844: table                | **The hand doesn't fit and isn't pinned.** The hand is a horizontal strip showing about 2.5 of 6 cards; the page is 1363-1670 px tall, so the hand scrolls away under the town, table list and log. R2 benchmark #4 (the hand fits on screen; Sushi Go app's conveyor-belt complaint) is not met.                                                             | Pin the hand to the bottom on phones: six compact cards (two rows of three, or a fan) with tap-to-zoom. Move the Table list and Log into tabs or drawers                                                                                                | ui      |
| 4   | HIGH | Table: reveal, Season end           | **Interaction happens off-screen.** The "Revealed: pick N" panel lists builds and spends but not purchases, sales or coins moved. Raid results, plunder and bounty appear only as log lines. There's no Season summary card (UX.md §10.1). Trade and bounty are now our main interaction (R4 D1), and the genre's top complaint is interaction you can't see. | Revealed panel: add "bought Peat from Bot Blue (3g)" lines and animate coins between seats. Season end: a summary card with each town's Raid result, plunder and bounty, and the next pass direction (UX.md §10.1). Engine E3 already logs typed events | ui      |
| 5   | MED  | Table: hand cards                   | **Card text is cut off** at 1440×900 and on phone. Examples: Citadel's and High Hall's Spend bands, Harvest Home's "+3 any goods", phone cards "Spend: +1 Peat, 1 lab…". Costs are spelled out ("2 Reed 2 Peat 2 Wax"), which eats the space.                                                                                                                 | Use art's goods icons (A5) for costs and Spend bands. Allow a two-line Spend band. Give the hand more height (see #10)                                                                                                                                  | ui, art |
| 6   | MED  | Table: cards and tableau            | **Kinds are hard to tell apart.** Every card header is the same blue; the kind shows only as a small glyph and a footer label, and the Holding ⬢ and Market ● glyphs look alike at 12-14 px. Tableau chips have the same problem.                                                                                                                             | Colour the header band by kind with art's new palette (R4 O1 fix, A3/A4). Keep glyph and label as the second cue, and make the Holding and Market shapes clearly different                                                                              | art, ui |
| 7   | MED  | Table: town, neighbours, table list | **Stat rows are unlabelled icon strings**, repeated three times per town (neighbour panel, your town, table list): coins, "~N", Guard, Great Work, labour, five goods, kind counts. Labels exist only as hover titles, so touch users get none. "~28" doesn't say it's the score.                                                                             | Label the score ("Score ~28") and Guard on your own town. Tap-to-explain on touch. Drop one copy: neighbours already have side panels, so the Table list could show only the others                                                                     | ui      |
| 8   | MED  | Menu                                | **No rules, no card list, no Recall.** The menu has Bot speed, Animations and New game. R15.8 (Recall: the cards you saw in each hand you passed) is a rule the UI must provide. R2 §4.2 asks for the card pool and "cards still to come"; R2 §4.6 asks for a short guided first round.                                                                       | Menu: "How to play" (one page), "Cards" (catalog by Season with counts for this seat count), and a "Seen this Season" drawer by the hand. Tutorial later                                                                                                | ui      |
| 9   | MED  | Setup: pick timer                   | **Timer options don't match R15.3.** Setup offers a flat Off / 30 s / 45 s / 1 min / 90 s. R15.3 specifies Off / Relaxed / Normal / Fast, with Normal at 45, 40, 35, 30, 25 s by turn of the Season. Online must use the same values.                                                                                                                         | Replace the choices with R15.3's four options; show "45 s, shorter later in the Season" as the hint                                                                                                                                                     | ui, net |
| 10  | LOW  | Table: desktop layout               | **Space goes to the wrong places.** The town panel takes about 40% of the screen and is mostly empty, while hand cards are small and clipped (#5). The Log panel clips its newest line at 1440×900 (cut in `desktop/06`, `12` and `14`).                                                                                                                      | Size the town to its content, give the hand about 30% more height, and keep the Log scrolled to the newest line with no clipping                                                                                                                        | ui      |

Also seen, not in the top 10: one 404 resource on first load (likely a missing favicon).

---

## 2. Benchmarks from online-ux.md

| Benchmark (R2)                                            | Status                | Evidence                                                                                                                                                                                   |
| --------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared pick clock, auto-pick on timeout                   | Partly                | Clock ring shows (0:29) when on; options differ from R15.3 (#9). Timeout pick not observed                                                                                                 |
| Ready marks, never the picks                              | Met                   | Seat chips ⋯ / ✓ with ARIA labels ("Bot Blue: picked"); picks hidden until the reveal                                                                                                      |
| App does the arithmetic (costs, payment)                  | Met, mostly           | Popover computes the payment and offers each source (Bot Blue 3g / Bot Orange 3g / 2 Salt / Bank 5g), greyed when unavailable. Missing on the hand itself (#1) and on the coin effect (#2) |
| Hand fits on screen                                       | Desktop yes, phone no | 6 cards fit at 1440×900; phone shows about 2.5 (#3)                                                                                                                                        |
| Bot difficulty levels                                     | Met                   | Easy / Normal / Hard per seat in setup; Bot speed in the menu                                                                                                                              |
| Round and pick counter, pass direction                    | Met                   | "Summer · Pick 1 of 5 · hands pass ▶ to Bot Orange", arrows on neighbour panels                                                                                                            |
| Neighbours' key numbers always visible                    | Met                   | Side panels with coins, Guard, Great Work, labour, store and tableau                                                                                                                       |
| Live score estimate                                       | Met                   | "~N" per town; my estimate read ~47 before the end and the final was 47. Needs a label (#7)                                                                                                |
| Change pick before the reveal                             | Met                   | "Change pick" (Z) button                                                                                                                                                                   |
| Reveal ≤ 1.5 s, skippable; payments animate between seats | Not checked           | Static screenshots only; trades are not in the reveal panel (#4)                                                                                                                           |
| Card pool and "cards still to come"                       | Missing               | #8                                                                                                                                                                                         |
| Hotseat cover screens                                     | Met                   | "Hotseat: hide your cards · Pass to Player 1 · I'm Player 1, show my hand" on a blank table                                                                                                |
| Short guided first round                                  | Missing               | #8                                                                                                                                                                                         |
| One-handed portrait play                                  | Not yet               | Setup works well on phone (sticky Start button); the table doesn't (#3)                                                                                                                    |

## 3. What already feels good

- **Setup** is clean and quick: seats, colours, bot levels, shuffle order, a sticky Start button,
  and it works on a phone.
- **Great Work choice** shows both offers with every tier spelled out and says that the choice is
  hidden and changeable.
- **The payment popover** is the strongest piece: sources side by side with prices, unavailable
  ones greyed, the cheapest plan preselected, keyboard keys (B / S, 1-9, Esc).
- **The top bar** answers "where are we?" at a glance: Season, pick, pass direction, this
  Season's Raid, market price.
- **Final scores** break each town down by our six groups (Town, Great Work, Raids, Lore,
  Honours, Purse), with clear ranking and Rematch / New game.
- **Hotseat** hides everything behind the cover card; no leak seen.

## Sources

- `docs/design/research/online-ux.md` (benchmarks), `docs/RULES.md` R4.2, R6.6, R15.3, R15.8,
  `docs/design/UX.md` §7.1, §10.1
- Screenshots: `/home/blop/projects/sevenwonders/.scratch/research/ux/` (local only)
