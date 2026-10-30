# Reuse map: Catan → Windamere's Wonders

Source: `/home/blop/projects/catan` (read-only). Paths are relative to it. Line counts are
non-test `.ts` lines I measured with `wc -l`; hour estimates are my **guesses** (untested), for
porting one module into this repo including tests, not for new features.

Key difference to keep in mind: Catan is turn-based with one active player. This game is
**simultaneous drafting** (everyone picks at once, hands pass). Anything that assumes "current
player" (engine turn loop, controller, turn timer, bot `act`) needs reshaping, not copying.

| Module                  | Path (Catan)                                                                    | What it does                                                                                                                 | Catan-specific parts                                                                      | Hours                                        | Lane     |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- | -------- |
| RNG                     | `src/engine/rng.ts` (152 lines)                                                 | Seeded sfc32, 128-bit state stored in game state, cyrb128 seeding, `isRngState`                                              | Dice helpers (`die`)                                                                      | 1                                            | engine   |
| Engine contract         | `src/engine/engine.ts` (117), `types.ts`, `clone.ts`, `migrate.ts`              | Pure `applyAction(state, action)`, legality list, deep clone, state-version migration                                        | All of `types.ts` (hexes, resources, dev cards); `applyAction` assumes one actor per step | 4–8 (pattern only; types rewritten)          | engine   |
| Per-player view         | `src/engine/view.ts` (160), `viewer.ts`                                         | Strips hidden info per seat before sending to a client; `viewLeak` tests check nothing leaks                                 | Which fields are secret (dev deck)                                                        | 3 (secrets are hands and pending picks here) | engine   |
| Clock / timers          | `src/engine/clock.ts` (139), `src/game/turnTimer.ts`                            | Deterministic timer state in the engine, UI countdown                                                                        | Per-turn timer; here it is per-draft-round                                                | 2–3                                          | engine   |
| Bot runner              | `src/bots/runner.ts` (333)                                                      | Drives bots against the engine, level selection (`levels.ts`, `byLevel.ts`)                                                  | Action vocabulary; sequential turns                                                       | 3–4                                          | bots     |
| Sim harness             | `src/bots/sim.ts` (529), `bench.ts`, `invariants.ts`                            | Headless N-game simulation, win-rate and length stats, invariant checks after every action, failure dumps in `sim-failures/` | Stats columns, invariants themselves                                                      | 3–4 (keep the loop and invariant hook)       | bots     |
| Smart bots              | `src/bots/smart/**`                                                             | Heuristic bots with own deterministic rng (lint-enforced)                                                                    | Almost all strategy                                                                       | 0 as code; reuse structure only              | bots     |
| Playtest harness        | `scripts/playtest/*`, `playtest/PLAYBOOK.md`                                    | CLI + in-page script so agent players play seats in a real browser; guards, outcome text                                     | Text formatting of Catan state, spot picker                                               | 6–10                                         | qa       |
| Net protocol            | `src/net/protocol.ts` (949), `transport.ts` (65)                                | Message schema, validation, version                                                                                          | Message types for trades/robber                                                           | 4–6                                          | net      |
| Room session            | `src/net/session.ts` (1183), `loopback.ts` (234), `client.ts` (479), `guard.ts` | Server-side room core with no DOM and no clock (time passed in), in-browser loopback transport, client                       | Trade negotiation, turn order; simultaneous picks need a "all submitted → resolve" step   | 10–16                                        | net      |
| Worker + Durable Object | `src/server/{worker,room,router,limits,origin}.ts` (~850), `wrangler.jsonc`     | Cloudflare Worker routing to one Durable Object per room, rate limits, origin checks                                         | Very little                                                                               | 4–6                                          | net      |
| In-browser dev server   | `src/game/online/{devServer,devWorker,devBackend,backend}.ts`                   | Runs the room server in a Web Worker so `pnpm dev` supports online without wrangler                                          | Little                                                                                    | 3–4                                          | net      |
| Setup / lobby UI        | `src/ui/setup/*`, `src/ui/online/{home,lobby,lobbyModel,configPanel,chat}.ts`   | Setup screen, home screen, lobby, chat                                                                                       | Map previews, expansion pickers, Catan options                                            | 8–12                                         | ui       |
| HUD plumbing            | `src/ui/{dom,model,log,sidebar,widgets,motion}.ts`                              | DOM helpers, view-model pattern, event log, sidebar                                                                          | Resource/build panels                                                                     | 4–6                                          | ui       |
| Theme                   | `src/ui/theme/*` (+ `src/render/theme.ts`)                                      | Switchable CSS looks (`?theme=`), saved pick, picker                                                                         | Palette values                                                                            | 2–3                                          | art      |
| Audio                   | `src/audio/*` (979)                                                             | Web Audio synth (recipes, voices), limiter, settings (volume/mute)                                                           | Recipe names (dice, robber)                                                               | 3–5                                          | art      |
| Pixi viewport           | `src/render/{viewport,frames,geometry,marks}.ts`                                | Pan/zoom, frame loop, pointer input without Pixi's event system                                                              | Hex geometry                                                                              | 2–4 for viewport                             | ui       |
| Profile / persistence   | `src/ui/profile/*`, `src/game/persist.ts`                                       | Player name/colour profile, save/restore game                                                                                | Piece-style previews                                                                      | 2–3                                          | ui       |
| Vite config tricks      | `vite.config.ts`                                                                | Chunk split (home screen first, game lazy), Pixi extras stub, CSP injection, git SHA define                                  | Expansion chunk groups                                                                    | 2 (when bundle size matters)                 | platform |
| CI                      | `.github/workflows/ci.yml`                                                      | pnpm + Node 24 gate                                                                                                          | e2e:online step                                                                           | done (P2)                                    | platform |

## Not worth porting

- `src/expansions/**` (37k lines): Catan expansion framework and packs.
- `src/engine/{board,hex,maps,topology,mapLookup}.ts`, `src/render/BoardView.ts`, `seaArt.ts`, `pieceStyles*.ts`: hex board.
- Tutorial (`src/ui/tutorial`), stats screens: revisit only after the core loop works.

## Suggested port order (my opinion)

1. RNG + engine contract pattern (engine) → unblocks bots and UI.
2. Sim harness + invariants (bots) → balance feedback early.
3. Net session/protocol + Worker (net) → online, after hotseat works.
4. Setup/lobby UI, theme, audio (ui/art) in parallel with the above.
5. Playtest harness (qa) once there is a playable UI.

## Unknowns

- Hour estimates are guesses; none of this was ported or run here.
- I have not read all of `src/net/session.ts`; the simultaneous-pick cost there is the biggest uncertainty.
