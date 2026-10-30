# UX review 2: re-check of R6 after ui's fixes (card R7)

Owner: research lane. Date: 2026-10-30. Build: main `4fb5baf` (ui R6 fixes #1-#10, PR #53; fx
reveal, PR #54). Previous review: `ux-review-1.md` (R6, main `9a7a293`).

**Method.** Heuristic review, not a user test. I drove the game in headless Chrome
(playwright 1.63, `/usr/bin/google-chrome-stable`) against `pnpm dev`:

1. Desktop 1440×900: one human + 3 Normal bots, Normal clock, a full game (20 turns, three
   Season cards, final scores), opening every hand card's popover each turn.
2. Phone 390×844 (touch): the same, plus the Table & log drawer and scrolling with the hand up.
3. A clock probe: Normal clock, read the timer when the Season card opens and again after it
   closes.

Scripts, screenshots and logs are in `/home/blop/projects/sevenwonders/.scratch/research/ux/`
(`r7.mjs`, `r7-clock.mjs`, `r7-desktop/`, `r7-phone/`; not committed). Skipped, as the card asks:
help tooltips, kind colours and fx's F3 moments (ui is wiring them next). Not tested: two-human
hotseat (not re-run; R6 found it sound), online rooms, reveal animation timing (static
screenshots only), screen readers beyond ARIA labels, colour-blind simulation.

---

## 1. R6 top 10, re-checked

| #   | R6 issue                                   | Now     | Evidence                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No affordability on hand cards             | Fixed   | Every hand card has a badge: "✓ Build · 3g", "Build: buy 2 · 10g", "Build: bank · 16g" (warning tone), "✗ Spend only". Also in the card's ARIA label. Shown on phone too                                                                                                                                                   |
| 2   | Default Build spends the purse at the bank | Fixed   | Each use shows "Coins 6 → 0 · bank". When the only plan uses the bank, Spend is the highlighted use and the Bank option is marked in warning colour                                                                                                                                                                        |
| 3   | Phone hand doesn't fit, not pinned         | Fixed   | Hand is fixed to the bottom, 6 cards in two rows of three, 6 of 6 in view; it stays put when the page is scrolled to the end. Table list, reveal and log moved to a "Table & log" drawer. New phone issues: §2 #2, #3                                                                                                      |
| 4   | Interaction only in the log                | Fixed   | The Revealed panel lists purchases ("Bot Orange bought Peat from Player 1 (1g)"), bank fills with the reason ("bought Wax from the bank: Bot Blue ran short"), tolls, tier completions and Honour leads. A Season card lists each town's Raid result, plunder, bounty and the next pass direction. Coin motion not checked |
| 5   | Card text clipped                          | Fixed   | Desktop: no card field overflowed in a full game (checked by script each measured turn); long faces such as Wend Council House fit. Phone: neighbour panels clip their Great Work line                                                                                                                                     |
| 6   | Kinds look alike                           | Skipped | Per the card (ui wiring art's A8). On `4fb5baf` every card header is still the same blue                                                                                                                                                                                                                                   |
| 7   | Unlabelled stat rows                       | Fixed   | Your town reads "Coins 5 · Score ~3 · Guard 0 · Labour 0". Tapping any stat opens a short explanation (works on touch). The Table list shows only the score for you and your neighbours                                                                                                                                    |
| 8   | No rules, card list or Recall              | Partly  | "All cards" (by Season, with copies at this table size) and "Seen this Season (N)" (R15.8) sit in the hand header, one tap each. "How to play": tutorial's T2 overlay exists in `src/ui/help`, but nothing calls it yet (skipped: ui wiring)                                                                               |
| 9   | Timer options vs R15.3                     | Fixed   | Setup offers Off / Relaxed / Normal / Fast; the hint reads "45 s on a fresh hand, down to 25 s on the last turn of a Season; 60 s for the Great Work choice". net matches (`b14cb69`)                                                                                                                                      |
| 10  | Layout balance, log clipping               | Partly  | The Log keeps its newest line in view. The desktop town panel is still 550×512 px and mostly empty in Spring (built cards show as one-line chips), while hand cards stay 134 px wide                                                                                                                                       |

Seven of ten fixed, two partly, one skipped by the card. The hand is now the strongest part of
the table: on both screens you can see what you can afford before the first tap.

## 2. New top 5, ranked

| #   | Sev  | Screen              | What is wrong                                                                                                                                                                                                                                                                                                                                | Suggested fix                                                                                                                                                                                        | Lane    |
| --- | ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | HIGH | Season card         | **The turn clock runs while the Season card is up.** Measured on Normal: the clock showed 0:45 when the card opened and 0:37 when it closed itself 8.4 s later. That is about 18% of the first turn on Normal and about a third on Fast (23 s). `src/game/play.ts` pauses the clock only for hotseat covers. Reading the card costs you time | Pause the clock while the Season card is open, as for covers, and restart it on Continue or auto-close. Online: add the card's time to the first turn's deadline, or let players pick under the card | ui, net |
| 2   | MED  | Phone: hand         | **Phone cards hide what the card does.** At 390 px a card shows its cost, Spend band and badge, but not its effect: `.dt-card-text` is `display: none` (table.css, phone block). "Guard 1", "Each Yield: +1 Reed" and "2 Renown" need a tap per card, so R6 #1's "tap every card" is back for the effect                                     | Show the effect as one icon line (it decides the Build); shrink the Spend band to icons without the "SPEND" label if space runs out                                                                  | ui      |
| 3   | MED  | Phone: top bar      | **The top bar takes about 250 of 844 px.** The Season line wraps, then Raid + Market, clock + Table & log, the status line, and four seat chips over two rows. With the pinned hand (about 300 px), about 290 px are left for both neighbours and your town, and the neighbour panels cut off their Great Work line                          | Two lines on phones: Season · pick · arrow · clock, then seat chips as coloured dots with ✓. Move Raid and Market into the drawer or behind one tap chip                                             | ui      |
| 4   | LOW  | Reveal, Season card | **You are "Player 1" in the interaction lines.** Pick lines say "You built", but purchases, plunder and bounty say "Player 1 bought Wax from the bank", "Bot Orange bought Peat from Player 1 (1g)", "Player 1 was plundered". These are the lines R6 #4 added, so the player has to translate them                                          | Write "You" / "from you" for the viewer in the Revealed panel, Season card and log (in hotseat, the shown player). Other humans keep their names                                                     | ui      |
| 5   | LOW  | Pick popover        | **Disabled payment options don't say why on touch.** In "Get Wax", "Bot Blue 1g" is disabled with the reason only in a hover title. On phone the disabled "Bank 6g" (warning red on the dark row) is hard to read                                                                                                                            | Show the reason under the row ("Bot Blue has no Wax"), as disabled uses already do. Keep disabled text at 4.5:1 contrast                                                                             | ui      |

Also seen, not in the top 5: the ☰ menu button sits on top of the open drawer's heading on phone;
the phone final-scores card cuts names ("Bot Ora…"); no console errors or failed requests in
either game.

## 3. Benchmarks from online-ux.md that changed since R6

| Benchmark (R2)                      | R6                    | Now                                                            |
| ----------------------------------- | --------------------- | -------------------------------------------------------------- |
| Shared pick clock (R15.3 values)    | Partly                | Met, but it runs under the Season card (§2 #1)                 |
| App does the arithmetic             | Met, mostly           | Met: badges on the hand, coins before → after on each use      |
| Hand fits on screen                 | Desktop yes, phone no | Met on both                                                    |
| Card pool and "cards still to come" | Missing               | Met: All cards and Seen this Season                            |
| One-handed portrait play            | Not yet               | Partly: hand and drawer work; top bar and card faces (§2 #2-3) |

Still missing: the short guided first round (tutorial). Reveal timing: fx's reveal plays over
the table and the next hand is selectable at once (about 0.1-0.4 s after the last pick from turn
3 on; 1.0-2.7 s on turns 1-2), so the reveal never blocks input. Its length was not measured.

## 4. Seen in play, for other lanes

Two full games plus one short one; small samples, so these are leads, not results.

- **Turn 1 is mostly Spend-only** (design). In three games, 1-2 of the 6 opening cards could be
  built, all of them 3-coin Holdings. Stores start empty and the bank costs 6 against 5 starting
  coins (D8), so any card that costs a good is unbuildable on the first turn. The new badges make
  this very visible ("✗ Spend only" on 4-5 cards). Fine if intended; it touches R4's dead-turn
  risk (D6), now in Spring rather than Winter.
- **Bots skip Guard** (bots). Desktop game: all three Normal bots had Guard 0 all game, were
  plundered every Season, and every town scored 0 for Raids. Phone game: one bot had Guard 0 all
  game, the others reached 7-9.
- **Scores** (balance): 52 / 40 / 32 / 26 and 70 / 55 / 46 / 44. Winners 52 and 70, against the
  sims' winner median of 31-33 in `balance-targets.md` §5 (no Great Works then, before D8/D9).

## Sources

- `docs/design/research/ux-review-1.md` (R6), `docs/design/research/online-ux.md` (benchmarks),
  `docs/RULES.md` R15.3, R15.8, `docs/design/UX.md` §9, §10.1
- Code read: `src/game/play.ts` (clock pause), `src/game/local.ts` (clock),
  `src/ui/table/table.ts`, `src/ui/table/table.css` (phone block), `src/ui/help/index.ts`
- Screenshots and logs: `/home/blop/projects/sevenwonders/.scratch/research/ux/r7-*` (local only)
