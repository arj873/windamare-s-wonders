# KANBAN — Windamere's Wonders (mirror)

**Live board: https://github.com/users/arj873/projects/3/views/1** · this file is generated from `.orchestra/cards.json`; agents read-only.
Updated: 2026-10-29 21:47 · Progress: **6 / 22 cards done**

## In progress (8)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A2 | art | P1 | Table chrome: background, seat panel, neighbour strips, timer badge, title key art |
| D2 | design | P0 | Original ruleset with numbered rules -> docs/RULES.md |
| D3 | design | P0 | ORIGINALITY.md: 7 Wonders signature systems vs our replacements |
| E1 | engine | P0 | Game-agnostic draft core: seats, hidden simultaneous picks, reveal, hand passing, seeded RNG, per-seat views |
| N1 | net | P1 | Online rooms via Cloudflare Durable Objects (port from Catan) |
| P5 | platform | P0 | Deps for art (fonts, tokens import, art-dev.html under vite) and net (wrangler, workers-types) |
| R1 | research | P0 | Genre + rules research: drafting/tableau games, mechanics, balance lessons -> docs/design/RESEARCH.md |
| U0 | ui | P0 | UX spec + wireframes for every screen -> docs/design/UX.md |

## Ready (3)

| Card | Lane | Pri | Title |
|---|---|---|---|
| D4 | design | P1 | Card catalog draft with counts per player count -> docs/design/CARDS.md |
| P6 | platform | P1 | Verify ci.yml on GitHub and fix |
| R2 | research | P1 | Online drafting UX survey (BGA, colonist.io feel, timers, reconnect) -> docs/design/research/online-ux.md |

## Backlog (5)

| Card | Lane | Pri | Title |
|---|---|---|---|
| B1 | bots | P1 | Random + heuristic bots, headless sim, balance report |
| E2 | engine | P0 | Full rules engine, one test per numbered rule |
| H1 | human | P0 | Approve the ruleset (D2-D4) before full rules engine (E2) starts |
| Q1 | qa | P1 | Rules audit: engine vs docs/RULES.md, one audit test per rule |
| U1 | ui | P1 | Draft table UI: hand, city tableau, neighbours, simultaneous reveal |

## Done (6)

| Card | Lane | Pri | Title |
|---|---|---|---|
| A1 | art | P0 | Art direction + card frame + icon set (SVG) -> docs/design/ART.md, public/art, art-dev.html |
| N0 | net | P0 | Multiplayer plan: port Catan rooms, add per-seat hidden-hand redaction -> docs/MULTIPLAYER.md |
| P1 | platform | P0 | Scaffold the Catan stack (pnpm, TS strict, Vite, Vitest, ESLint, Prettier, Pixi v8) + hello screen |
| P2 | platform | P0 | scripts/gate.sh (typecheck+lint+test, exit code) + GitHub Actions CI |
| P3 | platform | P1 | docs/REUSE.md: Catan module reuse map with effort estimates |
| P4 | platform | P1 | Port Windamere theme/fonts + seeded RNG + docs/ARCHITECTURE.md skeleton |
