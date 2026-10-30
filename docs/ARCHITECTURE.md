# Architecture

Windamere's Wonders: browser card-drafting game. TypeScript strict, PixiJS v8, Vite, Vitest, pnpm.
Rules: `docs/RULES.md` (design lane). Reuse map from Catan: `docs/REUSE.md`.

## 1. Layers

```
src/shared/   game-agnostic utilities     no DOM, no Pixi; imported by anyone
src/content/  card and monument data       design lane; plain data, no logic
src/engine/   pure rules engine            no DOM, no Pixi, no Math.random, no Date (lint-enforced)
src/bots/     bots + headless sim          imports engine only
src/render/   PixiJS views                 imports engine (read-only)
src/ui/       HTML/CSS overlay + theme     imports engine (read-only)
src/game/     controller                   owns the current game state; wires everything
src/net/      online protocol + session    no DOM, no Pixi, no Date (lint-enforced)
src/server/   Cloudflare room server       Worker + Durable Object around the net session
src/main.ts   entry; src/app.ts  app boot
```

Dependencies point down the list only where noted: engine imports `shared` and `content` and nothing
else. Lint enforces the engine and net bans (`eslint.config.js`).

## 2. Lane ownership

See the lane table in `AGENTS.md`. One owner per path; cross-lane changes go through `Needs:` in the
status file.

## 3. Engine contract

Owned by the engine lane. See `docs/ENGINE.md` (not written yet).

## 4. Tooling

| Command                            | Does                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm dev`                         | Vite dev server                                                                            |
| `pnpm build`                       | typecheck + production build into `dist/`                                                  |
| `pnpm typecheck` / `lint` / `test` | `tsc --noEmit` / eslint + prettier check / vitest (2 workers max)                          |
| `scripts/gate.sh`                  | frozen install + typecheck + lint + test; last line `GATE PASS` or `GATE FAIL`; CI runs it |

Tests live next to the code as `*.test.ts`; QA audits are `*.audit.test.ts`.
