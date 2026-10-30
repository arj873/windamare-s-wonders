# Balance experiments (card L2)

Owner: balance lane. The report is `docs/BALANCE.md`; this folder holds the experiment overlays
and how to run them.

## How an experiment works

An experiment is a JSON **overlay** in `experiments/`. `scripts/balance.ts --overlay <file>`
patches the shipped content in memory (`scripts/balance-overlay.ts`) and runs the same seeded
games as the baseline. Design's `src/content/windamere` is never edited: a winning overlay goes to
design as exact value changes under `Needs:` in the balance status file.

The engine, the metrics and the bots' Great Work rating all read the patched content. Unknown ids
throw, and a test checks that every committed overlay gives valid content (`checkContent`).

```sh
export TMPDIR=/home/blop/projects/sevenwonders/.scratch/balance/tmp
R=/home/blop/projects/sevenwonders/.scratch/balance/runs
# baseline (all sections, 2-7 seats, about 9 minutes, ~300 MB RSS)
nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1 --json $R/baseline.json > $R/baseline.md
# one experiment (section 1 only, about 3 minutes)
nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1 --sections 1 \
  --overlay docs/balance/experiments/<name>.json --json $R/<name>.json > $R/<name>.md
# before/after table
pnpm exec tsx scripts/balance-diff.ts $R/baseline.json $R/<name>.json
```

Same seeds = same deals and shuffles, so a delta is the change's effect plus the bots' reaction,
not sampling noise between two different game sets. It is still one sample of 1000 games: a win
share has a standard error of about 1.1-1.6 points.

## Overlay fields (all optional)

| Field        | Meaning                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | Short id, echoed in the report                                                                                                                                                                      |
| `hypothesis` | What should move, and why                                                                                                                                                                           |
| `tunables`   | Engine `WwTunables` keys, replaced (e.g. `marketPrice: [1, 2, 3, 4]`, `honourSole`). `src/engine/game/shipped.ts` maps design's `TUNABLES` names onto these.                                        |
| `greatWorks` | `{ "<id>" or "*": patch }`; `*` applies to every Great Work first. Patch: `thresholds` or `thresholdDelta` (4 numbers), `tierRenown` (4, `null` keeps a tier) or `tierRenownDelta`, `perk`, `tiers` |
| `cards`      | `{ "<card id>": { cost, spend, effects, counts, upgrade } }`, each field replaced                                                                                                                   |
| `cardSpend`  | `{ labourDelta, refund, kinds, seasons }`: shift labour on matching Spend bands, `refund` coins per labour removed (default 1)                                                                      |
| `raids`      | `{ "<raid id>": { strength } }`                                                                                                                                                                     |

## Caveat for every number here

The bots are **greedy level 1**: they build the cheapest legal card that still scores and
otherwise Spend the card with the biggest band. They do not read Renown amounts, plan Lore runs,
chase Honours or time Guard. So the numbers measure _bot play_, not human play, and a change to a
Renown value moves the score sheet without changing a single bot decision (only the Great Work
choice reads Renown). Changes to costs, card counts, prices and Spend bands do change decisions.
