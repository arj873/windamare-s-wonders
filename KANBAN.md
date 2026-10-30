# KANBAN — Windamere's Wonders (mirror)

**Live board: https://github.com/users/arj873/projects/3/views/1** · this file is generated from `.orchestra/cards.json`; agents read-only.
Updated: 2026-10-30 02:04 · Progress: **49 / 71 cards done**

## In progress (13)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A3 | art | P0 | Retheme to the real design: 6 kinds, goods, Lore ranks, Raid frame, Great Work track, Honours |
| A2 | art | P1 | Table chrome: background, seat panel, neighbour strips, timer badge, title key art |
| A8 | art | P1 | Kind-coloured card headers; distinct Holding/Market glyphs |
| B5 | bots | P0 | Smarter bots: level 2 (plans) and level 3 (denial) |
| D9b | design | P1 | Re-tune follow-up |
| F3 | fx | P1 | Season transition, score count-up, tier moment, hover motion |
| N1b | net | P0 | Real-engine adapter + real-engine leak test |
| N1 | net | P1 | Online rooms via Cloudflare Durable Objects (port from Catan) |
| O1 | online | P0 | Lobby flow on loopback: room, invite, seats, start, online table, waiting states, chat |
| P10 | platform | P1 | Playtest deps: pt scripts, vitest include, system chrome |
| P11 | platform | P1 | e2e:server script; finish P10 pt scripts + vitest include |
| Q1b | qa | P0 | Update R6.6c/R6.3 audit tests to D8 prices (pairs with engine E4) |
| U5 | ui | P0 | Wire fx reveal + remove duplicate; R6 UX fixes (bank spend bug, affordability, Season-end card, Recall, timers, phone) |

## In review (1)

| Card | Lane | Pri | Title |
|---|---|---|---|
| E4 | engine | P1 | Follow design D8: R6.7/R17.9 rewrite, price ladder via tunables |

## Ready (7)

| Card | Lane | Pri | Title |
|---|---|---|---|
| L2 | balance | P0 | Tuning experiments as overlays; winners to design D9 |
| E5 | engine | P1 | Fast lookahead API for level-3 bots + bench |
| O2 | online | P1 | Spectators, rematch, host leaves |
| Q2 | qa | P1 | Playtest harness: drive a browser game from a CLI |
| T2 | tutorial | P0 | In-game How to play overlay + term/icon tooltips |
| T3 | tutorial | P1 | Guided first game (coach) |
| U2 | ui | P1 | Fix R4 red-team: O4 placeholders + popover, O12 score tally |

## Backlog (1)

| Card | Lane | Pri | Title |
|---|---|---|---|
| D7 | design | P2 | First-game option (Honours and upgrades off) after sim numbers |

## Done (49)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A1 | art | P0 | Art direction + card frame + icon set (SVG) -> docs/design/ART.md, public/art, art-dev.html |
| A4 | art | P0 | Fix R4 red-team: O1 palette/type map, O2 glass+cloth, O3 stage sockets |
| A5 | art | P0 | Goods icons (final D2c names) + coin + labour |
| A6 | art | P1 | Great Work vignettes on the tier track + title key art refresh |
| A7 | art | P2 | Card art-window illustrations per kind |
| B4 | balance | P0 | Baseline balance re-run on main -> docs/BALANCE.md |
| B1 | bots | P1 | Random + heuristic bots, headless sim, balance report |
| B2 | bots | P1 | 3 difficulty levels plan -> docs/BOTS.md |
| B3 | bots | P1 | Level-1 heuristic bot + sim report vs balance-targets.md |
| D2 | design | P0 | Original ruleset with numbered rules -> docs/RULES.md |
| D2b | design | P0 | Answer lane questions in RULES.md: pick change before reveal, early resolve, timers, resolution order |
| D2c | design | P0 | Human changes: new goods set, single pick, neighbour trade (own mechanism/numbers) |
| D3 | design | P0 | ORIGINALITY.md: 7 Wonders signature systems vs our replacements |
| D5 | design | P0 | Card data into src/content + content tests (after H1) |
| D6 | design | P0 | Fix R4 red-team: O5-O16 names/numbers, D1 neighbour share, D2 Watch/Raid bug |
| D9 | design | P0 | Re-tune from BALANCE.md: Town dominance 82-90%, blowouts 32-53%, Lore runs low |
| D4 | design | P1 | Card catalog draft with counts per player count -> docs/design/CARDS.md |
| D8 | design | P1 | Rule fixes: Summer price 2, R6.7 vs R17.9, deck size vs seats, re-tune plan |
| E1 | engine | P0 | Game-agnostic draft core: seats, hidden simultaneous picks, reveal, hand passing, seeded RNG, per-seat views |
| E2 | engine | P0 | Full rules engine: 3-7 towns, Great Work choice, 2-player variant, Recall |
| E3 | engine | P0 | Per-turn event log in state + views (for reveal animation + history) |
| E1b | engine | P1 | Contract changes E2 needs from RULES.md (pair picks, 2p burn, labour track, Raids, Honours) |
| F1 | fx | P0 | Reveal animation from latestEvents (reduced-motion safe) |
| F2 | fx | P1 | Port catan synth audio + game sounds |
| H1 | human | P0 | Approve the ruleset (D2-D4) before full rules engine (E2) starts |
| N0 | net | P0 | Multiplayer plan: port Catan rooms, add per-seat hidden-hand redaction -> docs/MULTIPLAYER.md |
| N2 | net | P0 | Fix qa Q0-N1..N4 (hello rate limit, double hello, host succession, engine throws) |
| N3 | net | P0 | Server runs real Windamere games; RoomClient; 2-tab online e2e |
| P1 | platform | P0 | Scaffold the Catan stack (pnpm, TS strict, Vite, Vitest, ESLint, Prettier, Pixi v8) + hello screen |
| P2 | platform | P0 | scripts/gate.sh (typecheck+lint+test, exit code) + GitHub Actions CI |
| P5 | platform | P0 | Deps for art (fonts, tokens import, art-dev.html under vite) and net (wrangler, workers-types) |
| P3 | platform | P1 | docs/REUSE.md: Catan module reuse map with effort estimates |
| P4 | platform | P1 | Port Windamere theme/fonts + seeded RNG + docs/ARCHITECTURE.md skeleton |
| P6 | platform | P1 | Verify ci.yml on GitHub and fix |
| P7 | platform | P1 | Import chrome.css next to tokens.css |
| P9 | platform | P1 | Browser automation dep + pnpm e2e entry |
| P8 | platform | P2 | pnpm sim script for bots |
| Q0 | qa | P0 | Red-team audit: hidden info (viewFor), net session cheats, determinism |
| Q1 | qa | P1 | Rules audit: engine vs docs/RULES.md, one audit test per rule |
| R1 | research | P0 | Genre + rules research: drafting/tableau games, mechanics, balance lessons -> docs/design/RESEARCH.md |
| R4 | research | P0 | Red-team originality + design-risk review of RULES/CARDS |
| R2 | research | P1 | Online drafting UX survey (BGA, colonist.io feel, timers, reconnect) -> docs/design/research/online-ux.md |
| R6 | research | P1 | Heuristic UX review of the playable game -> ux-review-1.md |
| R5 | research | P2 | Public balance/pace numbers to set sim targets |
| T1 | tutorial | P0 | docs/HOWTOPLAY.md one-page player summary |
| U0 | ui | P0 | UX spec + wireframes for every screen -> docs/design/UX.md |
| U3 | ui | P0 | Playable hotseat vs bots in the browser: setup -> table -> end scoring -> rematch |
| U4 | ui | P0 | Fix 404 asset; tunables-driven price test; Great Work SVG; playtest hooks; home screen |
| U1 | ui | P1 | Draft table UI: hand, city tableau, neighbours, simultaneous reveal |
