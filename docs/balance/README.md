# Balance experiments (card L2)

Owner: balance lane. The report is `docs/BALANCE.md`; this folder holds the experiment overlays
and how to run them.

## How an experiment works

An experiment is a JSON **overlay** in `experiments/`. `scripts/balance.ts --overlay <file>`
patches the shipped content in memory (`scripts/balance-overlay.ts`) and runs the same seeded
games as the baseline. Design's `src/content/windamere` is never edited: a winning overlay goes to
design as exact value changes under `Needs:` in the balance status file.

The engine, the metrics and every bot level read the patched content. Levels 2-3 read a shared
rules object in `src/bots/windamere.ts`; `scripts/balance.ts` points it at the overlay's rules in
its own process and checks that it took (asked of bots: let `createWindamereBot` take the rules).
Unknown ids throw, and a test checks that every committed overlay gives valid content
(`checkContent`).

`--level 1|2|3` picks the bot for sections 1 (equal bots) and 2 (K1, one bot among random ones).
Level 1 is greedy: it never reads a Renown amount. Level 2 rates each pick by its score delta
(`src/bots/windamereEval.ts`); level 3 adds denial. Section 3 (specialists) is always level 1;
section 4 is K2, levels 1, 2 and 3 at one table. Every number in the report says its level.

```sh
export TMPDIR=/home/blop/projects/sevenwonders/.scratch/balance/tmp
R=/home/blop/projects/sevenwonders/.scratch/balance/runs
# level-1 baseline (sections 1-3, 2-7 seats, 5-10 minutes on a loaded machine, ~300 MB RSS)
nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1 --json $R/base.json > $R/base.md
# level 2 (about 4x slower than level 1; level 3 about 6x)
nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1 --sections 1,2 --level 2 \
  --json $R/base-l2.json > $R/base-l2.md
# one experiment (section 1 only)
nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1 --sections 1 \
  --overlay docs/balance/experiments/<name>.json --json $R/<name>.json > $R/<name>.md
# before/after table (warns if games, seeds or levels differ)
pnpm exec tsx scripts/balance-diff.ts $R/base.json $R/<name>.json
```

Same seeds = same deals and shuffles, so a delta is the change's effect plus the bots' reaction,
not sampling noise between two different game sets. An overlay that changes no bot decision
(e.g. Honours values at level 1) replays identical games, so its delta is exact. Any other
overlay sends games down different paths, and then a delta under about 3 points on a share is
within noise (one 1000-game share has a standard error of 1.1-1.6 points). A Great Work's win
ratio has a standard error of about sqrt(3.5 / towns that held it): 0.03-0.04 for the common ones,
0.11 at 300 holders.

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

Every number measures **bot play, not human play**. Level 1 (greedy) builds the cheapest legal
card that still scores and otherwise Spends the card with the biggest band; it does not read
Renown amounts, plan Lore runs, chase Honours or time Guard, so a change to a Renown value moves
its score sheet without changing a single decision (only the Great Work choice reads Renown).
Changes to costs, card counts, prices and Spend bands do change its decisions. Level 2 reads score
deltas one pick ahead, so it reacts to Renown changes too; it is still a one-ply bot, not a human.
