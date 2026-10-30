# Engine — the draft core contract

Owner: **engine** lane (`src/engine/**`). Net, ui and bots code against this file.
**If you change a public type in `src/engine/core/types.ts`, update this file in the same commit.**

Status (2026-10-30): **E1 implemented** in `src/engine/core/` (toy ruleset, §12). §1-§13 are
what the code does. **§14 lists the contract changes the Windamere rules still need: planned,
not implemented. §15 is the Windamere game (E2): playable for 3 to 7 towns on the D2c rules;
with the Great Work choice; not yet 2 players or Recall.**

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

**The Windamere engine:** `createWindamereEngine(content?)` (barrel export, `src/engine/game/`)
returns `DraftEngine<WwSeat, WwTable>`; `content` defaults to the shipped card data once
`src/content/` has it. **Stub until E2 lands: it throws `WINDAMERE_NOT_READY`.** The signature is
final, so net can wire it now. A `DraftEngine<WwSeat, WwTable>` is not assignable to
`DraftEngine<unknown, unknown>` (`resolve` steps are contravariant), so cast it as net already
does for the toy engine.

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
- With 2 seats both neighbours are the same seat. The rules use no neutral seat (R14); their
  2-player variant needs §14 C1 and C2.

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
  data: Json; // owner only
  group: number; // prompts with the same group are open together (§6); a lone prompt: its id
  answered: boolean; // public: answered, waiting for the rest of its group
  answer: Json; // the waiting answer, null until answered; owner only
}

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
  scores: { seat: SeatId; categories: Record<string, number>; total: number; tiebreak: number[] }[];
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
  ruleset.setupTable / setupSeat  →  onRoundStart(0), deal round 0  →  ruleset.onGameStart
  (may prompt)  →  pick
  with ruleset.startBeforeDeal: setup  →  onGameStart (may prompt)  →  onRoundStart(0), deal
  round 0  →  pick            (no hands during the start prompts)

pick phase (simultaneous)
  each seat with a non-empty hand submits  pick { card, use, args }   (hidden from others)
  a seat may replace its pick, or  unpick, until the last seat submits
  last pick arrives → REVEAL (same applyAction call):
    1. picked cards leave the hands; lastReveal + a public 'reveal' log entry
    2. last turn of the round only: leftover hand cards → ruleset.onLeftovers(ctx, seat, cards)
       if the ruleset has it (it must put each card somewhere), else → discard. Before
       resolution, so this turn's effects see them
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
  more rounds → onRoundStart(round + 1), deal round + 1 → pick        last round → GAME END

game end
  ruleset.score(state, seat) per seat → result (ranking: total desc, then the tiebreak lists
  element by element, higher first) → gameOver
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
         card in seat's hand                                 → error
         p = ruleset.normalizePick({ card, use, args? })     (other keys dropped; optional hook
                                                              that fills default choices)
         ruleset.validatePick(p)                             → error
         seq += 1; store p
         all seats with cards have picked → reveal + resolve + advance (§5)
unpick:  phase pick, seat has a pick → seq += 1; clear it
answer:  phase prompt, prompt is in the open group, seat is its seat, JSON answer,
         ruleset.prompts[kind].validate                      → error
         seq += 1; store the answer (answered = true; may be replaced until the group is full)
         every prompt of the group answered → remove the group, apply each answer in
         resolveOrder; queue empty → advance (§5), else refresh the next group
unknown type                                                → error
write back rng; checkInvariants (throws on a ruleset bug); return { ok: true, state: draft }
```

Errors are short English strings (`'not the pick phase'`, `'card 12 is not in your hand'`,
`'the open prompt is not yours'`, or the ruleset's own, e.g. `'not enough coins'`).

**Prompts** are follow-up decisions that effects create during resolution, round end or game
start ("choose a card from the discard pile to build for free"). They come in **groups**, opened
one group at a time in queue order: `ctx.prompt` queues a group of one, `ctx.promptGroup` one
group with at most one prompt per seat (e.g. a choice every seat makes at once). Every seat of
the open group answers at the same time; an answer stays hidden (`answer` is owner-only,
`answered` public) and may be replaced until the last one arrives. Then the whole group applies
in `resolveOrder`, so arrival order never matters (tested on permutations). A group of one
applies at once. An answer may queue more prompts. Prompt `data` (the options) is visible to the
prompted seat only. `waitingOn` = the open group's unanswered seats.

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
Clients and bots that want that memory track it themselves from successive views. The rules
want the engine to hand it out (R15.8), so that a bot with memory has no edge over a human:
§14 C10.

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
  startBeforeDeal?: boolean; // true: onGameStart's prompts come before round 0 is dealt (§5)
  onRoundStart?(ctx, round): void; // just before each deal (round 0 too), before roundSpec
  validateOptions?(options): string | null;
  normalizePick?(state, seat, pick): Pick; // fill default choices; keep card and use; view-safe
  validatePick(state, seat, pick): string | null; // the card is in the hand (core checked)
  legalPicks(state, seat): Pick[]; // sound; see §6 for completeness
  defaultPick?(state, seat): Pick; // timeouts; default = legalPicks[0]
  resolveOrder?(state): SeatId[]; // default 0..n-1
  resolve: ResolveStep<S, T>[]; // run step-major (§5)
  onLeftovers?(ctx, seat, cards): void; // last turn's leftovers (default: discard), §5
  onRoundEnd?(ctx): void;
  score(state, seat): Record<string, number>; // categories; total = sum
  tiebreak?(state, seat): number[]; // in order, the first that differs decides; higher wins
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
  onPlay?(ctx: Ctx<S, T>, seat: SeatId, spec: EffectSpec, source: Card | null, args?: Json): void;
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
ctx.play(seat, card, args?)      // → tableau, then each spec's onPlay(…, args) (e.g. pick choices)
ctx.place(seat, zone, card)      // → a seat zone (no triggers)
ctx.toDiscard(card)
ctx.toBox(card)                  // out of the game
ctx.take(cardId)                 // remove a card from wherever it is; the caller must put it somewhere
ctx.trigger(seat, specs, source, args?) // run onPlay of arbitrary specs (a Great Work tier)
ctx.prompt(seat, kind, data)     // queue a prompt (a group of one)
ctx.promptGroup([{ seat, kind, data }, ...]) // queue one group, answered at once (§6)
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
  Changing a pick before the reveal is supported, and the rules keep it (R15.2).
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
- Prompts come in groups (§6): one seat after another, or a group of seats at once (the Great
  Work choice). `startBeforeDeal` is opt-in so the toy keeps dealing first (net's session tests
  rely on hands during the toy's opening prompts).
- Memory of passed hands is not in views (§7). The rules want the engine to hand it out
  (R15.8): §14 C10.
- 2-player: the rules use no neutral seat (R14): §14 C1, C2.
- Pick changes before the reveal stay (R15.2): `unpick` and re-picking are kept.
- The log is not trimmed (a game is ~20 turns); revisit if states get large.

## 14. Contract changes for E2 (E1b: planned, not implemented)

Source: `docs/RULES.md` (R-numbers) and `docs/design/CARDS.md` of 2026-10-29, approved by the
human (H1), and design's D2c changes (new goods, a single-card pick, neighbour trade). Nothing
in this list is in the code yet. Each change lands with its tests, §1-§13 are updated in the
same commit, and the row leaves this list. Done so far: C3 (prompt groups, §6), C4
(`startBeforeDeal`, §5, plus `onRoundStart`), C5 (`normalizePick`), C6 (pick choices reach
`onPlay`), C9 (tie-break list), and an `onLeftovers` hook (for the D2c glean).

| #   | Change                                                                   | Rules    | Breaking for                |
| --- | ------------------------------------------------------------------------ | -------- | --------------------------- |
| C1  | 2 seats only: a turn also burns a second card                            | R14.2    | none (planned as pick args) |
| C2  | Secret roles: a burned card's face stays hidden in the reveal            | R14.3    | none (additive)             |
| C7  | Effects carry their source (card, Perk, tier)                            | R12.2a-b | ruleset code only           |
| C8  | `checkRuleset` also validates effects that are not on cards              | R13.3    | none (additive)             |
| C10 | Recall: each seat's owner-only record of the hands it passed this round  | R15.8    | none (additive field)       |
| C11 | `Ruleset` takes the card type, so `ctx.def()` returns the Windamere card | none     | ruleset code only (types)   |

### C1. 2 seats: the Burn

D2c made the pick a single card (R4.1), which the core already supports, so multi-card picks are
not needed for 3-7 seats. With 2 seats a town also Burns a second card on turns 1 to 4 (R14.2).
Plan: the pick names it in `args` (`{ burn: CardId }`), a resolve step moves it from the hand to
the discard, and C2 keeps it out of the public reveal. `legalPicks` grows to at most 10 × 9 × 2 =
180 picks on a fresh 10-card hand (one card to Build or Spend, another to Burn).

### C2. Secret roles (2-player Burn)

- `Ruleset.secretUses?: string[]` (Windamere: `['burn']`). In `lastReveal` and in the public
  `'reveal'` log entry, a card with a secret use shows as `{ id: -1 - k, def: HIDDEN_CARD }` to
  everyone but its owner. The role stays public ("a card was burned", R14.3). The full state
  keeps the face.
- Today the reveal log entry carries `card.def` for every pick (`reveal` in flow.ts), so without
  C2 a burn leaks through the log as well as through `lastReveal`.
- The leak test (§7) adds: scramble the face of every secret-use card.

### C7. Effect sources

R12.2 scores printed Renown by source: Buildings (cards, a) apart from Great Work (tiers, b). A
`renown` handler's `score` cannot tell a card from a tier today. Change:
`activeEffects?(state, seat): { source: string; effects: EffectSpec[] }[]` (e.g. `'perk'`,
`'tier:2'`); `effectsOf` returns `{ spec, source: Card | string }[]`; `EffectHandler.score` and
`onRoundEnd` get the source as their last argument.

### C8. `checkRuleset` beyond cards

Great Work Perks and tier rewards are `EffectSpec`s outside `cards`. New optional
`Ruleset.effectLists?(): { where: string; effects: EffectSpec[] }[]` (e.g.
`'the-wind-organ tier II'`). `checkRuleset` validates them like card effects and names `where`.

### C10. Recall

R15.8: a town may look at the cards it saw in each hand it passed on, until the Season ends.
Change: `SeatState.recall: { turn: number; to: SeatId; cards: Card[] }[]`, the hand as it was
passed. The core records it when it passes hands and clears it at round end; views show it to the
owner only (others: `[]`). These are copies, not cards: card conservation ignores them. Bots and
humans get the same memory, so bots no longer track it themselves (§7).

### C11. Card type parameter

`Ruleset<S, T, C extends CardDef = CardDef>` with `cards: readonly C[]`, and `ctx.def()` returns
`C`. Types only; it saves casts in E2.

Everything else the rules need fits the current contract; how the game uses it is §15.

### Rules questions found (for design)

1. _(answered)_ R14.3 against R15.8 (a burned card can often be worked out): D2c's R14.3 now
   says so (research R4 D7). C2 still hides the face, so the engine never tells more than the
   rules do.
2. **R8.3** runs the Great Work check only after steps 2 and 4. Labour gained at Season end would
   wait for the next turn, and at Winter's end it would never count. No card in CARDS.md gives
   labour at Season end today, so this is moot unless one is added.

## 15. The Windamere game (E2, in progress)

`src/engine/game/`, exported from the barrel. Rules: `docs/RULES.md`, approved by the human
(H1), with design's D2c changes (on `agent/design` d3eda57, not on main yet): five new goods, a
single-card pick with a glean on the fifth turn, buying goods from neighbours. Everything below
follows D2c. **Playable for 3 to 7 towns** with `createWindamereEngine(content)`, Great Work
choice included; not yet: the 2-player variant, Recall (list at the end).

**Content in, rules out.** `compileContent(content: WwContent): WwRules` (throws on bad content)
turns design's data (`src/content/`, CARDS.md §1 shapes) into lookups, the effect registry and
the R16 tunables (`DEFAULT_TUNABLES`; content may override any of them).
`checkContent(content): string[]` is the check design's content tests run. **Goods are data:**
`WwContent.goods` lists them in goods order, a town's `store` has exactly those keys, and no code
names a good. Gains and costs are `{ <good>: n, coins, labour, any }` (`any` only in Spend bands
and a card's own `onBuild`, R13.4: checked).

**State** (`WwState = DraftState<WwSeat, WwTable>`, all of it public, R1.11):

```ts
interface WwSeat {
  coins: number;
  store: Record<GoodId, number>; // every content good, in goods order
  labour: number; // only goes up
  greatWork: string | null; // null until the choice is revealed
  tiers: number; // completed, 0-4
  valour: number[]; // Valour tokens, each its Season's value
  covers: { card: CardId; by: CardId }[]; // R7.9: `card` (zone 'covered') lies under `by`
}
interface WwTable {
  honours: string[]; // the 3 revealed at setup
  raids: { id: string; revealed: boolean }[]; // by Season; unrevealed ones masked in views
}
```

**Done (unchanged systems), each with tests named by rule id:**

| System                  | Code                                                                                                                                                               | Rules                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Setup                   | `setupTable` (Honours, Raids), `setupSeat`; Raid reveal in `onRoundStart`                                                                                          | R2.2, R2.3, R2.6, R3.2, R1.11        |
| Halls, upgrades         | `checkBuildRules`, `buildCost`, `placeBuild` (covered cards move to the public `covered` zone)                                                                     | R7.1, R7.3, R7.8-R7.10, R13.1, R17.7 |
| Great Work track, Perks | `greatWorkCheck`, `nextThreshold`; Perk and tiers via `activeEffects`                                                                                              | R8.1-R8.6                            |
| Raids                   | `resolveRaid` (Season end, every Guard read first; bounty paid by the plundered neighbour), `currentRaid`                                                          | R9.1-R9.7, R17.6, R14.5              |
| Lore                    | `loreRanks`, `loreRuns`, `loreScore`                                                                                                                               | R10.1-R10.5                          |
| Honours                 | `honourStandings` (leaders all game, works on views), `honourScore`, `measure` (R11.5)                                                                             | R11.1-R11.5                          |
| End scoring             | `scoreTown` (groups `CATEGORIES`: town, greatWork, raids, lore, honours, purse), `tiebreakOf` [tiers, coins]                                                       | R12.2-R12.5, R7.7                    |
| Effects                 | `renown guard lore onBuild onBuildPerKind heldBonus seasonEnd scorePerKind scorePerTier scorePerValour scoreSets scoreGoods scoreBeat scoreThreshold scoreSeasons` | R13, R17.8                           |

Score by source (R12.2): on an uncovered card, printed `renown` and `score…` effects are Town
(a); on the Perk or a completed tier they are Great Work (b). A covered card counts for nothing.
Readers for ui and bots: `measure(rules, state, seat, id)` (R11.5), `guardOf`, `countKind`,
`kindCounts`, `honourStandings`, `scoreTown`; all read public information only.

`windamereRuleset(rules)` wires these into a core `Ruleset` (Season end: `resolveRaid`, then the
core runs `seasonEnd` effects in seat order, R3.6).

### 15.1 The turn (R3, R4, R6; `turn.ts`, `pick.ts`, `pay.ts`)

**Deal** (`roundSpec`): the Season's cards at the seat count's copies (`counts[i]`, i = seats − 3;
2 seats would use the 4-seat counts), 6 to a hand, 5 turns, left in Spring and Autumn, right in
Summer and Winter. The fifth turn's spare card goes to the town's `glean` zone (`onLeftovers`)
and is Spent in step 1 (R3.5).

**Pick** `{ card, use: 'build' | 'spend', args?: WwPickArgs }`:

```ts
interface WwPickArgs {
  any?: GoodId[]; // "any" goods of the Spent card's band, or of the Built card's own onBuild
  glean?: GoodId[]; // "any" goods of the glean's band (fifth turn)
  cover?: CardId | null; // Build: the card an upgrade covers; null = full cost (R7.9)
  discount?: GoodId[]; // Build: goods a discount takes off, one entry per good (R6.1)
  pay?: Payment[]; // Build: one entry per missing good, in goods order (R6.3)
}
type Payment =
  | { good; via: 'buy'; from: SeatId } // a neighbour, at the Season's price (R6.6)
  | { good; via: 'exchange'; give: GoodId } // 2 of `give` (R6.3)
  | { good; via: 'bank' }; // 5 coins
```

`normalizePick` fills whatever `args` leaves out with the R15.7 defaults, so `{ card, use }` is a
complete pick; the stored and revealed pick holds every choice (R4.4: the purchases are public
with the reveal). Defaults: payment = fewest coins, then fewest goods given in Exchanges, then
the left neighbour before the right, Exchanges in town order, goods in goods order (an Exchange
costs no coins, so it wins over buying when the town can afford the goods); "any" = the first
good the Build still lacks, else the good the town holds fewest of; upgrade = the first matching
uncovered card; discount = goods order. `legalPicks` = every Spend, plus every payable Build
with default choices (an upgrade both ways). `defaultPick` = Spend the first card (R15.6).

**Resolve steps**, step-major (R4.8): 1 Spend (band + `spendBonus`, glean) · 2a Pay (own goods,
Exchanges, coins for the cost, purchases and bank) · 2b Sell (each seller fills its neighbours'
purchases from what its own Build left, alternating buyers from its left; a short good comes
from the bank at the same price, R6.7; `sellBonus`) · 2c Build (cover, place, "when built",
`buildBonus`) · Great Work check · 3 Tolls · 4 Yield (`yield`, `income`; not in Winter) · Great
Work check.

**For ui and bots:** `checkPayment(pc, plan)` and `defaultPayment(pc)` with
`pc = { rules, state, seat, cost, purse }` (`buildCostAfterDiscount`, `purseOf`), `missingGoods`,
`exchangeGoods`, `marketPrice`, `discountFor`, `gleanOf`, `spendGains`. All view-safe.

Measured: a whole random game takes about 10-35 ms (vitest, 3-7 towns), so a few thousand games
per minute on one core. Unmeasured: bots that rate every legal pick.

### 15.2 The Great Work choice (R2.4, R2.5, R15.10; `greatWork.ts`)

`createGame` returns the game in the `prompt` phase (`then: 'start'`), before any card is dealt
(`startBeforeDeal`). `onGameStart` shuffles the pool and deals 2 to each town in seat order, as
one prompt group of kind `'greatWork'`: `data = { offers: [id, id] }` (owner-only, R1.11). Answer
with `{ type: 'answer', seat, prompt, answer: <offered id> }`; it stays hidden and may change
until the last town has chosen (R2.5). Then every choice applies at once: `WwSeat.greatWork` is
set (public), a `'greatWork'` log entry per town, Perks active. The offers not chosen leave with
the prompts and are named nowhere in the state. Timeout: the first offered (R15.6). Then round 0
is dealt and the Spring Raid revealed. Net: this is the one decision outside a pick (R15.10),
with its own 60 s clock; `waitingOn` and `defaultAction` cover it.

**Not yet:**

- the 2-player variant (R14: Burn on turns 1-4, §14 C1, C2). `minSeats` is 3 until then.
- Recall (R15.8, §14 C10). Timeouts use the fallback pick (R15.6); the Easy bot is bots' lane.
- shipped content: `createWindamereEngine()` without `content` throws `WINDAMERE_NOT_READY`
  until design's `src/content/` exists.

Tests use `src/engine/game/testing/fixture.ts`: made-up test content whose goods (flint, slate,
honey) are not the game's, and `testing/helpers.ts`. The unchanged systems are tested on hand-built
states (`newWwGame`), the turn on the real engine (`fxEngine`, `playTurn`, controlled hands), and
whole random games for 3-7 towns check soundness and view-safety of `legalActions` and
`defaultAction` at every step. Mutation checks by hand (each reverted): tie-break order, bounty
count, unmasked Raids, fill order of purchases, Yield in Winter, the default plan's order; each
made rule tests fail.
