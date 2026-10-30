# KANBAN — Windamere's Wonders (mirror)

**Live board: https://github.com/users/arj873/projects/3/views/1** · this file is generated from `.orchestra/cards.json`; agents read-only.
Updated: 2026-10-30 09:03 · Progress: **121 / 130 cards done**

## In progress (6)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A3 | art | P0 | Retheme to the real design: 6 kinds, goods, Lore ranks, Raid frame, Great Work track, Honours |
| L6 | balance | P1 | Level-2 baseline with B10 Guard x3; D12 re-check; S4r run |
| B11 | bots | P2 | S4r Great Work focus bot (level 1) for the tier IV reach test |
| B6 | bots | P2 | Level 3 on engine lookahead + Lore-run/Honour planning (K2 1.5x) |
| D12 | design | P2 | Proposal: a third scoring group that pays level-2 play |
| U13 | ui | P2 | fx speed menu (Fast/Normal/Off); count-up once |

## In review (1)

| Card | Lane | Pri | Title |
|---|---|---|---|
| Q6 | qa | P1 | Card-text audit: no raw effect ids on any card face |

## Ready (2)

| Card | Lane | Pri | Title |
|---|---|---|---|
| D13 | design | P2 | RULES.md design notes: measured I1 by card; CARDS.md §9 pointers |
| U2 | ui | P1 | Fix R4 red-team: O4 placeholders + popover, O12 score tally |

## Done (121)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A1 | art | P0 | Art direction + card frame + icon set (SVG) -> docs/design/ART.md, public/art, art-dev.html |
| A4 | art | P0 | Fix R4 red-team: O1 palette/type map, O2 glass+cloth, O3 stage sockets |
| A5 | art | P0 | Goods icons (final D2c names) + coin + labour |
| A2 | art | P1 | Table chrome: background, seat panel, neighbour strips, timer badge, title key art |
| A6 | art | P1 | Great Work vignettes on the tier track + title key art refresh |
| A8 | art | P1 | Kind-coloured card headers; distinct Holding/Market glyphs |
| A7 | art | P2 | Card art-window illustrations per kind |
| A9 | art | P2 | warn tokens, Season marker on card frame, table chrome vs UX.md |
| B4 | balance | P0 | Baseline balance re-run on main -> docs/BALANCE.md |
| L2 | balance | P0 | Tuning experiments as overlays; winners to design D9 |
| L4 | balance | P1 | Re-check D9c+D10b+L3+D10c at levels 1+2; S1 sources >=10% |
| L5 | balance | P1 | D12 grid at levels 1+2; rivalry payoff size; Lore-plan rerun |
| L3 | balance | P2 | Town-group lever keeping D10a rivalry gain (levels 1+2) |
| B5 | bots | P0 | Smarter bots: level 2 (plans) and level 3 (denial) |
| B1 | bots | P1 | Random + heuristic bots, headless sim, balance report |
| B2 | bots | P1 | 3 difficulty levels plan -> docs/BOTS.md |
| B3 | bots | P1 | Level-1 heuristic bot + sim report vs balance-targets.md |
| B5b | bots | P1 | rateGreatWork values Valour-scoring tiers (Wolf Gate never chosen) |
| B7 | bots | P1 | Normal bots keep Guard 0 (R7): measure + fix evaluator |
| B8 | bots | P1 | Bots tests robust to D10b (unblocks design D9c+D10b) |
| B9 | bots | P1 | I1 metric counts D10b types; Lore plan (36-38% of towns build none) |
| B10 | bots | P2 | Goods plan / Honours; re-measure K2 and Lore share |
| D2 | design | P0 | Original ruleset with numbered rules -> docs/RULES.md |
| D2b | design | P0 | Answer lane questions in RULES.md: pick change before reveal, early resolve, timers, resolution order |
| D2c | design | P0 | Human changes: new goods set, single pick, neighbour trade (own mechanism/numbers) |
| D3 | design | P0 | ORIGINALITY.md: 7 Wonders signature systems vs our replacements |
| D5 | design | P0 | Card data into src/content + content tests (after H1) |
| D6 | design | P0 | Fix R4 red-team: O5-O16 names/numbers, D1 neighbour share, D2 Watch/Raid bug |
| D9 | design | P0 | Re-tune from BALANCE.md: Town dominance 82-90%, blowouts 32-53%, Lore runs low |
| D10 | design | P1 | Neighbour-interaction cards (I1): pay off/score from neighbours' towns |
| D11 | design | P1 | Turn-1 affordability (R7: 1-2 of 6 Spring cards buildable) |
| D4 | design | P1 | Card catalog draft with counts per player count -> docs/design/CARDS.md |
| D8 | design | P1 | Rule fixes: Summer price 2, R6.7 vs R17.9, deck size vs seats, re-tune plan |
| D9b | design | P1 | Re-tune follow-up |
| D10b | design | P2 | Ship 4 pending neighbour cards once engine E7 lands |
| D10c | design | P2 | Second copy of rivalry cards at 6-7 seats (I1) |
| D7 | design | P2 | First-game option (Honours and upgrades off) after sim numbers |
| D9c | design | P2 | Re-tune from balance L2 at bot level 2 (Halls/Town top source) |
| E1 | engine | P0 | Game-agnostic draft core: seats, hidden simultaneous picks, reveal, hand passing, seeded RNG, per-seat views |
| E2 | engine | P0 | Full rules engine: 3-7 towns, Great Work choice, 2-player variant, Recall |
| E3 | engine | P0 | Per-turn event log in state + views (for reveal animation + history) |
| E1b | engine | P1 | Contract changes E2 needs from RULES.md (pair picks, 2p burn, labour track, Raids, Honours) |
| E4 | engine | P1 | Follow design D8: R6.7/R17.9 rewrite, price ladder via tunables |
| E5 | engine | P1 | Fast lookahead API for level-3 bots + bench |
| E6 | engine | P1 | R19 First game option: no Honours, one Great Work, no upgrades |
| E7 | engine | P1 | D10b effect types: onBuildNeighbourMin, scoreNeighbourMin, scoreSales |
| E8 | engine | P2 | Structured actor/target seat in log entries (viewer 'You') |
| E9 | engine | P2 | Log grammar for You; '-1 coins' singular |
| F1 | fx | P0 | Reveal animation from latestEvents (reduced-motion safe) |
| F2 | fx | P1 | Port catan synth audio + game sounds |
| F3 | fx | P1 | Season transition, score count-up, tier moment, hover motion |
| F4 | fx | P2 | plan.ts gaps (Honour, Great Work, Raid reveal), sprite CSS; audition panel |
| F5 | fx | P2 | Reveal sprites with real card names and art |
| F6 | fx | P2 | Reveal speed (median 3.9 s vs 1.5 s) + speed setting; chip clamp |
| H1 | human | P0 | Approve the ruleset (D2-D4) before full rules engine (E2) starts |
| N0 | net | P0 | Multiplayer plan: port Catan rooms, add per-seat hidden-hand redaction -> docs/MULTIPLAYER.md |
| N1b | net | P0 | Real-engine adapter + real-engine leak test |
| N2 | net | P0 | Fix qa Q0-N1..N4 (hello rate limit, double hello, host succession, engine throws) |
| N3 | net | P0 | Server runs real Windamere games; RoomClient; 2-tab online e2e |
| N1 | net | P1 | Online rooms via Cloudflare Durable Objects (port from Catan) |
| N5 | net | P1 | Host hand-off at final scores (nextWakeAt in over); 2-tab browser e2e |
| N6 | net | P1 | Room storage size: 7-town session vs DO per-value limit |
| N4 | net | P2 | Room options: firstGame, per-seat bot level, seat colour |
| N7 | net | P2 | DO write volume per game (measure, then propose) |
| N8 | net | P2 | Server default bot level Normal |
| O1 | online | P0 | Lobby flow on loopback: room, invite, seats, start, online table, waiting states, chat |
| O2 | online | P1 | Spectators, rematch, host leaves |
| O3 | online | P2 | Lobby bot-level picker + colours; openingBonus parity; phone pass |
| O4 | online | P2 | Spectator view + labels; menu online; clock words; Normal default |
| O5 | online | P2 | Use --dt-bottom-inset; bot-level test independent of server default |
| O6 | online | P2 | Ring test checks locked state, not text |
| P1 | platform | P0 | Scaffold the Catan stack (pnpm, TS strict, Vite, Vitest, ESLint, Prettier, Pixi v8) + hello screen |
| P2 | platform | P0 | scripts/gate.sh (typecheck+lint+test, exit code) + GitHub Actions CI |
| P5 | platform | P0 | Deps for art (fonts, tokens import, art-dev.html under vite) and net (wrangler, workers-types) |
| P10 | platform | P1 | Playtest deps: pt scripts, vitest include, system chrome |
| P11 | platform | P1 | e2e:server script; finish P10 pt scripts + vitest include |
| P3 | platform | P1 | docs/REUSE.md: Catan module reuse map with effort estimates |
| P4 | platform | P1 | Port Windamere theme/fonts + seeded RNG + docs/ARCHITECTURE.md skeleton |
| P6 | platform | P1 | Verify ci.yml on GitHub and fix |
| P7 | platform | P1 | Import chrome.css next to tokens.css |
| P9 | platform | P1 | Browser automation dep + pnpm e2e entry |
| P12 | platform | P2 | e2e:browser script |
| P8 | platform | P2 | pnpm sim script for bots |
| Q0 | qa | P0 | Red-team audit: hidden info (viewFor), net session cheats, determinism |
| Q1b | qa | P0 | Update R6.6c/R6.3 audit tests to D8 prices (pairs with engine E4) |
| Q1 | qa | P1 | Rules audit: engine vs docs/RULES.md, one audit test per rule |
| Q2 | qa | P1 | Playtest harness: drive a browser game from a CLI |
| Q2b | qa | P2 | Playtest harness browser layer (Playwright, system Chrome) |
| Q3 | qa | P2 | Audit tests: R19 First game, D10a rivalry cards |
| Q4 | qa | P2 | Playtest online layer: one page per seat, leak checks |
| Q5 | qa | P2 | Online 5-7 seats, bots, kick/host-leave; 360/390 width checks |
| R1 | research | P0 | Genre + rules research: drafting/tableau games, mechanics, balance lessons -> docs/design/RESEARCH.md |
| R4 | research | P0 | Red-team originality + design-risk review of RULES/CARDS |
| R2 | research | P1 | Online drafting UX survey (BGA, colonist.io feel, timers, reconnect) -> docs/design/research/online-ux.md |
| R6 | research | P1 | Heuristic UX review of the playable game -> ux-review-1.md |
| R10 | research | P2 | UX review 4: whole-game feel vs colonist.io bar |
| R11 | research | P2 | Define S4's bot level |
| R5 | research | P2 | Public balance/pace numbers to set sim targets |
| R7 | research | P2 | UX review 2: verify R6 fixes, phone pass |
| R8 | research | P2 | UX review 3: R7 re-check, Learn to play, 2-tab online, phone |
| R9 | research | P2 | Define S1: by source or by R12.2 group |
| T1 | tutorial | P0 | docs/HOWTOPLAY.md one-page player summary |
| T2 | tutorial | P0 | In-game How to play overlay + term/icon tooltips |
| T3 | tutorial | P1 | Guided first game (coach) |
| T3d | tutorial | P1 | Coach skips 4 of 14 lessons when followed (R8 #1) |
| T3b | tutorial | P2 | Tutorial on real E6 option + seed; headless lesson check |
| T3c | tutorial | P2 | Coach panel placement; Lore lesson fires live |
| T4 | tutorial | P2 | HOWTOPLAY numbers after D9c/D10b/L3/D10c; coach vs Log |
| T5 | tutorial | P2 | Stale price wording after D9c |
| U0 | ui | P0 | UX spec + wireframes for every screen -> docs/design/UX.md |
| U3 | ui | P0 | Playable hotseat vs bots in the browser: setup -> table -> end scoring -> rematch |
| U4 | ui | P0 | Fix 404 asset; tunables-driven price test; Great Work SVG; playtest hooks; home screen |
| U5 | ui | P0 | Wire fx reveal + remove duplicate; R6 UX fixes (bank spend bug, affordability, Season-end card, Recall, timers, phone) |
| U1 | ui | P1 | Draft table UI: hand, city tableau, neighbours, simultaneous reveal |
| U10 | ui | P1 | You in the log; phone width with clock; bottom inset hook; qa Q2b fixes |
| U12 | ui | P1 | D10b card faces print raw effect ids; end-game double count-up; live standing |
| U6 | ui | P1 | Wire help T2 (one card list), fx F3, art kinds.css, bot levels, First game |
| U7 | ui | P1 | Wire online launcher, First game toggle, tutorial coach |
| U9 | ui | P1 | Coach shows in normal games (bug); fx face; spectator layout; labels |
| U11 | ui | P2 | Clock keeps seconds after pick; hotseat Sound menu; Burn row |
| U8 | ui | P2 | R7 top 5 UX fixes + qa/fx/art hooks |
