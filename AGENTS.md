# Windamere's Wonders — agent rules (CLAUDE.md is a symlink to this file)

**Goal (human):** an original browser card-drafting civilization game set in Windamere, that
plays like a polished online board game (colonist.io is the bar for feel): hotseat vs bots
first, then online. Every card serves this.

You are one of several coding agents. An orchestrator assigns work, merges branches, and runs a
standup every 3 hours. Reference codebase (read-only, same author, same stack):
`/home/blop/projects/catan` — a Catan-like game; reuse its patterns and code freely.

## Hard rules
1. **Stay in your lane.** Work only in your worktree and branch (`agent/<name>`); edit only the
   paths your lane owns (table below). Need a change elsewhere? Write it under `Needs:` in your
   status file.
2. **Never touch `main`. Never push.** Never force-push or rewrite shared history.
3. **Never write inside `/home/blop/projects/catan`.** Read and copy from it only.
4. CPU-heavy commands under `nice -n 19` (pnpm install/build/test, tsc, vitest, sims); never a
   negative nice, never sudo.
5. **Original game.** We build a game in the drafting genre, not a copy of 7 Wonders. Do not
   reproduce 7 Wonders' card list, card names, costs, numbers, scoring tables, wonder boards or
   art. Genre mechanics (simultaneous drafting, hand passing, tableau building, neighbour
   interaction, a personal monument) are fine. `docs/design/ORIGINALITY.md` is the line.
6. Lane agents run in **opencode with `opencode/deepseek-v4.1-flash-free`** only (human's
   decision, 2026-11-01). No other models or agent tools. Do not spawn subagents for lane work.
   `opencode.json` in your worktree root is the orchestrator's (model + denied commands such as
   `git push` and `sudo`); never edit or commit it.

## Lanes
Agent names are `ww-<lane>`; status and inbox files use the bare lane name.

| Lane | Agent | Owns |
|---|---|---|
| research | opencode | `docs/design/RESEARCH.md`, `docs/design/research/**` |
| design | opencode | `docs/RULES.md`, `docs/design/**` except research/UX/ART files, `src/content/**` (card data, once rules are approved) |
| platform | opencode | `package.json`, `pnpm-*`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettier*`, `.github/**`, `scripts/gate.sh`, `index.html`, `src/shared/**`, `docs/ARCHITECTURE.md`, `docs/REUSE.md`, `LICENSE` |
| engine | opencode | `src/engine/**`, `docs/ENGINE.md` |
| ui | opencode | `src/main.ts`, `src/app.ts`, `src/ui/**` except theme/online/fx/tutorial/help, `src/render/**`, `src/game/**` except online, `docs/design/UX.md` |
| online | opencode | `src/ui/online/**`, `src/game/online/**` |
| fx | opencode | `src/ui/fx/**`, `src/audio/**`, `public/audio/**` |
| tutorial | opencode | `src/ui/tutorial/**`, `src/ui/help/**`, `docs/HOWTOPLAY.md` |
| art | opencode | `src/ui/theme/**`, `public/**` except audio, `docs/design/ART.md`, `art-dev.html` |
| net | opencode | `src/net/**`, `src/server/**`, `wrangler.jsonc`, `docs/MULTIPLAYER.md` |
| bots | opencode | `src/bots/**`, `scripts/sim*` |
| balance | opencode | `docs/BALANCE.md`, `docs/balance/**`, `scripts/balance*` |
| qa | opencode | `src/**/*.audit.test.ts`, `docs/AUDIT.md`, `playtest/**` |

Root files not listed (`README.md`, `AGENTS.md`, `KANBAN.md`, `.gitignore`) belong to the
orchestrator. Need a dependency? Ask platform under `Needs:`.

## Shared machine (RAM is tight: ~8 GB free, many agents)
- **Never write to `/tmp`** (tmpfs = RAM). Use `/home/blop/projects/sevenwonders/.scratch/<lane>/`
  and `export TMPDIR=/home/blop/projects/sevenwonders/.scratch/<lane>/tmp`. Delete scratch when done.
- `free -g` before heavy work; under 3 GB available → wait. Vitest `--maxWorkers=2` max. One
  heavy process at a time. Never leave a dev server running when you finish a card.

## Workflow
- Small commits; prefix each subject with your lane (`design: ...`). Before each commit run the
  gate once it exists: `nice -n 19 scripts/gate.sh` (typecheck + lint + test). Commit only when
  it prints `GATE PASS` and exits 0; never pipe it through grep or tail (that hides the exit code).
- New session? Read the last 3 sections of your status file and the latest inbox section first;
  that is where your lane stands.
- Change files with the Edit/Write tools rather than sed or heredocs in Bash.
- Merges happen via squashed GitHub PRs. After yours merges you get the merged tip; run
  `git fetch . main:main 2>/dev/null; git rebase --onto main <tip>`. When told "rebase":
  `git fetch . main:main 2>/dev/null; git rebase main`.
- **Status file** `/home/blop/projects/sevenwonders/.orchestra/status/<name>.md`: append a new
  section when you finish a card or get blocked (the latest section is the truth):
  ```
  ## <name> — <ISO timestamp>
  Doing: <card + one line>
  Done: <cards with commit hashes>
  Next: <card>
  Needs: <who/what, or "none">
  Findings: <numbers, or "none">
  ```
- **Inbox** `/home/blop/projects/sevenwonders/.orchestra/inbox/<name>.md`: read the latest
  section when prompted and when you finish a card.
- Out of cards? Take the next unclaimed card in your lane from `KANBAN.md`, or propose cards
  under `Next:`. No idle wandering into other lanes.

## Honesty
Report what you actually ran and its output. Say "untested" when it is. Unsure about a rule or
a number? Say so in the doc instead of inventing certainty. Negative results get written down.
