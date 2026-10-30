# KANBAN — Windamere's Wonders (mirror)

**Live board: https://github.com/users/arj873/projects/3/views/1** · this file is generated from `.orchestra/cards.json`; agents read-only.
Updated: 2026-10-29 23:13 · Progress: **16 / 33 cards done**

## In progress (13)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A3 | art | P0 | Retheme to the real design: 6 kinds, goods, Lore ranks, Raid frame, Great Work track, Honours |
| A2 | art | P1 | Table chrome: background, seat panel, neighbour strips, timer badge, title key art |
| B1 | bots | P1 | Random + heuristic bots, headless sim, balance report |
| D2b | design | P0 | Answer lane questions in RULES.md: pick change before reveal, early resolve, timers, resolution order |
| D2c | design | P0 | Human changes: new goods set, single pick, neighbour trade (own mechanism/numbers) |
| E2 | engine | P0 | Full rules engine, one test per numbered rule |
| E1b | engine | P1 | Contract changes E2 needs from RULES.md (pair picks, 2p burn, labour track, Raids, Honours) |
| N1b | net | P0 | Real-engine adapter + real-engine leak test |
| N1 | net | P1 | Online rooms via Cloudflare Durable Objects (port from Catan) |
| P7 | platform | P1 | Import chrome.css next to tokens.css |
| Q0 | qa | P0 | Red-team audit: hidden info (viewFor), net session cheats, determinism |
| R4 | research | P0 | Red-team originality + design-risk review of RULES/CARDS |
| U1 | ui | P1 | Draft table UI: hand, city tableau, neighbours, simultaneous reveal |

## Ready (3)

| Card | Lane | Pri | Title |
|---|---|---|---|
| B2 | bots | P1 | 3 difficulty levels plan -> docs/BOTS.md |
| D5 | design | P0 | Card data into src/content + content tests (after H1) |
| R5 | research | P2 | Public balance/pace numbers to set sim targets |

## Backlog (1)

| Card | Lane | Pri | Title |
|---|---|---|---|
| Q1 | qa | P1 | Rules audit: engine vs docs/RULES.md, one audit test per rule |

## Done (16)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A1 | art | P0 | Art direction + card frame + icon set (SVG) -> docs/design/ART.md, public/art, art-dev.html |
| D2 | design | P0 | Original ruleset with numbered rules -> docs/RULES.md |
| D3 | design | P0 | ORIGINALITY.md: 7 Wonders signature systems vs our replacements |
| D4 | design | P1 | Card catalog draft with counts per player count -> docs/design/CARDS.md |
| E1 | engine | P0 | Game-agnostic draft core: seats, hidden simultaneous picks, reveal, hand passing, seeded RNG, per-seat views |
| H1 | human | P0 | Approve the ruleset (D2-D4) before full rules engine (E2) starts |
| N0 | net | P0 | Multiplayer plan: port Catan rooms, add per-seat hidden-hand redaction -> docs/MULTIPLAYER.md |
| P1 | platform | P0 | Scaffold the Catan stack (pnpm, TS strict, Vite, Vitest, ESLint, Prettier, Pixi v8) + hello screen |
| P2 | platform | P0 | scripts/gate.sh (typecheck+lint+test, exit code) + GitHub Actions CI |
| P5 | platform | P0 | Deps for art (fonts, tokens import, art-dev.html under vite) and net (wrangler, workers-types) |
| P3 | platform | P1 | docs/REUSE.md: Catan module reuse map with effort estimates |
| P4 | platform | P1 | Port Windamere theme/fonts + seeded RNG + docs/ARCHITECTURE.md skeleton |
| P6 | platform | P1 | Verify ci.yml on GitHub and fix |
| R1 | research | P0 | Genre + rules research: drafting/tableau games, mechanics, balance lessons -> docs/design/RESEARCH.md |
| R2 | research | P1 | Online drafting UX survey (BGA, colonist.io feel, timers, reconnect) -> docs/design/research/online-ux.md |
| U0 | ui | P0 | UX spec + wireframes for every screen -> docs/design/UX.md |
