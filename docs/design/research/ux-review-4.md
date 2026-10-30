# UX review 4: whole-game feel against the colonist.io bar (card R10)

Owner: research lane. Date: 2026-10-30. Build: main `86c28af` (R8 fixes, design's D9c re-tune,
8 neighbour cards). Previous: `ux-review-3.md` (R8).

**Method.** Heuristic review, not a user test. Headless Chrome (playwright 1.63,
`/usr/bin/google-chrome-stable`) against `pnpm dev`:

1. **Two full hotseat games**, desktop 1440×900, one human seat + 3 Normal bots, Normal clock,
   animations on, default Bot speed. The "player" is a script that reads each hand's badges and
   Builds the first (game 1) or last (game 2) buildable card, else Spends. It picks at once, so
   the timings below are the game's own overhead, not a human's.
2. **Learn to play**, played by following the coach (as in R8).
3. **Probes**: what the animation layer holds every 250 ms during reveals; the final-score totals
   every 400 ms after the game ends; a 3-turn 2-tab online game; the phone page width with each
   clock option; the log wording.

Scripts and logs: `/home/blop/projects/sevenwonders/.scratch/research/ux/` (`r10.mjs`,
`r10-fx.mjs`, `r8-*.mjs`; `r10-g1/`, `r10-g2/`, `r10-online/`). Not committed. Two games is a
small sample: the numbers are leads, not results. Not tested: a human's own pace, sound, the
real Worker server.

---

## 1. R8 top 5, re-checked

| #   | R8 issue                                                 | Now    | Evidence                                                                                                             |
| --- | -------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Following the coach skips core lessons                   | Fixed  | 14 of 14 lessons show for a player who picks when told to. Spend and Build now come before the pick                  |
| 2   | Phone page 408 px wide with a clock on                   | Fixed  | 390 px with Normal, Fast and Relaxed                                                                                 |
| 3   | Log in the third person; "You yields."                   | Fixed  | Hotseat and tutorial: "You are plundered (Guard 0 vs 1): −1 coin.", "You gather your stores."                        |
| 4   | No menu online                                           | Fixed  | The ☰ menu is on the online table                                                                                   |
| 5   | Online clock shows ✓ after you pick; "No clock" vs "Off" | Partly | The lobby now says "Off". After you pick, the ring still shows ✓ ("Pick locked") and not the time the table has left |

## 2. The whole game, as a player meets it

**Pace: fast.** The game never makes you wait. Bots pick while you think, the next hand is
selectable 0.1-0.4 s after the last pick (R7), and the reveal plays over the table without
blocking input. Estimate for a human (assumption: 15-20 s a pick): 20 picks plus the Great Work
choice and three Season cards is about 6-7.5 minutes. The Normal clock caps a game at about 13
minutes (R15.3: 175 s a Season × 4, 60 s for the choice, 8.4 s per Season card). That beats
colonist.io's ~15-minute 1v1 and our P5 target (≤ 15 min). Untested with a human.

**Seasons: clear, except the last.** Each Season opens with a banner (Season, Raid, strength).
The top bar keeps Season, pick N of 5, pass direction, Raid and price in view. Spring, Summer and
Autumn end with a Season card that lists every town's Raid result, plunder, bounty and the next
pass direction, and the clock waits for it. Winter, the largest Raid (strength 6-8 in these
games), gets no card: the game goes straight to final scores (§3 #1).

**Neighbour cards: half of them read well.** The rivalry cards read cleanly: "3 Renown per
neighbour with fewer Markets", "4 Renown per neighbour with fewer Valour tokens". The "weaker
neighbour" cards show raw effect names (§3 #2). None of them tells you whether you are winning
the comparison right now (§3 #4).

**End of game: the weakest moment** (§3 #1).

**Are the turns interesting? Mostly yes.**

| Measure (2 games)                                                | Game 1                 | Game 2                     |
| ---------------------------------------------------------------- | ---------------------- | -------------------------- |
| Hand cards buildable, Spring / Summer / Autumn / Winter          | 75 / 65 / 60 / **10%** | 65 / 65 / 90 / 55%         |
| Turns with 2+ buildable cards, Spring-Autumn                     | 12 of 15               | 13 of 15                   |
| Turns with nothing buildable                                     | 3 (all Winter)         | 3 (Spring, Summer, Winter) |
| Turns whose Revealed panel names you (trade, toll, Raid, Honour) | 17 of 20               | 16 of 20                   |
| Final scores                                                     | 67 / 51 / 40 / 37      | 59 / 58 / 42 / 40          |

From Spring to Autumn most turns offer two or more real Builds, and the badges make the choice
quick. Something happens between you and your neighbours on most turns, and the Revealed panel
says so: the interaction R4 D1 asked for is visible. The dull stretch is a broke Winter: in game 1
the script spent its coins early and had nothing to Build on 3 of 5 Winter turns (R4 risk D6).
Game 2 was close at the top (59 vs 58).

## 3. New top 5, ranked

| #   | Sev  | Screen        | What is wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Suggested fix                                                                                                                                                                                                                             | Lane     |
| --- | ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | HIGH | End of game   | **The scoring moment is out of order.** The final card opens 0.3 s after the last pick with every total already shown. The Winter Raid, the biggest of the game, has no Season card; its lines sit behind the scrim. Then, about 8-10 s after the last pick, once the Winter reveal behind the card ends, each total drops and counts up again, lowest first (game 2: 58 → 18 → 51 → 58 and 59 → 35 → 56 → 59), ending about 12 s in, while the ranks were set from the start  | Show the Winter Raid first (a last Season card, or its lines at the top of the final card). Open the final card with totals at 0 and count up at once, lowest first. Show ranks and "X wins" when the count lands. A tap skips to the end | ui, fx   |
| 2   | HIGH | Hand, town    | **Two neighbour cards show code names.** Wend Fair reads "onBuildNeighbourMin" and Kinsfolk Hall "1 Renown; scoreNeighbourMin". Commons of the Wend uses the same effect, so it should read "scoreNeighbourMin" too (not seen in play). `src/game/windamere/text.ts` has no wording for these two effect types and falls back to the raw id                                                                                                                                    | Add the wording, e.g. CARDS.md's "On build: 2 coins per Holding of the weaker neighbour" and "2 Renown per Holding of the weaker neighbour". Add a test that no card face contains a camelCase id                                         | ui       |
| 3   | MED  | Reveal        | **Reveals run 2-7 s against our 1.5 s benchmark.** Measured from the pick: 2.0-2.3 s on a Spend turn, a median of 3.9 s on turns with Builds and trades (range 0.7-7.2 s), and over 7 s on the last turn of each Season. Input isn't blocked, but the clock runs and the news (who bought from you, who built what) lands while you read the new hand. There is no speed setting: fx accepts a `speed`, but the game never passes one, and the menu has only Animations On/Off | Play each seat's steps side by side so a normal turn takes ≤ 1.5 s. Let a Season's last turn run longer, with the clock paused. Tie reveal speed to Bot speed, or add Animations: Fast                                                    | fx, ui   |
| 4   | MED  | Hand, town    | **Neighbour comparisons give no live standing.** "3 Renown per neighbour with fewer Markets" makes you count both neighbours' Markets from their panels to judge the card. Once it is built, nothing shows whether it pays now. I found no code that shows it. These cards are the rivalry (R4 D1, I1), so a player should see the race                                                                                                                                        | In the popover and on the built card: "Now: +3 (more than Bot Blue; tied with Bot Orange)". For the weaker-neighbour cards: "Weaker neighbour: Bot Blue, 2 Holdings → +4"                                                                 | ui       |
| 5   | LOW  | Learn to play | **Two tips are stale after D9c, and four arrive at once.** "The price rises every Season" and "dearer goods to buy" are no longer true (prices are 1, 1, 1, 3). On Spring pick 3 four tips stack: Picks are shown together, Holdings pay out, The Season's Raid, Lore runs                                                                                                                                                                                                     | "Goods cost 1 coin from a neighbour until Winter, then 3." Spread the tips one per pick                                                                                                                                                   | tutorial |

Also seen, not in the top 5: the Revealed panel cuts its last line at 1440×900 on a busy turn; the online clock ✓ (§1 #5).

## 4. For other lanes

- **Trade price is now flat for three Seasons** (design, originality). D9c sets 1, 1, 1, 3.
  R4 §5.3's yardstick was that a flat 2 is 7 Wonders' price; 1 is its discounted price. Our
  trade is still different (goods move, 2 per neighbour a turn, the seller's store runs out, the
  bank fills at the market price), so this is a low risk. But the seasonal ramp that set it apart
  is now only Winter. Worth one line in ORIGINALITY.md.
- **Broke Winters** (design, bots): 3 of 5 Winter turns had no legal Build for a player who
  spent early (game 1). One game, a script player; worth a P3 per-Season look in balance's next run.

## Sources

- `docs/design/research/ux-review-3.md` (R8), `docs/design/research/online-ux.md` (benchmarks),
  `docs/RULES.md` R6.6c, R13 (`onBuildNeighbourMin`, `scoreNeighbourMin`), R15.3,
  `docs/design/CARDS.md` (neighbour cards)
- Code read: `src/game/windamere/text.ts`, `src/game/windamere/fx.ts`, `src/ui/fx/moments.ts`,
  `src/ui/fx/reveal.ts`, `src/ui/tutorial/lessons.ts`
- Logs and frames: `/home/blop/projects/sevenwonders/.scratch/research/ux/r10-*` (local only)
