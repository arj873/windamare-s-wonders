# Playtest harness (qa, card Q2)

## Two layers, both built

```
pnpm pt:serve --seats 3 --humans 1,2 --seed demo --level medium    # text mode: engine in-process, bots
pnpm pt:serve --browser --seats 3 --seed demo [--headed] [--port 4187] [--no-build]
pnpm -s pt <seat> status | cards | choose <n> | pick <n> build|spend [flags] | unpick | wait | result
pnpm -s pt <seat> report --title ... --severity ... --expected ... --actual ... --steps ...
pnpm -s pt stop
```

**Text mode** runs the real engine and the shipped bots (`pickFor`) and prints what that seat's
`viewFor` allows, using the UI's own `windamerePresenter` for the Build/Spend lines and refusal
wording. It finds rules, wording and flow problems, not UI bugs.

**Browser mode** builds the app (into `.scratch/qa/pt-dist`, outside the repo and `/tmp`), serves it
with `vite preview` on 127.0.0.1:`--port`, opens system Chrome (`/usr/bin/google-chrome-stable`,
override with `PT_CHROME`) on `/?debug=1&seats=N&seed=S` and plays by **clicking the real UI**
(UX.md §18 hooks). State is read from `window.__pt.view(seat)`, never from the engine in the
page. After each click the view is compared with what the click should have done: "UI PROBLEM:
clicked Build but nothing was recorded" is a finding. Extra commands:

- `check` - for every card in the hand, is Build/Spend enabled on screen exactly when the engine says
  it is legal, and does a disabled button's `data-why` equal the engine's reason?
- `autoplay [--moves 400]` - plays every seat to the end of the game through the UI (first Build the
  engine allows, else Spend) and lists the problems it met. A smoke test, not a player.
- `dom <css>` - match count, first HTML, bounding box, and what covers it (for bug reports).
- `shot [name]` and `console` (new console errors and page errors).

Hotseat rule: the page is drawn for ONE seat at a time. The UI stays on a human while they still
have to act, then moves to the next, so play the seat `status` says the table is drawn for (the
`[UI: table drawn for seat N]` line); other seats get "table is drawn for seat N". The Season-end
summary dialog is modal: the harness presses Continue before it acts. `unpick` only works while the table is still drawn for you (it moves on after your pick). Browser mode starts 3 to 7
seats (the UI has no 2-seat game; see AUDIT.md). `--any`, `--glean`, `--burn` have no UI hooks, so
browser `pick` refuses them. `--pay` takes one entry per missing good: `buy:<seat>`, `bank`,
`exchange:<good>` or `auto`.

Tests (`playtest/*.test.ts`, in the gate): text helpers, the text game (a scripted human plays whole
games at 2, 3 and 7 seats; two humans never see each other's hand or pick) and the shared renderer.
The browser layer is **not** in the gate (it needs Chrome and a build); it was run by hand, see
AUDIT.md Q2b.

## Layer 3: online (`playtest/online.ts`)

```
nice -n 19 pnpm exec tsx playtest/online.ts [--seats 3..7] [--headed] [--out shots-dir]
```

One Chrome context per seat against `wrangler dev` (app and room server on one origin; reuses net's
`src/server/e2e/support.ts` for the build, wrangler and the basic leak canary). The seats create and
join a room through the lobby, start with the Fast clock, and play to the final scores by clicking.
It checks every `game` frame each tab gets (net's canary, the seed and rng are the masks, other
seats' prompt data and glean zone hidden, later Raids and other towns' Great Work hidden, `seq`
never goes back, every frame parses), drops one tab's network and restores it, reloads that tab
(same member, same seat, views flowing), and at the end all tabs must hold the same result.
About 3 to 6 minutes, heavy (build + workerd + one Chrome per seat); not in the gate. It is a
script, not a `pt` mode: there are no per-seat CLI commands online yet.

## Original plan (kept for reference)

## What Catan has (`/home/blop/projects/catan/scripts/playtest`, ~4000 lines, read-only reference)

| Part                                                           | Job                                                                                                                                                                              | Reuse here                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `serve.ts`                                                     | one process: builds the app, `vite preview`, opens Chromium (Playwright), keeps one page per seat, serves short commands over HTTP on 127.0.0.1; port in `playtest/session.json` | port as is; seats 2-7, no map/vp options                                  |
| `cli.ts`                                                       | `pnpm -s pt <seat> <command>`: prints plain text and exits, so an LLM agent plays by shell calls                                                                                 | port; new command list below                                              |
| `inpage.js`                                                    | injected scanner: lists visible buttons/steppers/dropdowns as `Control`s tagged `data-pt`, reads hints from `data-why`                                                           | port; our table needs the hooks in "Needs from ui"                        |
| `format.ts`, `text.ts`, `guard.ts`, `outcome.ts`, `options.ts` | pure: status text, button matching, "is it your move", wake reasons, game outcome, CLI flags                                                                                     | port first (they have unit tests to copy)                                 |
| `spots.ts`                                                     | numbered board spots to click                                                                                                                                                    | drop (no board); replaced by `cards` below                                |
| `online.ts`                                                    | one browser context per human seat against a room server, drop/reconnect                                                                                                         | port after the hotseat path works (net's `GameSession` is the same shape) |

## Commands for Windamere (draft)

```
pnpm -s pt <seat> wait [--timeout 600]   block until the seat must act (pick, a prompt answer, the Great Work choice) or the game ends
pnpm -s pt <seat> status                 hand (with Spend bands), store/coins/labour, tableau, neighbours' stores, Season price, Raid and my Guard, ready marks, log tail
pnpm -s pt <seat> cards                  numbered hand cards and each legal use: build (with the payment plan the UI preselects) / spend
pnpm -s pt <seat> pick <n> build|spend [--pay buy:left,bank,exchange:flint] [--cover <card>] [--any flint,slate]
pnpm -s pt <seat> unpick
pnpm -s pt <seat> choose-gw <n>          the Great Work choice
pnpm -s pt <seat> shot [table|hand|full]
pnpm -s pt <seat> console                new page console errors
pnpm -s pt <seat> report --title ... --severity blocker|major|minor|visual --expected ... --actual ... --steps ...
online only: drop | reconnect | reload | chat <msg>
```

`pick` clicks the real UI (card, then Build/Spend, then the payment controls). It never calls the
engine directly: the point is to find UI bugs. State is only read (from the page's own DOM and
from `window.__pt`), never from the engine singleton.

## Two layers, in this order

1. **Text layer (no browser).** `format`, `guard`, `text`, `options` ported against engine
   `DraftView`s, tested with vitest. Gives agents a readable `status` and gives qa a way to run
   scripted bot-vs-bot games through the same text. Can start as soon as `playtest/**` is in the
   vitest include list.
2. **Browser layer.** `serve`/`cli`/`inpage` with Playwright. Hotseat first (one page, cover
   screen "Pass to <name>"), then online (one context per seat).

## Needs

- **platform (P9):** `playwright` + `tsx` devDependencies; `pt` and `pt:serve` scripts; add
  `playtest/**/*.test.ts` to `vitest.config.ts` include; browsers installed outside `/tmp`
  (`PLAYWRIGHT_BROWSERS_PATH=/home/blop/projects/sevenwonders/.scratch/qa/browsers`).
- **ui:** a debug entry (`?debug=1`) that starts an all-human game with named seats, plus stable
  hooks on the table: `data-pt-role` on card, Build, Spend, payment choice, ready mark, prompt
  buttons; `data-why` on a disabled Build (why it is illegal); `role="img"` + `aria-label` on goods
  and coin icons so the scanner reads "Slate x2" not an emoji; a `window.__pt.view()` that returns
  the seat's engine `DraftView` as JSON (read-only).
- **net (online step):** a way to start a local room server on a fixed port (`wrangler dev`) and
  create/join/start from a script (Catan's `online.ts` does this over the HTTP API in
  `src/net/api.ts`).
- **RAM:** one Chromium per seat is heavy. Run at most 3 human seats headless, bots for the rest;
  never leave `pt:serve` running at the end of a card.

## Out of scope for now

No board spots, no screenshots-as-oracle, no visual diffing. Bug reports go to
`playtest/bugs/*.md` (same `report` format as Catan) and are summarised in the status file.
