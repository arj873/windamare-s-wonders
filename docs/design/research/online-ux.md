# Online drafting UX survey (card R2)

Owner: research lane. Status: first cut (2026-10-29). Input for the ui lane (`docs/design/UX.md`),
the net lane (`docs/MULTIPLAYER.md`) and design (rules that affect online flow).

Method: web search summaries of store reviews, press reviews, BGA bug/feature reports and BGA
docs, plus a read of our own Catan project docs (`/home/blop/projects/catan/docs/MULTIPLAYER.md`,
`ONLINE-CLIENT.md`). No app was installed or played for this survey. Timing numbers in section 4
are **our estimates**, not measurements.

---

## 1. TL;DR

1. **The slowest picker sets the pace.** In a simultaneous draft everyone waits on the last
   player each pick. A visible per-pick clock, an auto-pick on timeout, and a bot that takes over
   after a short grace period are the three tools every platform converges on.
2. **Show who is done, never what they picked.** Players ask BGA for an option to hide moves made
   during simultaneous phases. Ready ticks per seat, picks face-down until the shared reveal.
3. **Let the app do the arithmetic.** The most praised digital touches are automatic cost and
   payment maths (BGA's 7 Wonders trade dialog cut to three numbers; the Duel app tracking every
   victory path). Show affordability on the card before the player taps it.
4. **The hand must fit on screen.** Recurring complaints: Sushi Go app's scrolling "conveyor belt"
   hand, Wingspan's crowded hand, It's a Wonderful World on BGA too small to click. Plan for 7-8
   cards readable on a phone in portrait.
5. **Bots need difficulty levels.** The 7 Wonders app was criticised for having none; the Duel
   app's single AI is "impossible" for some and "beaten nearly 100%" by others. colonist.io shipped
   bot difficulty levels as a headline feature. Our Catan bots already have easy/normal/hard.

---

## 2. Products surveyed

| Product                                                        | What players praise                                                                                                                          | What players complain about                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| colonist.io (Catan-like, browser)                              | Fast play, instant matchmaking; 1v1 ~15 min; real-time "Rush" mode under 10 min; bot difficulty levels; your-turn timer shown green and bold | Disconnects and slow reconnects (app reviews); bot-turn timer bugs after reconnect; "rigged dice" perception                           |
| Board Game Arena (7 Wonders, Sushi Go, It's a Wonderful World) | Real-time and turn-based modes; per-game clock; bot ("zombie") replaces a leaver so others can finish                                        | Simultaneous games break tournament time allocation; expel timer too easy to trigger; IAWW UI too small (zoom requested)               |
| 7 Wonders official app (Repos, 2017)                           | Mechanics hold up digitally; stable                                                                                                          | Launched without private rooms (added 2018); UI "uninspiring and clunky"; no AI difficulty levels; card readability; ~3.0 store rating |
| 7 Wonders Duel app (Repos)                                     | Tracks costs and progress toward all three victory paths for you                                                                             | Single AI level (too hard for some, trivial for others); matchmaking hard to get; crash reports; weak at teaching rules                |
| Sushi Go! app (Lummox Labs, 2016)                              | Animated cards with personality; playable one-handed                                                                                         | Hand on a scrolling conveyor belt instead of all cards on screen; iPad layout wastes space                                             |
| Wingspan digital (Monster Couch, 2020)                         | Animations, music, transitions; tutorial praised; PC Gamer called it the new gold standard for adaptations                                   | Crowded with a big hand; pop-up flavour text slows moves; tutorial "overwhelming" for one reviewer; no cross-device save sync          |

### BGA details worth copying or avoiding

- **Clock model:** initial time (also the maximum) plus extra time per move. Older docs give a
  3-minute initial delay in real time; going over by a few minutes lets opponents expel you.
  Players ask for "less aggressive options besides expelling".
- **Zombie mode in 7 Wonders:** the leaver's seat takes a random card and discards it each turn
  (passing is not allowed because it would break the next player's hand). Keeps the draft moving
  but plays badly. Our Catan stack hands the seat to a real bot instead, which is better.
- **Trade dialog:** a player report asked BGA to stop listing every purchase combination and show
  only coins spent, coins to the left neighbour and coins to the right; marked implemented, and
  another player said it sped games up "by a lot".
- **Async draft request:** a 2021 feature request asks to let players draft ahead when hands pile
  up for a slow player (turn-based mode). Not implemented as far as found. Only possible if the
  rules don't need everyone's pick resolved together; see section 5, question 1.
- **Semi-simultaneous play:** players ask for a "wait for players before me" option and complain
  when the UI says it's their turn before the previous player finished. Clear state labels matter.

---

## 3. What our Catan project already has (reuse at UX level)

From `catan/docs/MULTIPLAYER.md` and `ONLINE-CLIENT.md` (read-only):

| Feature                                                                    | Status in Catan | Drafting change needed                                                       |
| -------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| Room by invite link + nickname, no accounts                                | Shipped         | None                                                                         |
| Reconnect from same browser (stored token), backoff 0.5 s doubling to 15 s | Shipped         | None                                                                         |
| Away flag; after a 60 s grace a bot plays the seat; owner can reclaim      | Shipped         | Grace should be shorter for a simultaneous pick (whole table waits); see 4.3 |
| Server-enforced turn timer (90 s default), client counts down locally      | Shipped         | One clock **per pick for all seats at once**, not per active player          |
| Bots fill empty seats; levels easy/normal/hard                             | Shipped         | New draft bots (bots lane)                                                   |
| Spectators, chat, quick reactions                                          | Shipped         | Spectators must not see hands (per-seat redaction, N0)                       |
| Hotseat with resume prompt                                                 | Shipped         | Hidden hands need a cover screen between human seats (4.5)                   |

---

## 4. Drafting-specific recommendations

### 4.1 One pick, step by step

1. Hand at the bottom, all cards visible at once; each card shows affordability (can build /
   needs trade / can't) before any tap.
2. Tap a card: a preview opens with the 2-3 ways to use it (design decides which exist), each
   with its final cost already computed (cheapest payment pre-selected).
3. Confirm: the card flips face-down in a "picked" slot; seat shows a ready tick to everyone.
4. Until the reveal, the player may change the pick (one tap to undo). _(Whether BGA allows this:
   not verified.)_
5. When all seats are ready: one shared reveal (all picks flip at once), cards fly into
   tableaux, payments animate to neighbours, then the hand slides to the next seat with an arrow
   showing pass direction. Target under ~1.5 s, skippable.

### 4.2 What to show at all times

- Both neighbours' key numbers (what they produce, conflict strength, coins), because neighbour
  interaction is the genre's main interaction (RESEARCH.md 3.3).
- Round and pick counter ("Round 2 · pick 4 of 6") and pass direction.
- Per-seat ready ticks and the shared pick clock.
- A live score estimate with per-category breakdown (physical games can't; RESEARCH.md TL;DR 4).
- On demand: the full card pool and which cards are still to come this round (closes the
  "veterans know the deck" gap noted for Tides of Time).

### 4.3 Clock, timeouts, leavers

| Setting             | Suggestion                    | Why                                                                       |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| Pick clock (online) | 30-45 s, host-configurable    | Everyone waits on the slowest; 45 s x 20 picks caps the draft at ~15 min  |
| On timeout          | Bot picks for the seat        | Better than BGA's random discard; Catan already has a timeout RNG and bot |
| Disconnect grace    | ~15-20 s, then bot picks      | Catan's 60 s is per-turn; here one away seat stalls the whole table       |
| Reclaim             | Owner returns, bot hands back | Same as Catan                                                             |
| Hotseat vs bots     | No clock by default           | Solo play has no one to wait for                                          |

### 4.4 Pace estimate (our arithmetic, not measured)

Assume 20 picks per player (RESEARCH.md section 5 range), reveal animation ~1.5 s per pick.

| Table                    | Time per pick (slowest seat) | Draft time | + reveals | Total (+ ~1 min scoring) |
| ------------------------ | ---------------------------- | ---------- | --------- | ------------------------ |
| 1 human + bots (hotseat) | ~20 s                        | ~7 min     | ~0.5 min  | **~8-9 min**             |
| 3 humans online          | ~30 s                        | ~10 min    | ~0.5 min  | **~11-12 min**           |
| 5-7 humans online        | ~40 s (often hits the clock) | ~13-15 min | ~0.5 min  | **~15-17 min**           |

This sits inside the 20-30 min band from RESEARCH.md 3.6; online games will run shorter than
the physical game because setup, passing and scoring are free.

### 4.5 Hotseat with hidden hands

- One human vs bots: no hiding needed; this is the main hotseat case.
- Two or more humans on one screen: each human picks behind a "Pass to <name>, tap when ready"
  cover screen; the reveal happens once after the last human picks. Cost: humans x picks cover
  screens (3 humans x 20 picks = 60). Pass-the-device cover screens are the standard pattern in
  other digital party games; the PS4 Ticket to Ride used phones as private hands instead.
- Suggest hotseat supports 2+ humans but the default setup is 1 human + bots.

### 4.6 Onboarding and readability

- Guided first round vs easy bots, one tip per pick, skippable (Wingspan's tutorial is praised,
  but one reviewer found it overwhelming: keep it short).
- Long-press / hover zoom on any card; icons with a one-line text label on first sight.
- One-handed portrait play on phones (Sushi Go app praised for it).

---

## 5. Open questions for other lanes

1. **design:** do any rules need all picks resolved together (e.g. neighbour payments in the same
   pick)? If not, an async "draft ahead" mode for slow tables becomes possible (BGA request
   #50132). Recommend: keep lockstep for v1; note any rule that would block async later.
2. **design:** may a player change their pick before the reveal? (Recommend yes online.)
3. **net:** per-pick clock and shorter grace (15-20 s) differ from Catan's per-turn 90 s / 60 s
   defaults; per-seat hand redaction for spectators and neighbours (N0).
4. **ui:** live score estimate on by default, or a toggle for players who prefer hidden scores?
5. **bots:** three difficulty levels from the start; reviewers punish a single level.

---

## Sources

- colonist.io: [TapSmart review](https://www.tapsmart.com/games/colonist-review),
  [Colonist Rush FAQ](https://blog.colonist.io/colonist-rush-faq/),
  [Colonist 2025 summary](https://blog.colonist.io/colonist-io-2025-summary),
  [feature board: bot](https://colonist.featureupvote.com/?tag=bot),
  [feature board: UI](https://colonist.featureupvote.com/?tag=ui),
  [reconnect on bot turn bug](https://colonist.featureupvote.com/suggestions/92808/bug-with-reconnect-on-a-bots-turn),
  [Gamebrain reviews](https://gamebrain.co/game/colonist)
- BGA clock and leavers: [Game clock doc](https://en.doc.boardgamearena.com/Game_clock),
  [clock improvements news](https://en.boardgamearena.com/news?id=405),
  [Zombie Mode doc](https://en.doc.boardgamearena.com/Zombie_Mode),
  [expel timer thread](https://forum.boardgamearena.com/viewtopic.php?p=149121),
  [less aggressive than expel #70341](https://boardgamearena.com/bug?id=70341),
  [tournament time for simultaneous play #41933](https://ca.boardgamearena.com/bug?id=41933)
- BGA simultaneous-play UX: [hide simultaneous moves #74757](https://sv.boardgamearena.com/bug?id=74757),
  [semi-simultaneous play #136351](https://be.boardgamearena.com/bug?id=136351),
  [wait for turn order #123617](https://sr.boardgamearena.com/bug?id=123617),
  [waiting-state bug #124022](https://it.boardgamearena.com/bug?id=124022),
  [async draft request #50132](https://en.boardgamearena.com/bug?id=50132),
  [7 Wonders trade dialog #11068](https://be.boardgamearena.com/bug?id=11068),
  [IAWW zoom request #68792](https://ca.boardgamearena.com/bug?id=68792)
- 7 Wonders app: [StatelyPlay review](https://statelyplay.com/2017/11/14/review-7-wonders/),
  [148Apps review](https://www.148apps.com/reviews/7-wonders-review),
  [Tabletop Gaming: private matches added](https://tabletopgaming.co.uk/news/7-wonders-finally-lets-you-play-against-your-friends-on-mobile)
- 7 Wonders Duel app: [App Store listing and reviews](https://apps.apple.com/us/app/-/id1441651711),
  [Comicbook.com](https://comicbook.com/gaming/news/7-wonders-duel-mobile-game),
  [Gamebrain](https://gamebrain.co/game/7-wonders-duel)
- Sushi Go! app: [TouchArcade review](https://toucharcade.com/2016/09/21/sushi-go-review/),
  [AppAdvice](https://appadvice.com/review/sushi-go)
- Wingspan digital: [TouchArcade review](https://toucharcade.com/2021/08/16/wingspan-review-iphone-ipad-ios-board-game-adaptation-monster-couch/),
  [PC Gamer review](https://www.pcgamer.com/uk/wingspan-review),
  [Chalgyr review](https://chalgyr.com/2021/06/review-xb1-wingspan.html),
  [Big Boss Battle](https://bigbossbattle.com/?p=72010)
- Pass-and-play patterns: [Ticket to Ride PlayLink (phones as private hands)](https://tabletopgaming.co.uk/News/ticket-to-ride-on-ps4-will-let-you-keep-your-cards-hidden-on-your),
  [Sorting History pass-and-play](https://sortinghistory-website.pages.dev/how-to-play/pass-and-play.html)
- Our reference stack: `/home/blop/projects/catan/docs/MULTIPLAYER.md`,
  `/home/blop/projects/catan/docs/ONLINE-CLIENT.md`
