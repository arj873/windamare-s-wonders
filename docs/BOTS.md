# Bots — contract, simulator and difficulty plan

Owner: **bots** lane. Status (2026-10-29): **B1 implemented** against the toy ruleset (random bot +
simulator). **B2 below is a plan**: nothing in it is implemented or measured. It is written against
`docs/RULES.md` as it stands (draft, unapproved); every rule cited can still change.

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

Simulator: `src/bots/sim.ts` (`runGame`, `runSim`, `summarize`), CLI `scripts/sim.ts`:

    nice -n 19 npx tsx scripts/sim.ts --games 200 --seed 1 --seats 4 [--max-actions 5000]

It reports games, finished, violations (`crash`, `illegal`, `noMove`, `stall`), actions per game,
score spread, mean score and win rate by seat. Exit 0 = no violations, 1 = violations, 2 = bad usage.

First numbers (toy ruleset, random bots, 200 games, 4 seats, seeds 1-200): 0 violations, 24-28
actions per game, score spread mean 2.25. Win rate by seat 21.3 / 31.0 / 24.0 / 23.8 %. With 200
games one seat's standard error is about 3 points, so the 31% is **not evidence of a seat bias**
(untested at larger N). The toy game says nothing about Windamere balance.

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

Each turn a bot submits **two cards** (three with 2 seats): at most one **Build**, the rest
**Spend**, one **Burn** in 2-seat. A pick also names payment, the "any good" gain, a discount
choice and an upgrade target (R4.3). Bot work is: choose the pair, then the roles, then the
arguments. R15.7 gives deterministic defaults for the arguments; every level may start from them.

Other decisions: the Great Work choice (R2.5, 1 of 2) and prompts. Prompt kinds depend on the
ruleset (not yet known); levels answer them with `defaultAnswer` unless noted.

Legal-action count is the cost driver. A 9-card hand gives 36 pairs, each with up to 2 role
assignments and argument choices: of order 100-300 picks. Level logic should score picks, not
enumerate game trees, on the early turns.

## 4. Difficulty levels

Three levels, named for players: **Easy** (Apprentice), **Medium** (Journeyman), **Hard** (Master).
Names are UI's call. Each level strictly adds to the one below.

### Level 1, Easy: "Sensible random"

Goal: loses to a beginner who pays attention, never does anything absurd.

- Candidate picks = `legalPicks`, filtered by hard sanity rules: never Burn/Spend a card it could
  afford to Build when its Build slot is empty and the card scores; avoid a Build that leaves 0
  coins when a Raid is plundering this Season (R9.5).
- Prefers Build + Spend over Spend + Spend (uniform among those). Arguments: R15.7 defaults.
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
