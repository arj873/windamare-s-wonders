# KANBAN — Windamere's Wonders (mirror)

**Live board: https://github.com/users/arj873/projects/3/views/1** · this file is generated from `.orchestra/cards.json`; agents read-only.
Updated: 2026-10-30 00:33 · Progress: **31 / 44 cards done**

## In progress (10)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A3 | art | P0 | Retheme to the real design: 6 kinds, goods, Lore ranks, Raid frame, Great Work track, Honours |
| A5 | art | P0 | Goods icons (final D2c names) + coin + labour |
| A2 | art | P1 | Table chrome: background, seat panel, neighbour strips, timer badge, title key art |
| B3 | bots | P1 | Level-1 heuristic bot + sim report vs balance-targets.md |
| D8 | design | P1 | Rule fixes: Summer price 2, R6.7 vs R17.9, deck size vs seats, re-tune plan |
| E2 | engine | P0 | Full rules engine: done for 3-7 towns; left: Great Work choice, 2-player, Recall |
| N1b | net | P0 | Real-engine adapter + real-engine leak test |
| N1 | net | P1 | Online rooms via Cloudflare Durable Objects (port from Catan) |
| Q1 | qa | P1 | Rules audit: engine vs docs/RULES.md, one audit test per rule |
| U3 | ui | P0 | Playable hotseat vs bots in the browser: setup -> table -> end scoring -> rematch |

## Ready (2)

| Card | Lane | Pri | Title |
|---|---|---|---|
| B4 | bots | P0 | First sim report on the real ruleset -> docs/BALANCE.md |
| U2 | ui | P1 | Fix R4 red-team: O4 placeholders + popover, O12 score tally |

## Backlog (1)

| Card | Lane | Pri | Title |
|---|---|---|---|
| D7 | design | P2 | First-game option (Honours and upgrades off) after sim numbers |

## Done (31)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A1 | art | P0 | Art direction + card frame + icon set (SVG) -> docs/design/ART.md, public/art, art-dev.html |
| A4 | art | P0 | Fix R4 red-team: O1 palette/type map, O2 glass+cloth, O3 stage sockets |
| B1 | bots | P1 | Random + heuristic bots, headless sim, balance report |
| B2 | bots | P1 | 3 difficulty levels plan -> docs/BOTS.md |
| D2 | design | P0 | Original ruleset with numbered rules -> docs/RULES.md |
| D2b | design | P0 | Answer lane questions in RULES.md: pick change before reveal, early resolve, timers, resolution order |
| D2c | design | P0 | Human changes: new goods set, single pick, neighbour trade (own mechanism/numbers) |
| D3 | design | P0 | ORIGINALITY.md: 7 Wonders signature systems vs our replacements |
| D5 | design | P0 | Card data into src/content + content tests (after H1) |
| D6 | design | P0 | Fix R4 red-team: O5-O16 names/numbers, D1 neighbour share, D2 Watch/Raid bug |
| D4 | design | P1 | Card catalog draft with counts per player count -> docs/design/CARDS.md |
| E1 | engine | P0 | Game-agnostic draft core: seats, hidden simultaneous picks, reveal, hand passing, seeded RNG, per-seat views |
| E1b | engine | P1 | Contract changes E2 needs from RULES.md (pair picks, 2p burn, labour track, Raids, Honours) |
| H1 | human | P0 | Approve the ruleset (D2-D4) before full rules engine (E2) starts |
| N0 | net | P0 | Multiplayer plan: port Catan rooms, add per-seat hidden-hand redaction -> docs/MULTIPLAYER.md |
| N2 | net | P0 | Fix qa Q0-N1..N4 (hello rate limit, double hello, host succession, engine throws) |
| P1 | platform | P0 | Scaffold the Catan stack (pnpm, TS strict, Vite, Vitest, ESLint, Prettier, Pixi v8) + hello screen |
| P2 | platform | P0 | scripts/gate.sh (typecheck+lint+test, exit code) + GitHub Actions CI |
| P5 | platform | P0 | Deps for art (fonts, tokens import, art-dev.html under vite) and net (wrangler, workers-types) |
| P3 | platform | P1 | docs/REUSE.md: Catan module reuse map with effort estimates |
| P4 | platform | P1 | Port Windamere theme/fonts + seeded RNG + docs/ARCHITECTURE.md skeleton |
| P6 | platform | P1 | Verify ci.yml on GitHub and fix |
| P7 | platform | P1 | Import chrome.css next to tokens.css |
| P8 | platform | P2 | pnpm sim script for bots |
| Q0 | qa | P0 | Red-team audit: hidden info (viewFor), net session cheats, determinism |
| R1 | research | P0 | Genre + rules research: drafting/tableau games, mechanics, balance lessons -> docs/design/RESEARCH.md |
| R4 | research | P0 | Red-team originality + design-risk review of RULES/CARDS |
| R2 | research | P1 | Online drafting UX survey (BGA, colonist.io feel, timers, reconnect) -> docs/design/research/online-ux.md |
| R5 | research | P2 | Public balance/pace numbers to set sim targets |
| U0 | ui | P0 | UX spec + wireframes for every screen -> docs/design/UX.md |
| U1 | ui | P1 | Draft table UI: hand, city tableau, neighbours, simultaneous reveal |
