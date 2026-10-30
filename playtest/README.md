# Playtest harness (qa, card Q2)

## Layer 1 is built: text mode (no browser)

```
pnpm pt:serve --seats 3 --humans 1,2 --seed demo --level medium   # one game, bots in the other seats
pnpm -s pt 1 status | cards | choose <n> | pick <n> build|spend [flags] | unpick | wait | result
pnpm -s pt 1 report --title ... --severity ... --expected ... --actual ... --steps ...
pnpm -s pt stop
```

It runs the real engine and the shipped bots (`pickFor`) and prints what that seat's `viewFor`
allows, using the UI's own `windamerePresenter` for the Build/Spend lines and the refusal wording.
So it finds rules, wording and flow problems, not UI bugs. Tests: `playtest/*.test.ts` (a scripted
human plays whole games at 2, 3 and 7 seats; two humans never see each other's hand or pick).
`boot.ts` patches `import.meta.env` for node (see Needs in the status file). `--pay` takes one
entry per missing good, as `cards` lists them: `buy:<seat>`, `bank`, `exchange:<good>` or `auto`.

Layers 2 and 3 (browser, online) below are still plans: they need the ui hooks and a scripted room.

## Plan for the browser layer

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
