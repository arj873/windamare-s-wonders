# Bots — contract, simulator and difficulty plan

Owner: **bots** lane. Status (2026-10-29): **B1 implemented** against the toy ruleset (random bot +
simulator). **B2 below is a plan**: nothing in it is implemented or measured. It is written against
`docs/RULES.md` as it stood before the human's changes (2026-10-29 23:15): **single pick** (one
card a turn, Build or Spend), **a new set of goods** (names TBD) and **neighbour trade** (buy
goods from a neighbour, coins to them). design's D2c rewrites the rules; rule numbers and pair-pick
details below are stale until B3 re-reads it. Sections 3 and 4 are already adjusted to single pick.

## 1. Contract (B1, implemented)

```ts
interface Bot<S, T> {
  name: string;
  act(ctx: { engine; view; seat; rng }): DraftAction | null;
}
```

- A bot gets **only `engine.viewFor(state, seat)`** (ENGINE.md §7), never the full state. The
  runner builds the view per seat per decision; a test (`bots.test.ts`) fails if another seat's
  hand reaches a bot.
- A bot lists moves with `engine.legalActions(view, seat)` (view-safe, ENGINE.md §6) and returns one
  `pick` / `answer` action. It must not return `unpick`.
- A bot owns its `Rng` (`new Rng(seed)`), never `state.rng`.
- Same code path for hotseat bots and server-side bots (net seats a bot by calling `act` on the
  seat's view).
- `Bot<S, T>` is generic. Bind it to the ruleset's state types: `createRandomBot<WSeat, WTable>()`.

### Entry point for net and ui: `pickFor`

```ts
import { pickFor } from '../bots';
const action = pickFor(engine, engine.viewFor(state, seat), seat, {
  level: 'easy',
  salt: roomBotSeed,
});
if (action) engine.applyAction(state, action); // the caller applies it to the full state
```

- Takes the seat's **view** (never the state), returns a `pick` or `answer` action, or `null` if the
  seat has nothing to do (game over, no legal action). Never `unpick`.
- Stateless and deterministic: the RNG is derived from `salt`, seat and the view's `seq`, `round`,
  `turn`, so repeating a call gives the same action (safe across a server restart).
- Call it once per seat that `engine.waitingOn(state)` lists. For a prompt it answers the open one.
- `level`: `'easy' | 'medium' | 'hard'`. **Today every level is the same uniform random policy**; the
  smarter levels arrive with B3/B5 behind the same signature, so net needs no change then.
- Cost: one `viewFor`-sized `legalActions` call; untested at Windamere scale.

Simulator: `src/bots/sim.ts` (`runGame`, `runSim`, `summarize`), CLI `scripts/sim.ts`:

    nice -n 19 npx tsx scripts/sim.ts --games 200 --seed 1 --seats 4 [--max-actions 5000]

It reports games, finished, violations (`crash`, `illegal`, `noMove`, `stall`), actions per game,
score spread, mean score and win rate by seat. Exit 0 = no violations, 1 = violations, 2 = bad usage.

`--bots greedy,random,random` assigns one bot per seat, rotated one seat per game so seat and
bot are not confounded; the report adds `winByBot` (wins per seat held; fair = 1/seats).

### B3 level-1 heuristic ("greedy", `src/bots/greedy.ts`)

The cheapest legal Build that scores, otherwise the best Spend; random tie-break; prompts answered
at random. The ruleset-specific part is a small `GreedyAdapter.assess(view, seat, pick, def)` that
says whether a Build scores, what it costs and what a Spend is worth. Today only the **toy adapter**
exists (`toyAdapter.ts`); the Windamere adapter waits for E2 and the rewritten rules.

Numbers (toy ruleset, 1000 games each, seeds 1-1000, one greedy bot among random bots):

| Table   | greedy win share | fair  | research target K1 (`balance-targets.md`) |
| ------- | ---------------- | ----- | ----------------------------------------- |
| 3 seats | 77.5%            | 33.3% | >= 83%: **missed**                        |
| 5 seats | 58.1%            | 20.0% | >= 3x fair = 60%: **just missed**         |

The toy game is far smaller than Windamere, so these say the pipeline works, not whether K1 holds
for the real game. A first adapter bug is worth recording: I classified coin-producing builds as
"scoring", which the toy's score does not reward, and greedy then won only 13% (3 seats) against
random. Fixing the adapter (what scores is a ruleset fact) gave the numbers above.

Earlier numbers (toy, random bots, 200 games, 4 seats, seeds 1-200): 0 violations, 24-28
actions per game, score spread mean 2.25. Win rate by seat 21.3 / 31.0 / 24.0 / 23.8 %. With 200
games one seat's standard error is about 3 points, so the 31% is **not evidence of a seat bias**.
The toy game says nothing about Windamere balance.

## 2. Needs for B2 (asks, none blocking)

- **Memory of passed hands** (RULES R15.8 "Recall"): the engine does not put it in views
  (ENGINE.md §7). Bots will track it themselves from successive views (cards seen in each hand
  before it was passed). Fair, because humans get the same recall in the UI. Needs nothing from
  engine unless it decides to supply it.
- **Fast simulation**: `applyAction` deep-clones the state (ENGINE.md §11). Search bots (Hard) need
  thousands of `applyAction` calls per decision. First measure on E2; if too slow, ask engine for
  an in-place `step` or a cheaper clone.
- **Perfect-information playout for Hard**: a bot may guess hidden hands by sampling
  (determinization, §5) and run `applyAction` on its own sampled state. This never reads the real
  hidden state; it builds a plausible one from the view and its memory. The engine must therefore
  accept a state built by the bot: needs `createGame`-independent state construction, i.e. just a
  `DraftState` made from a view. Ask engine whether `applyAction` accepts a view with filled-in
  hands; today it throws on views (ENGINE.md §6).
- **Package script**: platform adds `"sim": "tsx scripts/sim.ts"` to package.json.

## 3. What a decision is (under RULES.md)

Each turn a bot submits **one card** with a role, **Build** or **Spend**. A pick also names
whatever arguments the card needs (payment, the "any good" gain, a discount choice, an upgrade
target, and now **which neighbour to buy missing goods from**). Bot work is: choose the card, then
the role, then the arguments. Neighbour trade makes pricing public-state dependent (the neighbour's
goods are visible) and costs a neighbour coins, so it is also a weak form of interaction to
evaluate. Rule defaults for arguments (old R15.7) will exist; every level may start from them.

Other decisions: the Great Work choice (R2.5, 1 of 2) and prompts. Prompt kinds depend on the
ruleset (not yet known); levels answer them with `defaultAnswer` unless noted.

Legal-action count is smaller than with pairs: a 9-card hand gives at most 9 cards x 2 roles x
argument choices (payment plans, trade sources), order 20-60 picks. That makes one-ply scoring of
every pick cheap and search (Hard) more affordable than planned. To be measured on E2.

## 4. Difficulty levels

Three levels, named for players: **Easy** (Apprentice), **Medium** (Journeyman), **Hard** (Master).
Names are UI's call. Each level strictly adds to the one below.

### Level 1, Easy: "Sensible random"

Goal: loses to a beginner who pays attention, never does anything absurd.

- Candidate picks = `legalPicks`, filtered by hard sanity rules: never Spend a card it could
  afford to Build when the card scores; avoid a Build that leaves 0
  coins when a Raid is plundering this Season (R9.5).
- Prefers a legal Build over a Spend about 70% of the time (uniform within each). Arguments: rule defaults.
- Great Work: random of the two.
- No memory, no look-ahead, no opponent model. Random tie-breaks.
- Deliberately blind to: Lore runs, Honours, Landmarks, neighbours.

Evaluates: coin and good affordability only.

### Level 2, Medium: "Heuristic scorer"

Goal: beats Easy about 4:1 in 4-seat games; a fair opponent for a casual group.

A pick is scored by a weighted sum, then chosen with a softmax (temperature 1, so it varies):

| Feature               | What it measures (rule)                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Renown now            | printed Renown, Landmark estimate, Great Work tier progress (R8, R12.2)                    |
| Economy               | Holding yield and Market income, weighted by turns left; zero value in Winter (R3.7)       |
| Guard vs Raid         | gap to the public Raid strength this Season; value of Valour (R9.4) vs plunder risk (R9.5) |
| Lore                  | marginal Renown of the run set after the pick (R10.3); a duplicate rank is worth 0         |
| Honours               | lead or distance to lead on each revealed Honour measure (R11); only the 3 in play         |
| Great Work            | labour to next tier threshold; Perk synergy with chosen build kinds                        |
| Spend value           | what the Spend band (R5) gains, discounted if it pays for this turn's Build (R5.2)         |
| Denial (small weight) | the card the left/right neighbour likely wants, given what it has built                    |
| Upgrade               | prefers an upgrade over a full-cost Build when it saves goods (R7.9)                       |

Medium reasoning is **one-ply**: score each legal pick, apply it to a copy through the engine
with the other seats' picks unknown (assume they Spend), read the resulting own-town value. It
uses the end-game score function the engine exposes (`ruleset.score`) on its own town only, plus
the features above. Game phase scales weights: Spring favours economy, Winter favours Renown.

- Memory: tracks the cards it passed (R15.8) and the neighbour's tableau; uses it only for Denial
  and for "will this card come back": a hand returns to its first holder after n turns at n seats, so
  with 4 turns per Season it wheels back only at 3 seats (turn 4). From 4 seats up nothing wheels.
- Great Work: choose the Perk best matching a rough plan (kind counts in its first hand).
- Weights are data (a JSON object), so the sim can tune them (§6).

### Level 3, Hard: "Planner"

Goal: beats Medium about 3:1 in 4-seat games; the opponent for people who know the game.
Not a perfect player; no cheating (views only).

Adds to Medium:

- **Plan commitment.** After the first Season it picks a target archetype from its tableau
  (Lore run, Holdings engine, Guard/Valour, Landmark set, a Great Work rush) and weights
  features toward it, dropping the plan if the pick quality falls below a threshold.
- **Determinization search.** For each decision, sample K (start: 16) full states consistent
  with the view: unknown cards in the other hands and deck drawn from the multiset of cards not
  yet seen (copy counts in CARDS.md minus what it has seen, R15.8 memory). For each candidate pick
  (top 8 by the Medium score), play the Season out with Medium bots for all seats, score its own
  town, average over samples. Choose the best average. Cost: K x 8 x (turns left x seats)
  `applyAction` calls; needs the speed from §2 and a time budget (e.g. 300 ms/decision), or K
  shrinks.
- **Opponent modelling.** Infers what each neighbour is collecting from its tableau and picks
  (reveals are public) and raises Denial weight for the card that completes a Lore run or Honour
  lead for the neighbour.
- **Raid and Honour timing.** Plans Guard to just meet the Raid (surplus is wasted, R9.7) and
  commits to at most 2 Honours it can plausibly lead.
- **Endgame exactness.** In Winter's last two turns it enumerates its own picks and uses exact
  scoring (no sampling needed for its own town).

## 5. Open risks, written down

- **Search noise vs budget.** Determinization is known to mis-evaluate hidden-information
  choices ("strategy fusion"); with hand sizes this small, K=16 may be too few. Untested.
- **Rules still moving.** Lore run scoring, Honours and cost numbers are † tunables. Level
  weights must read constants from the ruleset data, never copy them.
- **Hard can be too slow for hotseat on a phone.** If a decision costs more than ~500 ms the
  level must shrink K, not stall the UI. Run bots in a Web Worker (ui/net concern).
- **No human data yet.** "Beats Medium 3:1" is a target, not a measurement. Levels are tuned
  against each other by self-play only (§6), which can produce bots that exploit each other but
  not humans. Playtests (qa) should calibrate the labels.

## 6. How the levels get built and checked

1. B3 (after E2): `scripts/sim.ts` takes `--bots easy,medium,hard,...`, reports win rate per
   level and per seat, mean Renown by category, game length, and share of games each Honour/Landmark
   mattered. Seats rotate so seat position is not confounded with level.
2. Acceptance numbers (targets, not facts): Easy never crashes or stalls over 1,000 games in every
   seat count 2-7; Medium beats Easy; Hard beats Medium; none win the same seat more than
   expected (seat bias is also a balance signal for design).
3. Balance outputs for design: dominant card or Great Work (win rate when taken), dead Honours
   (never won), Raid strengths that are never or always held, game length in actions.
4. Weights tuned by hill-climbing Medium weights in self-play over a fixed seed set; recorded
   in a JSON file under `src/bots/`, with the seed set and the result, so a tuning is reproducible.

## 7. Cards

| Card | What                                         | Needs                                |
| ---- | -------------------------------------------- | ------------------------------------ |
| B1   | contract, random bot, simulator (toy) — done | none                                 |
| B3   | Easy and Medium on the real ruleset          | E2 (ruleset), platform `sim` script  |
| B4   | seat-rotated multi-level sim and reports     | B3                                   |
| B5   | Hard (determinization)                       | §2 engine answers, B3, speed numbers |

## 8. Windamere adapter and balance report (B3)

`src/bots/windamere.ts` (the shipped content bound to the engine), `windamereAdapter.ts` (level-1
greedy; `focus: kind` makes a specialist), `windamereMetrics.ts` (per-game samples),
`scripts/balance.ts` (the report). Results and findings: `docs/BALANCE.md`. Level 1 is weak
(1.6-2.1x fair against random), so it is a probe of the rules, not a finished Easy bot.

## 9. Levels 2 and 3 as built (B5)

`pickFor(engine, view, seat, { level })`: `'easy'` = uniform random over legal moves (the setup
screen's hint), `'medium'` = level 2, `'hard'` = level 3. Windamere only; another ruleset gets easy.
The setup screen's `normal` maps to `'medium'` in `src/game/play.ts`.

**Level 2** (`windamereBots.ts` + `windamereEval.ts`): for each legal pick, copy only the acting
town of the view, apply the pick (Spend gains and glean, Build cost and the engine's payment plan,
cover, "when built" gains, Great Work tiers) and score the difference:
change in the engine's own `scoreTown` (Hall, Landmark, card Renown, Great Work, Valour, Lore runs,
Honours; the purse is priced smoothly instead) + coins, goods and labour at fixed Renown prices
(coin 0.28, good 0.4, labour = remaining tier Renown per labour left) + the future income of a built
card (Yield, Income, Season-end, Tolls, Exchange, discounts, bonuses, over the turns left) + Guard
against the Raid (this Season's is public, later ones are averaged by Season). Trade enters through
the payment plan the engine proposes (neighbour purchases at the Season's price vs the bank).
Noise +/-0.6 Renown on every score so games differ. The Great Work is chosen by the same rating
rule as level 1. Every weight is an untuned first guess.

**Level 3** adds **denial**: if hands are passed this turn, each pick is charged 0.7 x the best use
(Build or Spend, same evaluator, on that town's public store, coins and tableau) the receiving
neighbour would have of the other cards, and the noise is +/-0.15.

**Measured** (Windamere, seeds 1.., `nice -n 19`, hidden info never read):

| Table                                                            | Result                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 3 seats: random, greedy, level 2 (100 games)                     | level 2 wins 97%, greedy 3%, random 0%                             |
| 4 seats: random, greedy, level 2, level 3 (400 games)            | level 2 45%, level 3 54%, greedy 0.5%, random 0.5% (fair 25%)      |
| 6 seats: random, greedy, 2x level 2, level 3, random (400 games) | level 3 34% per seat, level 2 33% per seat, greedy 0.3%, random 0% |
| 4 seats: 2x level 2 vs 2x level 3 (600 games)                    | level 3 29.2% per seat, level 2 20.8% (fair 25%): ratio 1.4x       |
| same, denial weight 0 (600 games)                                | level 3 27.4% per seat, level 2 22.6%: ratio 1.2x                  |

Reading: levels 2/3 are far above level 1 and random (K2 ratio met by a wide margin). **Level 3 over
level 2 is only 1.2-1.4x**, short of K2's 1.5x; most of that edge is level 3's lower noise, and
denial adds about 2 points (inside about 1.8 points of noise at 600 games). So "hard" is a small
step over "normal" today. Think time: about 0.3 ms per decision in a whole-game sim (P4 target
<= 300 ms: met by far). Not tested: against humans.

**Not done / next:** Lore-run planning beyond one-ply marginal Renown, Honour racing, trade
planning across turns, Recall (R15.8) use, and engine's lookahead API (E5) for real search at
level 3. Needs from engine (E5): a pure `step`-style call on a state a bot builds from its view
(sampled hidden hands), cheap enough for ~1000 calls per decision. Until then level 3 stays one-ply.

## 10. Play-out search for level 3 (B6, negative result)

`createWindamereBot(3, name, denialWeight, SEARCH)` adds a search on the E5 lookahead: take the top
4 picks by the one-ply score, then for N determinized states (shared by all picks) play the pick,
play the rest of the Season with the one-ply picker for every seat, and add the centred result
(own end Renown + coins + goods, minus 0.25x the mean rival) to the one-ply score. Hidden
information is read only through `determinize(view)`.

Measured, 2x level 3 vs 2x search, 4 seats (fair share 25%):

| search              | games | level 3 | search | ms/game |
| ------------------- | ----- | ------- | ------ | ------- |
| 6 samples, blend 1  | 600   | 24.3%   | 25.7%  | 800     |
| 16 samples, blend 2 | 400   | 23.8%   | 26.3%  | 1800    |

Standard error is about 2 points per row, so neither beats level 3 clearly, and the second costs
2.3x the time. **Not wired into `pickFor`**; `hard` stays denial-only level 3 (K2 still 1.4x over
level 2). Likely reasons: the play-out sees only Season-end Renown, coins and goods, not the
future income of cards built (the one-ply score has that), and the other seats' one-ply picker is
the same policy, so the search learns little. Untried: valuing econ in the leaf, playing to the
game end in Winter, Lore-run and Honour planning (the other half of B6).

## 11. Guard 0 and Lore planning (B6 part 2, negative results)

**Guard distribution** (level 2, 4 seats, 100 games): 32% of towns end with Guard 5 or less (13% with
Guard 0) and 18% never hold a Raid in 4 Seasons; 34% hold all 4. Level 3: the same within noise.
Greedy level 1: 88 of 400 towns without Valour (22%). The towns with no Valour have no Watch at all,
even with 39 coins and 12 reed in store. Mean one-ply build value by kind over 30 games (all
builds the town could pay): Watch 2.7, 3.2, 1.9, 0.6 by Season, against Hall 3.8, 2.9, 2.6, 3.1 and
Market 3.7, 3.4, 0.9, 0.4. So Watch is not far below the others in Spring to Autumn; it falls in
Winter because Winter Raids (strength 6-8) are out of reach for one Watch.

Two evaluator changes were tried, each as an `EvalTune` knob (`windamereEval.ts`), 2 bots with
the change vs 2 without, 4 seats, level 2, 400-500 games (fair share 25%, SE about 2 points):

| change                                                                         | with  | without |
| ------------------------------------------------------------------------------ | ----- | ------- |
| `guardSmooth` 1: partial credit for Guard that does not yet reach a Raid       | 24.3% | 25.8%   |
| `loreProject` 1: expected Lore run score with missing ranks arriving by chance | 23.5% | 26.5%   |
| `loreProject` 2.5 (higher chance)                                              | 23.6% | 26.4%   |

Neither helps, and Guard distribution did not move (valour-0 towns 18% to 22%), so both defaults
are 0 and the shipped bots are unchanged. Reading: the missing Valour is not a pricing problem of
the first Guard point. More likely the bot lacks the goods for a Watch when one is in hand (hands
pass, so a Watch seen now is not there next turn), which needs a plan for goods across turns, not
a better price per pick. Honour planning: not done. Untried.

## 12. D10b types and rules argument (post-E7)

- Evaluator: `scoreNeighbourMin` flows through `scoreTown` (neighbour towns are public in the
  view); `onBuildNeighbourMin` pays `gains` once per uncovered card of the kind at the weaker
  neighbour, as in R4.8 (public tableaux, so exact); `scoreSales` adds 0.7 x amount per `per`
  goods for an assumed 0.25 sales per turn left (the sales so far are in `scoreTown`). Level 1
  counts all three as scoring. Tested against `PENDING_CARDS` compiled into a rules object; the
  cards are not in the shipped deck yet, so no sim covers them.
- `createWindamereBot(level, name, denialWeight, search, tune, rules)`: the 6th argument is the
  compiled rules the bot prices with (default the shipped ones), and a search-enabled bot builds
  its lookahead from the engine that asks it (`ctx.engine.ruleset`), so a balance overlay is
  played out under its own rules. `pickFor` still routes only the shipped engine to the smart
  levels. Untested with a real overlay: the unit test covers the shipped engine only.

## 13. Lore build share (tutorial's report: Normal and Hard never build Lore)

Mean cards per town at the end, 4 identical bots, 100 games (main c252cd5, shipped content):

| bot              | Holding | Market | Hall | Watch | Lore | Landmark | towns with no Lore |
| ---------------- | ------- | ------ | ---- | ----- | ---- | -------- | ------------------ |
| level 1 (greedy) | 2.38    | 2.53   | 1.43 | 2.14  | 3.11 | 1.14     | 2%                 |
| level 2          | 3.23    | 1.63   | 2.75 | 2.26  | 1.11 | 0.90     | 36%                |
| level 3          | 3.09    | 1.67   | 2.79 | 2.08  | 1.03 | 0.78     | 38%                |

So the report is right in kind, not in size: levels 2 and 3 build about 1 Lore card per town (a run
of 1 scores 1 Renown) and over a third build none, against 3 for level 1. The one-ply score values a
Lore card at its marginal run score, which is 1 for a first rank and grows only once ranks are held;
the loop of "no Lore, so Lore is worth little" keeps them out. The projected-Lore knob (§11,
`loreProject`) tried to price the later runs and lost 3 points of win share at level 2 (24 vs 26%),
so it is off; level 2 and 3 also win far more than level 1 without Lore. Whether a Lore plan (commit
to a run early, price each rank at the run it would complete) beats that is untested.
