# UX review 3: R7 re-check, Learn to play, online, phone (card R8)

Owner: research lane. Date: 2026-10-30. Build: main `0bf1efe` (ui R7 fixes, online lobby /
invite / rematch, First game, Learn to play; PRs #70-#80). Previous: `ux-review-2.md` (R7).

**Method.** Heuristic review, not a user test. Headless Chrome (playwright 1.63,
`/usr/bin/google-chrome-stable`) against `pnpm dev`:

1. **Learn to play**, desktop 1440×900, played as a new player who does what the coach says:
   read a tip and press Next; when the tip asks for a pick, pick (Build if the badge says ✓,
   else Spend). A full game. Then a second run that presses Next on every tip before picking.
2. **Online**, two tabs in one browser on the dev SharedWorker backend: Ana creates a room,
   Ben opens the invite link and joins, Ana starts with 2 bots, both play 7 turns (through a
   Season card); Ben reloads his tab mid-turn.
3. **Phone** 390×844 (touch), vs 3 bots, Normal clock, a full game; plus probes for page width,
   the menu, the log wording and the clock under the Season card.

Scripts, screenshots and logs: `/home/blop/projects/sevenwonders/.scratch/research/ux/`
(`r8-learn.mjs`, `r8-online.mjs`, `r8-probe.mjs`, `r7.mjs`, `r7-clock.mjs`; `r8-*/`). Not
committed. Skipped, as the card asks: the coach panel's placement and the coach in normal games.
Not tested: the real Worker server (the dev backend stands in), rematch and host succession,
spectators, a second online human on a phone, screen readers, reveal animation timing.

---

## 1. R7 top 5, re-checked

| #   | R7 issue                          | Now    | Evidence                                                                                                                                                                                                                                                   |
| --- | --------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clock runs under the Season card  | Fixed  | Hotseat, Normal: 0:45 when the card opened, still 0:45 when it closed 8.3 s later. Online: net adds 8.4 s to the first turn on the server (MULTIPLAYER.md §11); the dev backend adds 0 by design, so not testable here (the 2-tab game showed 0:44 → 0:42) |
| 2   | Phone cards hide the effect       | Fixed  | Phone cards show the effect line ("Each Yield: +1 Salt", "Guard 1; Hold a Raid: +1 coin"). One long face was cut once ("5 Renown · Upgrades Ferry Steps for 1 Reed 1 Horn")                                                                                |
| 3   | Phone top bar ~250 px             | Partly | Now about 100 px: one line, seat chips as icons, Raid and Market below. But with a clock on, the bar is wider than the screen (§2 #2)                                                                                                                      |
| 4   | "Player 1" in interaction lines   | Partly | The Revealed panel and Season card now say "You were plundered", "Bot Orange took a 1-coin bounty from you". The log still says "Player 1 is plundered" and "Bot Blue takes a bounty of 1 from Player 1" (§2 #3)                                           |
| 5   | Disabled payment reasons on touch | Fixed  | Each closed option says why under the row: "Bank 6g: Needs 7 coins, you have 2", "Bot Blue 1g: Bot Blue holds only 0 reed" (wording nit: "has no Reed")                                                                                                    |

Also closed since R7: the menu now has **How to play** (Rules, or press ?) and **Learn to play**
(R6 #8); kind-coloured card headers are in (R6 #6); turn 1 is no longer mostly Spend-only
(design D11: 3 of 6 opening cards buildable in the tutorial, 6 of 6 in the phone game).

## 2. New top 5, ranked

| #   | Sev  | Screen          | What is wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Suggested fix                                                                                                                                                                                                                                                                                                            | Lane       |
| --- | ---- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | HIGH | Learn to play   | **Following the coach skips its core lessons.** "Pick one card" says "Pick a card and a way to use it." Picking marks it done, and with the bots already ready the turn resolves at once. "Spend gives fuel" and "Build to keep" only show on turn 1 after that lesson, so they never show. "Picks are shown together" waits on "Build to keep", and "The Season's Raid" and "Buy from a neighbour" wait on that, so the player never learns why Raids hit or how to buy during play. "Buy" shows only as a Recap after the last pick. Seen: 10 of 14 lessons. Pressing Next before picking shows all 12 in order by Summer. The headless test passes because its learner presses Next up to 10 times before each pick (`headless.ts`) | Teach Build and Spend before asking for the pick: one "Build or Spend" lesson carries the todo, or Spend/Build show while the pick todo is up. Don't tie a lesson's window to `turn === 0`; let `after` count a lesson that was skipped by acting. Make the headless learner pick when told to, so the test catches this | tutorial   |
| 2   | MED  | Phone: top bar  | **With a clock on, the phone page is 408 px wide in a 390 px screen.** The row with the Raid, Market, status and "Table & log" ends at 408 px, so "Table & log" is cut at the edge, the right column of hand cards loses about 8 px, and the page pans sideways. With the clock Off it fits (390)                                                                                                                                                                                                                                                                                                                                                                                                                                      | Let that row wrap or shrink when the clock ring is shown. Add a test: at 360 and 390 px, `scrollWidth === clientWidth` with every clock option                                                                                                                                                                           | ui         |
| 3   | MED  | Log             | **The log names you in the third person, and the tutorial's log is ungrammatical.** Hotseat: "Player 1 is plundered (Guard 0 vs 1): -1 coins.", "Bot Blue takes a bounty of 1 from Player 1." In Learn to play your seat is named "You", so the engine's lines read "You yields." and "You is plundered (Guard 0 vs 1): -1 coins." The lines are the engine's text with the seat name (`src/engine/game/raid.ts`)                                                                                                                                                                                                                                                                                                                      | Build log lines in the UI from the typed events, with the viewer as "you", as the Revealed panel already does. Engine: "1 coin" not "-1 coins"                                                                                                                                                                           | ui, engine |
| 4   | MED  | Online: table   | **No menu in an online game.** The hotseat table has the ☰ menu (How to play, Learn to play, Animations); the online table has only Leave and Chat. A friend who joined by link can't read the rules or turn animations off mid-game (the ? key was not tried)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Show the ☰ menu online with How to play, Animations and sound; leave out New game and Bot speed                                                                                                                                                                                                                         | ui         |
| 5   | LOW  | Online: waiting | **After you pick, the clock shows ✓ instead of the time left.** You can't see how long the table will wait for Ben; the "Waiting on 1 town: Ben" note is good. The lobby calls the clock option "No clock", setup calls it "Off"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Keep the seconds in the ring and show ✓ beside it. Use one name for the Off option                                                                                                                                                                                                                                       | ui         |

Known and skipped (card item 4), with one detail for ui and tutorial: when no lesson is up, the
idle coach panel still sits over the first hand card's popover at 1440×900 and takes the click on
its Build button (playwright could not press it).

## 3. Learn to play, lesson by lesson

"Follow" is run 1 (does what the coach says); "Reader" is run 2 (presses Next first).

| Lesson                   | Follow          | Reader      | Helps? | Note                                                                                                                              |
| ------------------------ | --------------- | ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Welcome to Windamere     | Spring 1        | Spring 1    | Yes    | Goal and length in two lines                                                                                                      |
| Your Great Work          | Spring 1        | Spring 1    | Yes    | Names your monument, says Spend's labour fills it; the strip is highlighted                                                       |
| Pick one card            | Spring 1        | Spring 1    | Partly | Asks you to choose Build or Spend before either is explained, and its todo starts the pick that skips the next two (§2 #1)        |
| Spend gives fuel         | never           | Spring 1    | Yes    | When seen. "Early on you have no goods, so Spending is how you start" now clashes with D11: 3 of 6 opening cards showed "✓ Build" |
| Build to keep            | never           | Spring 1    | Yes    | When seen                                                                                                                         |
| Picks are shown together | never           | Spring 2    | Yes    | When seen: the reveal and the pass in one line                                                                                    |
| Lore runs                | Spring 3        | Spring 2    | Yes    | Comes right after you build a Lore card                                                                                           |
| The Season's Raid        | never           | Spring 3    | Yes    | When seen. In the follow run the Season card shows the result, but Guard vs strength is never explained before it                 |
| Buy from a neighbour     | Recap, game end | Spring 4    | Yes    | When seen. Too late in the follow run: trade is the main interaction (R4 D1)                                                      |
| The last turn: glean     | Spring 5        | Spring 5    | Yes    | Right moment. Came together with "Holdings pay out" (two tips on one pick)                                                        |
| Holdings pay out         | Spring 5        | Spring 5    | Yes    | After your first Holding; "Winter has no Yield" sets up the Winter tip                                                            |
| A new Season             | Summer 1        | Summer 1    | Partly | Opens with the Season card, so two panels show at once; "Check the Raid" points at a chip the card covers                         |
| Winter: no Yield         | Winter 1        | not reached | Yes    | Clear and actionable                                                                                                              |
| Final score              | end             | not reached | Yes    | Matches the First game's score sheet (no Honours)                                                                                 |

The text itself is good: short, our terms, one idea each. The problem is only when they show.
(Run 2 stopped in Autumn: the idle coach panel blocked a Build click, the known placement issue.)

## 4. Online, first look

What works, in one pass with two tabs:

- **Create → invite → join → start** takes four clicks. "Play online" creates the room and opens
  the lobby with the invite link and a Copy button. The link opens "Join room TYKGZQ" with a
  nickname field and Join / Watch. The lobby shows seats (host, connected, bots), Add bot,
  Remove, the clock, chat with reactions, and a sticky Start bar ("2 players + 2 bots · Normal
  clock").
- **At the table**, both tabs show the same Raid, prices and chips; "Waiting for Ben" in the top
  bar and a "Waiting on 1 town: Ben" note. Reveal lines say "You" and "from you" in both tabs.
- **Reload mid-turn**: Ben's tab came back to his seat, his hand and the running clock (0:29)
  without a rejoin step; the turn went on.
- No page errors or console errors in either tab.

## 5. For other lanes

- **Turn 1** (design, R7 lead): fixed by D11. Tutorial hand: 3 of 6 buildable; phone game: 6 of 6.
  Spend gives fuel's text should follow (§3).
- **Bots at Guard 0** (bots, R7 lead): not re-measured here; bots' B6 part 2 measures it.

## Sources

- `docs/design/research/ux-review-2.md` (R7), `docs/design/research/online-ux.md` (benchmarks),
  `docs/RULES.md` R15.3, R19, `docs/MULTIPLAYER.md` §11
- Code read: `src/ui/tutorial/lessons.ts`, `course.ts`, `machine.ts`, `headless.ts`;
  `src/engine/game/raid.ts` (log text); `src/ui/table/table.ts` (disabled reasons)
- Screenshots and logs: `/home/blop/projects/sevenwonders/.scratch/research/ux/r8-*` (local only)
