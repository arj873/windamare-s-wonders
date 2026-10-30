# Engine — the draft core contract

Owner: **engine** lane (`src/engine/**`). Net, ui and bots code against this file.
**If you change a public type in `src/engine/core/types.ts`, update this file in the same commit.**

Status (2026-10-29): **E1 implemented** in `src/engine/core/` with 70 vitest tests (toy ruleset,
§12). Everything below is what the code does. Not measured yet: simulation speed (§11).

The core is **game-agnostic**: it knows seats, hands, simultaneous hidden picks, reveal,
resolution order, hand passing, rounds, prompts, scoring hooks and per-seat views. It does not
know resources, costs, card kinds or scoring tables. Those come from a **ruleset** (§8): a plain
object of data and functions. The Windamere ruleset (E2) is written after `docs/RULES.md` is
approved; tests use a tiny toy ruleset (§12).

## 1. Layers and rules of the road

```
src/engine/core/     game-agnostic draft core (E1)     pure TS: no DOM, no Pixi, no Math.random, no Date
src/engine/game/     Windamere ruleset (E2)            effect handlers, resolve steps, scoring
src/content/         card data (design lane)           CardDef[] the ruleset loads
src/engine/index.ts  barrel                            import from here, not deep paths
```

- **Pure.** `applyAction` never mutates its input (tested on a deep-frozen state).
- **Deterministic.** Same state + same action = same result. All randomness comes from the seeded
  RNG stored in the state (§10). No clock: timers are net's job (§9 `waitingOn`, `defaultAction`).
- **JSON-serializable.** A state contains only plain objects, arrays, strings, finite numbers,
  booleans and null. No `undefined` keys, no class instances, no Maps. `JSON.parse(JSON.stringify(s))`
  is an equal, fully working state (tested). Ruleset data (`SeatState.data`, `DraftState.table`)
  follows the same rule.
- **Only `applyAction` produces a new state** (and `createGame` the first one).
- Errors are values: `{ ok: false, error }`. Engine functions throw only on programmer error
  (a config `validateConfig` rejects, a seat that does not exist, a state from another ruleset).

## 2. Engine API

Bind the core to a ruleset once; every consumer uses the bound functions.

```ts
import { createDraftEngine } from '../engine'; // the barrel, src/engine/index.ts
const engine = createDraftEngine(windamereRuleset); // E2 exports this ready-made from the barrel

engine.validateConfig(config): string | null        // null = ok; net calls this on room configs
engine.createGame(config): DraftState               // throws if validateConfig fails
engine.applyAction(state, action): ActionResult     // { ok: true, state } | { ok: false, error }
engine.legalActions(state, seat?): DraftAction[]    // every action applyAction accepts now
engine.viewFor(state, viewer): DraftView            // §7; viewer = SeatId | 'spectator'
engine.legalPicks(stateOrView, seat): Pick[]       // the seat's legal picks now ([] outside pick phase)
engine.defaultPick(stateOrView, seat): Pick | null  // deterministic timeout / disconnect pick
engine.waitingOn(state): SeatId[]                   // seats whose input the game needs now
engine.defaultAction(state, seat): DraftAction | null  // like defaultPick, but also answers prompts
engine.ruleset                                      // the ruleset (card defs: engine.ruleset.cards)
```

`legalPicks`, `defaultPick` and `defaultAction` work on a full state or on that seat's view
(§6 view-safe), so a server, a client and a bot get the same answer.

**Arrival order never matters.** Picks arrive one `pick` action at a time, but nothing resolves
until the last one is in, and the reveal resolves them in `resolveOrder` (seat order by default),
never in arrival order. The state after the reveal is identical for every arrival order (tested
on all 24 orders of 4 seats). Earlier `unpick` / re-picks change only `seq` (and the `seq` of
log entries), which count actions. This is net's "batch resolution" (MULTIPLAYER.md §6).

```ts
interface GameConfig {
  seed: number | string; // online: from a CSPRNG (net), 128 bits
  seats: { name: string }[]; // seat i sits clockwise after seat i-1; the order is final
  options?: Record<string, Json>; // ruleset options (e.g. a variant switch), checked by the ruleset
}
```

`createGame` deals round 0 and returns a state in the `pick` phase (or `prompt`, if the
ruleset's `onGameStart` asks for setup decisions).

## 3. IDs, seats, neighbours

```ts
type SeatId = number; // 0..n-1, clockwise
type CardDefId = string; // a card's identity in the catalog, e.g. 'stonecutters-yard' (ruleset data)
type CardId = number; // one physical copy in this game; unique per game, >= 0
interface Card {
  id: CardId;
  def: CardDefId;
}
```

- A deck may hold several copies of one `CardDefId`; each copy has its own `CardId`. Ids are
  assigned **after** the shuffle, in deal order, so an id says nothing about the card's face.
- Seats sit clockwise. **Left neighbour = `(s + 1) % n`**, **right neighbour = `(s - 1 + n) % n`**
  (sitting at a table, the next player clockwise is on your left).
- Hands pass **`'left'`** (to `s + 1`) or **`'right'`** (to `s - 1`), per round (§5).
- With 2 seats both neighbours are the same seat. Whether 2 players get a variant (a neutral seat)
  is a rules question (design lane), not a core feature yet.

Helpers: `leftOf(state, s)`, `rightOf(state, s)`, `neighboursOf(state, s)` → `[left, right]`
(deduplicated with 2 seats), `passTarget(state, s)`.

## 4. State (`DraftState<S, T>`)

`S` = the ruleset's per-seat data (coins, monument progress, ...), `T` = its table-wide data.
The Windamere ruleset fixes both: consumers use its concrete `GameState` type.

```ts
interface DraftState<S = unknown, T = unknown> {
  schemaVersion: 1;
  ruleset: { id: string; version: number }; // the engine refuses states of another ruleset id
  config: GameConfig; // fixed after createGame
  seq: number; // +1 per accepted action (net: stale-action guard)
  round: number; // 0-based round ("age") index
  turn: number; // 0-based pick number within the round
  roundPicks: number; // picks per seat this round (RoundSpec.picks)
  passDirection: 'left' | 'right'; // this round's
  phase: Phase;
  seats: SeatState<S>[]; // index = SeatId
  deck: Card[]; // undealt cards of this round; hidden from everyone
  discard: Card[]; // visibility: ruleset.discardVisibility (default hidden)
  box: Card[]; // out of the game (earlier rounds' undealt cards, ctx.toBox); hidden
  table: T; // ruleset table data; public unless ruleset masks it
  prompts: Prompt[]; // pending follow-up decisions, answered in order (§6)
  nextCardId: number;
  nextPromptId: number;
  lastReveal: Reveal | null; // the most recent reveal (public; UI animates it)
  log: LogEntry[];
  rng: RngState; // §10; masked in views
  result: GameResult | null; // set when phase is gameOver
}

interface SeatState<S> {
  id: SeatId;
  name: string;
  hand: Card[]; // owner only
  pick: Pick | null; // submitted, not yet revealed; owner only (others: view.submitted);
  //                    the picked card stays in `hand` until the reveal
  tableau: Card[]; // public, in the order played
  zones: Record<string, Card[]>; // ruleset zones (e.g. cards tucked under a monument); visibility per zone
  data: S; // ruleset seat data
}

type Phase =
  | { kind: 'pick' } // every seat with a hand picks, simultaneously
  | { kind: 'prompt'; then: 'start' | 'turn' | 'roundEnd' } // prompts[0] is open (§6);
  //                     `then` = the stage the flow continues after once the queue is empty
  | { kind: 'gameOver' };

interface Pick {
  card: CardId;
  use: string;
  args?: Json;
} // `use`, `args`: ruleset vocabulary

interface Reveal {
  round: number;
  turn: number;
  picks: { seat: SeatId; card: Card; use: string; args?: Json }[]; // seat order
}

interface Prompt {
  id: number;
  seat: SeatId;
  kind: string;
  data: Json;
} // data: owner only

interface LogEntry {
  seq: number;
  round: number;
  turn: number;
  seat: SeatId | null; // who it is about; null = the table
  kind: string; // 'reveal', 'pass', 'roundEnd', ruleset kinds ...
  text: string; // plain English, safe to show to everyone it is shown to
  data?: Json; // structured payload for UI
  to?: SeatId[]; // private entry: only these seats see it (views drop it for others)
}

interface GameResult {
  scores: { seat: SeatId; categories: Record<string, number>; total: number; tiebreak: number }[];
  ranking: SeatId[][]; // best first; tied seats share a group
  winners: SeatId[]; // = ranking[0]
}
```

Card conservation: every card dealt this game (ids `0 .. nextCardId-1`) is in exactly one list:
a hand, a tableau, a seat zone, the deck, the discard or the box. `checkInvariants(state)`
(exported) returns the violations (also: picks point at cards in their hand, phase matches
prompts and result); qa may call it in audits. The engine runs it after every action and
throws on a violation: that is a ruleset bug, not a bad action.

## 5. Flow

```
createGame
  ruleset.setupTable / setupSeat  →  deal round 0  →  ruleset.onGameStart (may prompt)  →  pick

pick phase (simultaneous)
  each seat with a non-empty hand submits  pick { card, use, args }   (hidden from others)
  a seat may replace its pick, or  unpick, until the last seat submits
  last pick arrives → REVEAL (same applyAction call):
    1. picked cards leave the hands; lastReveal + a public 'reveal' log entry
    2. last turn of the round only: leftover hand cards → discard (before resolution,
       so this turn's effects see them)
    3. resolve steps (§8), step-major: step 1 for every seat, then step 2 for every seat, ...
       seats in ruleset.resolveOrder (default 0..n-1). Every picked card must end up somewhere
       (tableau, zone, discard, box): checked, throws otherwise
    4. prompts? → prompt phase until the queue is empty (each prompt's `refresh` runs when it
       becomes the open one, §8)
    5. turn < picks - 1 → pass hands in passDirection, turn += 1 → pick
       else → ROUND END

round end
  ruleset.onRoundEnd(ctx)  then every seat's active effects' onRoundEnd (seat order)
  prompts? → prompt phase until empty
  more rounds → deal round + 1 → pick        last round → GAME END

game end
  ruleset.score(state, seat) per seat → result (ranking: total desc, then tiebreak desc) → gameOver
```

Dealing a round: `ruleset.roundSpec(state, round)` returns
`{ handSize, picks, pass: 'left' | 'right', deck: CardDefId[] }`. The core shuffles `deck` with
the state RNG, assigns ids, deals `handSize` cards to each seat (seat 0 first), and keeps the rest
in `state.deck`; the previous round's undealt cards go to the box. `picks <= handSize`; when
`picks < handSize` the leftovers are discarded on the last turn (step 2 above).
`deck.length >= handSize * seats` and every face must be in the catalog, or the deal throws.
If no seat holds a card when a pick phase would start (a ruleset took them all), the round ends.

The core does all of this inside the one `applyAction` that completes a phase, so a state handed
out by the engine is always waiting for someone (`waitingOn` is never empty, except at gameOver).

Validity: a pick is validated when submitted, against the state at that moment. Resolution
must not make a submitted pick invalid (other seats' picks of the same turn resolve after
validation). A ruleset whose rules could break that must handle it inside its resolve steps.

## 6. Actions

```ts
type DraftAction =
  | { type: 'pick'; seat: SeatId; pick: Pick } // pick phase; replaces an earlier pick
  | { type: 'unpick'; seat: SeatId } // pick phase; seat has a pick
  | { type: 'answer'; seat: SeatId; prompt: number; answer: Json }; // prompt phase; prompts[0]

type ActionResult<S, T> = { ok: true; state: DraftState<S, T> } | { ok: false; error: string };
```

`applyAction` pipeline:

```
state of another ruleset id, or a view                      → throws (programmer error)
action not an object / seat not 0..n-1                      → error
phase gameOver                                              → error 'game is over'
draft = clone(state)
pick:    phase pick, pick shape (card id, non-empty use, JSON args), seat has cards,
         card in seat's hand, ruleset.validatePick           → error
         seq += 1; store { card, use, args? } (other keys dropped)
         all seats with cards have picked → reveal + resolve + advance (§5)
unpick:  phase pick, seat has a pick → seq += 1; clear it
answer:  phase prompt, prompt === prompts[0].id, seat === prompts[0].seat, JSON answer,
         ruleset.prompts[kind].validate                      → error
         seq += 1; shift; apply; queue empty → advance (§5), else refresh the next prompt
unknown type                                                → error
write back rng; checkInvariants (throws on a ruleset bug); return { ok: true, state: draft }
```

Errors are short English strings (`'not the pick phase'`, `'card 12 is not in your hand'`,
`'the open prompt is not yours'`, or the ruleset's own, e.g. `'not enough coins'`).

**Prompts** are follow-up decisions that effects create during resolution, round end or game
start ("choose a card from the discard pile to build for free"). They are answered **one at a
time, in queue order**; an answer may queue more prompts. Prompt `data` (the options) is visible
to the prompted seat only. Open question: rules may need simultaneous prompts (several seats
deciding at once, hidden); the queue can grow that later.

`legalActions(state, seat?)`:

- **Sound:** every action returned is accepted by `applyAction` (tested on random playouts).
- **Complete** for `unpick` and `answer`, and for `pick` up to `args`: a ruleset whose `args`
  are open-ended (e.g. many ways to pay) returns a bounded, documented sample.
- **View-safe:** `legalActions(viewFor(s, seat), seat)` equals `legalActions(s, seat)`, and so
  do `defaultAction` and `waitingOn` (tested at every step of random playouts). Rulesets must
  decide legality from the seat's own hand, own data and public information only; a prompt's
  `validate` should read `prompt.data` (kept fresh by `refresh`), not hidden piles. So bots and
  online clients compute their moves from a view. On a view, only the viewer's own moves are
  listed (other seats' hands are placeholders).

## 7. Views and hidden information (`viewFor`)

```ts
type Viewer = SeatId | 'spectator';
interface DraftView<S, T> extends DraftState<S, T> {
  view: {
    viewer: SeatId | null; // null = spectator
    handCounts: number[]; // per seat
    submitted: boolean[]; // per seat: has a pick waiting for the reveal
    deckCount: number;
    discardCount: number;
  };
}
```

A view has the `DraftState` shape, so UI renders it unchanged. Masked for everyone but the owner
(a spectator owns nothing):

| Field                                  | Masked as                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------- |
| other seats' `hand`                    | placeholder cards `{ id: -1 - i, def: HIDDEN_CARD }`, same length           |
| other seats' `pick`                    | `null` (`view.submitted` says whether they picked)                          |
| seat `zones` with visibility `'owner'` | placeholders for non-owners; `'hidden'` zones: placeholders for all         |
| `deck`                                 | placeholders, always                                                        |
| `discard`                              | placeholders unless `ruleset.discardVisibility === 'public'`                |
| other seats' prompt `data`             | `null` (seat and kind stay public: "waiting for Ada")                       |
| log entries with `to`                  | dropped unless the viewer is listed                                         |
| `rng`, `config.seed`                   | `[0, 0, 0, 0]`, `HIDDEN_SEED`                                               |
| ruleset secrets                        | `ruleset.maskSeat(data, viewer, owner)`, `ruleset.maskTable(table, viewer)` |

At `gameOver`, owner-only zones are revealed; `'hidden'` zones, deck, box, rng and seed stay
hidden. A view shares unchanged parts with the state: treat it as read-only.

Leak test (net's ask): for random mid-game states and every viewer, scrambling everything that
viewer may not know (cards across hidden lists, other seats' picks, rng, seed, private log
texts) leaves `viewFor` unchanged. A deliberately unmasked deck makes it fail (checked once by
hand).

Not in a view on purpose: what a seat could _remember_ (the cards it saw in a hand it passed on).
Clients and bots that want that memory track it themselves from successive views. Open question
for design/bots: should the engine hand it out, so a bot with memory has no edge over a human?

`isDraftView(x)` tells views from states. **Never pass a view to `applyAction`.** `legalActions`
on a view is fine for the viewer's own seat (§6).

## 8. Rulesets

```ts
interface Ruleset<S, T> {
  id: string;
  version: number;
  minSeats: number;
  maxSeats: number;
  cards: readonly CardDef[]; // the catalog (src/content, design lane)
  effects: Record<string, EffectHandler<S, T>>; // effect type → handler
  prompts: Record<string, PromptHandler<S, T>>; // prompt kind → handler
  rounds: number | ((config: GameConfig) => number);
  roundSpec(state, round): RoundSpec; // §5
  setupTable(ctx): T;
  setupSeat(ctx, seat): S; // ctx.rng may be used (e.g. deal monuments)
  onGameStart?(ctx): void;
  validateOptions?(options): string | null;
  validatePick(state, seat, pick): string | null; // the card is in the hand (core checked)
  legalPicks(state, seat): Pick[]; // sound; see §6 for completeness
  defaultPick?(state, seat): Pick; // timeouts; default = legalPicks[0]
  resolveOrder?(state): SeatId[]; // default 0..n-1
  resolve: ResolveStep<S, T>[]; // run step-major (§5)
  onRoundEnd?(ctx): void;
  score(state, seat): Record<string, number>; // categories; total = sum
  tiebreak?(state, seat): number; // higher wins a tie
  activeEffects?(state, seat): EffectSpec[]; // extra sources beyond tableau cards (monument stages)
  zones?: Record<string, 'public' | 'owner' | 'hidden'>; // seat zones and their visibility
  discardVisibility?: 'public' | 'hidden'; // default 'hidden'
  maskSeat?(data: S, viewer: Viewer, owner: SeatId): S;
  maskTable?(table: T, viewer: Viewer): T;
}

type ResolveStep<S, T> = (ctx: Ctx<S, T>, seat: SeatId, pick: Pick, card: Card) => void;

interface RoundSpec {
  handSize: number;
  picks: number;
  pass: 'left' | 'right';
  deck: CardDefId[];
}
```

### Cards and effects (data-driven)

Card definitions are data. Their effects are a list of `{ type, ...params }` specs; the code for
each `type` lives in the ruleset's effect registry. Changing a card after rules review means
editing data; adding a new kind of effect means adding one handler.

```ts
interface CardDef {
  id: CardDefId;
  name: string;
  kind: string; // ruleset category
  cost?: Json; // interpreted by the ruleset
  tags?: string[];
  effects: EffectSpec[];
} // a ruleset extends it for more fields (era, min player count ...): `interface WCard extends CardDef`

interface EffectSpec {
  type: string;
  [param: string]: Json;
} // e.g. { type: 'gainCoins', amount: 2 }

interface EffectHandler<S, T> {
  validate?(spec: EffectSpec): string | null; // checks params; content tests run it on every card
  onPlay?(ctx: Ctx<S, T>, seat: SeatId, spec: EffectSpec, source: Card | null): void;
  onRoundEnd?(ctx: Ctx<S, T>, seat: SeatId, spec: EffectSpec): void;
  score?(state: DraftState<S, T>, seat: SeatId, spec: EffectSpec): Record<string, number>;
}
```

- `onPlay` runs when a card enters a tableau through `ctx.play(seat, card)`, once per spec.
- **Passive** effects (discounts, extra income) have no trigger: ruleset code asks
  `effectsOf(state, seat, type)` → the specs of that type among the seat's active effects
  (tableau cards in play order, then `ruleset.activeEffects`).
- `effectScore(rules, state, seat)` sums every active effect's `score`; `ruleset.score` usually
  adds it to its own categories.
- `checkRuleset(ruleset)` (exported) validates the catalog: unique ids, every effect type
  registered, every `validate` passes. Design's content tests call it.

```ts
interface PromptHandler<S, T> {
  refresh?(state, prompt): Json; // new `data` when the prompt becomes the open one
  answers(state, prompt): Json[]; // legal answers (sound)
  validate(state, prompt, answer: Json): string | null;
  apply(ctx: Ctx<S, T>, prompt, answer: Json): void;
  defaultAnswer?(state, prompt): Json; // timeouts; default = answers[0]
}
```

### `Ctx`: what ruleset code may do to the draft

Inside resolve steps, effect handlers, prompt handlers and hooks, ruleset code gets
`ctx: Ctx<S, T>` over the draft (a private copy: mutate freely).

```ts
ctx.state                        // the draft
ctx.rules                        // the ruleset
ctx.rng                          // Rng over draft.rng (written back by the core)
ctx.def(card | defId)            // CardDef; throws on unknown ids
ctx.play(seat, card)             // → tableau, then each spec's onPlay
ctx.place(seat, zone, card)      // → a seat zone (no triggers)
ctx.toDiscard(card)
ctx.toBox(card)                  // out of the game
ctx.take(cardId)                 // remove a card from wherever it is; the caller must put it somewhere
ctx.trigger(seat, specs, source) // run onPlay of arbitrary specs (a monument stage)
ctx.prompt(seat, kind, data)     // queue a prompt
ctx.log(seat, kind, text, { data?, to? })
ctx.left(seat), ctx.right(seat), ctx.neighbours(seat)
```

`play`, `place`, `toDiscard` and `toBox` take a card that is in no list (just revealed, or
`take`n first) and throw otherwise, so a card can never be in two places.

Ruleset code must not touch `deck`/`hands` dealing, `phase`, `seq`, `round`, `turn`, `prompts`
(except through `ctx.prompt`) or ids: the core owns them.

## 9. For net, ui and bots

- **net:** run the engine on the full state server-side; send each seat `viewFor(state, seat)`
  and `legalActions(state, seat)`. `waitingOn(state)` drives "waiting for …" and timers; on a
  timeout or disconnect submit `defaultAction(state, seat)`. `seq` changes on every accepted
  action. Picks are secret until the reveal: never echo another seat's `pick` action to other
  clients, only the new views. Snapshots: the state is versioned JSON (`schemaVersion`,
  `ruleset.version`); a future schema bump ships an upgrade function, like Catan's `migrate.ts`.
  Changing a pick before the reveal is supported; if design rules it out, net/ui just do not offer
  `unpick` (the engine would grow a ruleset flag).
- **ui:** render from a view (online) or the full state through `viewFor(state, seat)` (hotseat:
  the seat whose turn it is on the shared screen). `lastReveal` changes once per turn: animate it.
  `view.submitted` shows who has locked in.
- **bots:** `legalActions(view, seat)` works on a view (§6). Use your own `Rng` (`new Rng(seed)`),
  never `state.rng`, so bots do not change the game's randomness.

## 10. Randomness

`src/engine/core/rng.ts` is Catan's sfc32 (128-bit state in `state.rng`, seed hashed with
cyrb128). Ruleset code uses `ctx.rng` (`int(n)`, `float()`, `pick(arr)`, `shuffle(arr)` returns a
copy); the core writes the state back. Nobody else reads or writes `state.rng`; views mask it.

## 11. Cloning

`applyAction` deep-copies the state (`cloneState`: a hand-written plain-JSON copy that keeps key
order); `config` is shared between states (fixed after createGame, never mutate it). Simulation
cost is not measured yet; it will be once bots exist.

## 12. Tests and the toy ruleset

`src/engine/core/testing/toy.ts` is a tiny placeholder ruleset (six made-up `toy-*` cards, coins,
three uses `build` / `sell` / `stash`, an owner-only `stash` zone, round-end income, a salvage
prompt, an optional opening prompt) used by the engine's tests only; `testing/helpers.ts` wraps
it. It is not game content and never ships. Other lanes may use it in their own tests until E2
lands. Tests (`src/engine/core/*.test.ts`, 70 with the copied rng tests): purity (deep-frozen
input), JSON round trip mid-game, determinism per seed, card conservation, hidden picks and the
leak test, reveal and step-major resolution order, passing both ways, leftovers and boxed decks,
prompts (in-turn and at start), scoring and ties, malformed actions, ruleset bugs caught,
legalActions soundness and view-safety on random playouts (2-5 seats).

## 13. Decisions and open questions

- Signature `engine.applyAction(state, action)` (bound to a ruleset) instead of a global ruleset
  registry: no hidden global state, and tests bind the toy ruleset.
- Prompts are sequential (§6). Simultaneous prompts: later, if the rules need them.
- Memory of passed hands is not in views (§7): open question.
- 2-player: no neutral-seat support yet (§3): waits for the rules.
- The log is not trimmed (a game is ~20 turns); revisit if states get large.
