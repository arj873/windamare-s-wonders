# Online multiplayer — port plan (N0)

Status: **plan, nothing built.** Written before `docs/ENGINE.md` and `docs/RULES.md` exist (the
engine, design and platform branches had no commits when this was written). Everything that
depends on the engine API is marked **ASSUMES** and must be re-checked against `docs/ENGINE.md`
when it lands. Unsure numbers are marked "guess".

Source of the port: `/home/blop/projects/catan` (read-only): `docs/MULTIPLAYER.md`, `src/net/`
(≈ 3.9k lines incl. tests), `src/server/` (≈ 1.3k lines), `wrangler.jsonc`.

Decisions carried over from Catan (user): invite link + nickname, no accounts; host creates a room
and shares `/room/<code>`; bots fill empty seats and play for disconnected players; text chat +
quick reactions; server-enforced timer; spectators; Cloudflare Workers + one Durable Object per
room, same project as the static site. **No deploy from this lane** (needs the human's account).

## 1. What carries over as-is (game-agnostic)

| Piece (Catan path)                                                                                                                                                                | Keep                        | Notes                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `net/guard.ts`                                                                                                                                                                    | yes                         | tiny validators                                                                            |
| `net/transport.ts`, `net/loopback.ts`, `net/testHarness.ts` (`LocalNet`, fake clock)                                                                                              | yes                         | in-memory transport for tests and for client tests                                         |
| `net/client.ts` (`RoomClient`: reconnect, token storage, ping)                                                                                                                    | yes, minus Catan view types | storage key becomes `windamere.mp.token.<room>`                                            |
| `net/api.ts` (paths, 6-char room codes, alphabet without 0/O/1/I)                                                                                                                 | yes                         |                                                                                            |
| `server/worker.ts`, `router.ts`, `origin.ts`, `limits.ts`                                                                                                                         | yes                         | origin check, per-IP caps, per-socket frame caps                                           |
| `server/room.ts` (`RoomCore`: DO lifecycle, hibernation restore, alarm = `tick`, `reconcile`)                                                                                     | yes                         |                                                                                            |
| `server/testRuntime.ts` (`FakeRuntime`)                                                                                                                                           | yes                         |                                                                                            |
| `wrangler.jsonc`                                                                                                                                                                  | yes                         | new `name`, SQLite DO class `Room`, assets `dist/`, `run_worker_first: ["/api/*","/ws/*"]` |
| Session shell inside `session.ts`: members, tokens, host + succession, kick, chat, reactions, rate limits, grace/away, idle expiry, `snapshot/restore`, `nextWakeAt`, `isExpired` | yes                         | roughly 60% of the 1183 lines                                                              |
| Protocol envelope: `{v, type}`, `hello/welcome/room/chat/react/sync/error`, close codes 4000–4004, `ping`→`pong`                                                                  | yes                         |                                                                                            |
| Profile messages (avatar, pieceStyle)                                                                                                                                             | **defer**                   | cosmetic, not in N1                                                                        |

Rules that stay: the server is the authority, clients send intents, never see full state, `seq`
on every intent, no `Date`/`Math.random`/timers inside `src/net` (time enters through `now`),
chat rendered as text only.

## 2. What changes for this game

### 2.1 Simultaneous picks (replaces "one player acts, others wait")

Catan is turn-based: one `intent` mutates state, everyone gets a new view. Drafting is
simultaneous: every seat picks a card from its hand in the same round, picks are hidden until all
are in, then revealed together and hands pass.

Server model (ASSUMES the engine splits a round into _submit_ and _resolve_; see §6):

1. Round starts. Each seated human (and each bot) owes one **pick**.
2. A `submit` message is stored by the session as **pending** for that seat. It is _not_ applied
   to the game state yet. The sender gets an `ack`; nobody else learns what was picked, only
   _that_ seat N has submitted (`submitted: boolean[]` in the view).
3. A seat may **change** its pick until the round resolves (guess: yes, matches colonist-style
   feel; if RULES.md says picks lock, add `locked` and reject with `already_submitted`).
   `withdraw` clears it.
4. When every seat has a pick (or the timer fires, §2.1.1), the session applies all picks to the
   engine in one step (seat order is irrelevant if the engine resolves simultaneously; if the
   engine needs an order it must be fixed by the engine, not by arrival time, so a fast clicker
   gets no advantage and results are deterministic).
5. One new `game` message per member with the revealed picks, the new hand, and the next round.

Pending picks are **secret server state**: they live in the snapshot (so a DO restart keeps
them) and never appear in any `viewFor` output except the owner's own seat.

#### 2.1.1 Timer and auto-pick

- One **round clock** for all seats (not a per-player clock as in Catan): `roundTimerSec`
  (guess: 60 s early rounds, shorter later; the lobby will offer steps, default TBD by design).
- When it expires, every seat without a pick gets an **auto-pick**: the engine's
  `defaultPick(view, seat)` (ASSUMES the engine or bots lane exposes one; fallback: the first
  legal pick, which is deterministic). Chat line "Ann ran out of time" once per seat per round.
- Disconnected (`away`) seats keep their clock but are not waited for: with the timer on they
  auto-pick at expiry like anyone else. **Optional rule to decide** (Needs: design): once all
  _connected humans_ have submitted, resolve immediately instead of waiting for away seats, if
  the away seat has no pick. Without that, one dropped player stalls each round to the full
  clock for up to `graceMs` (60 s), then a bot takes the seat and picks after `botDelayMs`.
  Recommendation: resolve early for away seats with an auto-pick. Cheap, and it keeps the table
  moving.
- Timer **off**: the round waits for humans; bots and away-with-bot seats pick after
  `botDelayMs`. A seat that is `away` within grace blocks the round, as in Catan (≤ `graceMs`).
- Bots submit like humans, staggered by `botDelayMs` (900 ms guess, tuned so the reveal doesn't
  land before a human can see their own hand) and never wait on the clock.
- Paused when nobody is connected (as Catan §8): no bot picks, clock frozen.

### 2.2 Hidden hands — per-seat redaction

Catan's `viewFor` masks resources and dev cards of _other_ players. Here the secret is bigger:
the **hand being drafted** (and hands queued behind it), pending picks, decks.

Required from engine (ASSUMES; confirm in `docs/ENGINE.md`):

```ts
viewFor(state: GameState, viewer: SeatId | 'spectator'): GameView
```

What a view must contain / hide (this is my requirement list; engine decides the shape):

| Secret                                                        | Viewer sees                              | Everyone else sees      |
| ------------------------------------------------------------- | ---------------------------------------- | ----------------------- |
| current hand of seat S                                        | cards in own hand                        | `handCount[S]` only     |
| hands of other seats (incl. the one about to be passed to me) | nothing, until it is passed to me        | counts                  |
| pending (unrevealed) picks                                    | own pick only                            | `submitted[seat]` flag  |
| deck / age stacks, shuffle seed, RNG                          | nothing                                  | `deck.length` per stack |
| previous picks of passed-on hands                             | revealed picks go to the tableau, public | public                  |
| bot internal state                                            | —                                        | —                       |

Genre note: in a drafting game a card you have _seen_ and passed is still information about
what neighbours hold. That is legal under the rules and not a leak. What must not leak is
anything an opponent could not learn at a real table.

Spectators: masked like an opponent for **every** seat (no hands at all), pending picks hidden.
Game over: tableaus public (already); unrevealed hands/decks/seed stay hidden.

Proof requirement (carry over Catan's two tests):

1. unit: `viewFor` output contains no secret field for any viewer;
2. property: over N simulated bot games, a view does **not change** when only secrets change
   (re-shuffle other hands/decks/seed/pending picks of other seats). This is the test that catches
   the subtle leaks; it lives in `*.audit.test.ts` territory (qa) and `src/net` tests (net).
   Plus a **wire canary test** in `src/net`: serialise every outbound frame of a full bot game to
   each seat and assert none contains a card id that is only in another seat's hand/pending picks.

`legal` (the actions the HUD enables) is computed server-side from the full state, filtered to
the viewer, as in Catan. For drafting: `legal` = the picks and play modes (build / discard for
coin / wonder stage, ASSUMES, per RULES.md) available to this seat for the cards in their hand.
Never ship `legalActions` computed for other seats.

### 2.3 Reconnect mid-round

Catan reconnect restores a view; here a reconnect can land in the middle of a round, so:

- `hello{token}` → `welcome`, then the session sends the **full current `game`** for that seat,
  including: own hand, `submitted[]`, and **own pending pick** (so the UI shows "you picked X,
  waiting for 2 players" instead of an empty choice).
- The pending pick stays valid across disconnect. A pick submitted, then socket drop within the
  round, is **kept** (not discarded) and still resolves with the round.
- Reconnect after the grace period (a bot played for the seat): the bot's pick for rounds that
  already resolved stands; if the _current_ round has a bot-made pending pick, the returning
  player sees it and may change it (unless picks lock), then continues. The seat flips back to
  `human`. System chat line as in Catan.
- Replaced tab (`replaced`, 4003), kicked (4002), expired (4004): unchanged.
- `seq` semantics: increments on every **state change visible to someone**, including "seat N
  submitted". An intent carries the `seq` it was made on; with simultaneous picks a stale `seq`
  is common (someone else submitted meanwhile) and must **not** reject a pick. Plan: for
  `submit` ignore `seq` and use `round` instead (`round` mismatch → `stale_round`, the pick
  belongs to a round that already resolved). Other intents keep `seq`.

## 3. Protocol deltas (`PROTOCOL_VERSION` 1, new game, so no compatibility burden)

Client → server, **new or changed**:

| type       | fields                        | who / when                                                                                                    | errors                                               |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `submit`   | `round: number`, `pick: Pick` | seated, playing, round open                                                                                   | wrong_phase, not_seated, stale_round, illegal_action |
| `withdraw` | `round`                       | seated, playing                                                                                               | wrong_phase, stale_round, locked (if picks lock)     |
| `intent`   | `action: Action`, `seq?`      | **non-draft** actions only, if the engine has any (e.g. end-of-age choices, a monument stage with a decision) | as Catan                                             |

Server → client, **new or changed**:

| type     | fields                                                                                                                                           | sent                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `game`   | `seq`, `round`, `view: GameView`, `legal: Pick[]`, `timer: {kind:'round', remainingMs, totalMs}`, `submitted: boolean[]`, `myPick: Pick \| null` | to each member after every visible change, own view only                                                                                      |
| `reveal` | `round`, `picks: {seat, pick}[]`                                                                                                                 | optional: lets the UI animate the simultaneous reveal; contents also appear in the next `game` view. Skip in N1 if the log already carries it |
| `ack`    | `ref: 'submit'\|'withdraw'`, `round`                                                                                                             | to sender                                                                                                                                     |

Unchanged from Catan: `hello welcome room chat reaction error sync`, `setName takeSeat leaveSeat
setColor setBotLevel configure kick start rematch chat react`, error and close codes (add
`stale_round`, `locked`). `RoomConfig` loses Catan's map/robber/expansion fields; gains
`seatCount` (range from RULES.md, guess 3–7), `roundTimerSec`, and whatever the design lane puts
in `NewGameConfig`. `Pick` and `Action` types come from the engine; protocol parsers must
**rebuild** payloads from known fields (as Catan's strict parsers) and validate ids against the
engine's card catalogue.

Frame limits: `LIMITS.messageChars` 8000 stays (no avatars in N1). A full view will be smaller
than Catan's (no board, short log); guess < 10 KB, **untested**.

## 4. File list for N1

Copy then adapt. `src/net` and `src/server` only, plus `wrangler.jsonc`.

```
src/net/guard.ts            copy
src/net/transport.ts        copy
src/net/loopback.ts         copy
src/net/testHarness.ts      copy (LocalNet, fakeDeps)
src/net/api.ts              copy (+ rename)
src/net/protocol.ts         adapt: drop Catan actions/variants/profile, add submit/withdraw/ack/stale_round
src/net/session.ts          adapt: keep shell; replace turn model with RoundState {round, pending[], clock}
src/net/round.ts            NEW: pending picks, all-in detection, auto-pick, round clock (pure, testable)
src/net/client.ts           adapt
src/net/*.test.ts           port session/protocol/client tests; new round.test.ts, leak.test.ts
src/server/{worker,router,origin,limits,room,testRuntime}.ts   copy, adapt names
src/server/*.test.ts        port
wrangler.jsonc              adapt
docs/MULTIPLAYER.md         this file, updated to "as built"
scripts/e2e-server.*        later; the script lives outside my lane (platform owns scripts/gate.sh;
                            scripts/sim* is bots). Ask under Needs: if wanted
```

## 5. Effort estimate

Guesses; Catan's M1+M2 are the yardstick. **Untested.**

| Step                                                                    | Estimate                   | Blocked by                                                   |
| ----------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| Copy + rename, get Catan-shaped session compiling with a stub engine    | 0.5 day                    | platform scaffold on main (tsconfig, lint, vitest)           |
| Round model: pending picks, clock, auto-pick, bots (`round.ts` + tests) | 1 day                      | engine API for submit/resolve, `defaultPick`, bots interface |
| Protocol + strict parsers for picks                                     | 0.5 day                    | engine `Pick`/`Action` types                                 |
| Per-seat view wiring + leak tests (unit, property, wire canary)         | 1 day                      | engine `viewFor`                                             |
| Reconnect mid-round + restore tests                                     | 0.5 day                    | —                                                            |
| Server adapter port (`RoomCore`, router, limits) + tests                | 0.5 day                    | —                                                            |
| Docs "as built"                                                         | 0.25 day                   | —                                                            |
| **Total N1**                                                            | **≈ 4 days of agent time** |                                                              |

Client side (RoomClient glue, lobby, "waiting for N players" UI) is **ui lane**, not counted.

## 6. Requirements on other lanes (copy into `Needs:`)

**Engine** (`docs/ENGINE.md`):

1. `viewFor(state, seat | 'spectator')` per §2.2, with the leak property test.
2. Simultaneous resolution API, e.g. `submitPick(state, seat, pick) → state'` that stores a hidden
   pending pick, and `resolveRound(state)` that applies all picks, reveals, passes hands. Or one
   `applyRound(state, picks[])`. Either is fine as long as picks are passed **in one batch** and
   the result does not depend on arrival order.
3. `legalPicks(state, seat)` and a deterministic `defaultPick(view|state, seat)` for timer auto-picks.
4. State must be JSON-serialisable and versioned (`schemaVersion`) for DO snapshots; seeded RNG
   only, no `Math.random`.
5. Engine pure: no `Date`, timers, DOM.

**Bots**: bot takes `viewFor(state, seat)` (not full state) and returns a `Pick`; so bots cannot
cheat and the server can run them uniformly.

**Design**: seat count range; whether a pick can be changed before reveal; whether the round
resolves early when only away seats are outstanding; timer lengths; any non-draft decisions that
need a separate `intent`.

**Platform**: scaffold on main (I wait for the go), `wrangler` + `@cloudflare/workers-types` as
dependencies, `tsconfig` that allows `src/server` Worker types, a `dev:server` script.

## 7. Risks and unknowns

- **Engine API unknown.** The whole of §2.1/§2.2 is a proposal. If the engine resolves picks
  sequentially in seat order or reveals picks incrementally, the pending-picks store changes.
- **Early-resolve with away seats** (§2.1.1) is a gameplay call, not mine.
- **Information leaks via timing**: a bot answering instantly vs humans slowly shows who is a
  bot (already public: `SeatInfo.status`). Auto-pick timing at expiry reveals nothing new.
- **Information leaks via `submitted[]`**: it tells others who is still thinking. This is public
  at a physical table too; acceptable. Say so if design disagrees.
- **DO write volume**: one `put` per visible change. A round of 5 submits + 1 resolve is ~6
  writes plus bot picks; a full game (guess ~18 rounds × 6) ≈ 100–200 writes, well under
  Catan's 1–2k. Free-plan limits not rechecked.
- **Sub-second bot staggering** via alarms is fine for pacing, not for precise timing (as Catan).
- Nothing here has been run. No code written, no tests, no Cloudflare access used.

## 8. N1 progress (as built)

Gate passes (157 tests across the repo; net's: session 21, room server 8, router/limits/api ported).

**The real engine, no adapter.** `docs/ENGINE.md` landed, and its `DraftEngine<S, T>` (bound with
`createDraftEngine(ruleset)`) is used directly: `GameSession<S, T>` takes it as a constructor
argument. The §2.1 design (session-held pending picks, batch resolve) is **superseded**: the engine
stores each seat's hidden pick itself and reveals when the last one arrives, in a fixed order.

- Client messages: `pick {pick}`, `unpick`, `answer {prompt, answer}` (seat is implied by the
  sender, never taken from the message). Engine errors come back as `illegal_action`.
- `game` message: `seq` (engine), `view` (engine `viewFor`: own pick and `view.submitted[]`
  included), `legal` (engine `legalActions` for that seat, [] for spectators), `waiting`
  (`waitingOn`), `timer`.
- Clock: one per _stage_ (turn, or one prompt); resets when `(round, turn, phase, prompt)`
  changes. On expiry every seat in `waitingOn` gets `defaultAction`.
- Bots: `defaultAction` computed from the seat's own `viewFor`, `botDelayMs` after a stage opens
  (placeholder policy until the bots lane has one).
- Away seats: when every seat in `waitingOn` is away, they get `defaultAction` at once
  (`autoPickAway`, default on). Design has not confirmed this yet.
- Leak test over a whole game with a prompt (`session.test.ts`): after every step each seat's
  `game` message holds no card id from another seat's hand, other zones or the deck, no other
  seat's pick, no seed or rng, and only its own legal actions. Toy ruleset only; it must be
  re-run on the Windamere ruleset.
- A bug the room tests found: a snapshot dropped the socket ids, so after a Durable Object
  hibernation every live socket got `not_joined`. Snapshots now keep them and `reconcile` drops
  the dead ones.

**Server** (`src/server/`, ported from Catan): `router.ts`, `origin.ts`, `limits.ts`, `room.ts`
(`RoomCore`), `worker.ts`, `testRuntime.ts`; `src/net/api.ts`; `wrangler.jsonc` (copied, name not
yet changed). `RoomCore` gets the engine through `RoomPlatform.engine`.

**Not done**

- `src/server/engine.ts` throws: the Windamere ruleset (engine card E2) is not on main, so a
  deployed room cannot start. Tests inject the toy ruleset.
- `src/net/client.ts` (browser `RoomClient`) is not ported; the ui lane will need it.
- Host succession, seat colours, bot levels, profiles.
- Nothing has run under workerd or `wrangler dev`; no deploy (needs the human).
- Per-IP HTTP limits live in isolate memory (as in Catan).

## 9. Following RULES.md R15 and ENGINE.md §14 (2026-10-29)

- **Away seats (R15.5)** replace "resolve at once": when every seat still owed an action is away,
  they get `awayWaitMs` (15 s) more, never past the clock, and it applies with the clock off too.
  `autoPickAway` is gone. After `graceMs` (60 s) a bot plays the seat, as before.
- **Clock (R15.3)** is a room preset `timer: off | relaxed | normal | fast` (replaces
  `roundTimerSec`), per stage: pick clock by turn 45/40/35/30/25 s × preset, 60 s for an `answer`
  stage. Lengths live in `CLOCK_SECONDS` (`protocol.ts`); R15.3 marks them provisional (†).
- **Timeout pick (R15.6)** and bot seats use `pickFor(engine, view, seat, {level:'easy', salt})`
  from `src/bots`, from the seat's own view; the engine's `defaultAction` is the fallback.
- **Pick shape**: `{ card, use, args? }` only (single pick, ENGINE.md §15); the multi-card form
  was dropped again.
- **Prompt groups (C3)**: a group is one stage (`prompts[0].group`), one 60 s clock, `answer`
  relayed per seat; `waiting` already lists every seat in the group. Untested until the engine
  implements groups (only sequential prompts exist today).
- Not changed: single-pick vs pair needed nothing (the pick is opaque to net).

## 10. N3: real games and the client (as built)

- **Real engine.** `src/server/engine.ts` returns `createWindamereEngine(windamereContent())`
  (shipped content, ENGINE.md §15). `src/server/windamere.test.ts` plays a full 4-town game through
  `GameSession` (humans timing out, bots playing), checks the Great Work group (all towns answer
  at once, hidden, 60 s clock, answers masked), and runs the **leak test over a whole game**:
  every `game` message holds no card id from another seat's hand, the deck or the box, no other
  seat's pick or recall, no seed, and only that seat's own legal actions. Recall (R15.8) is the
  owner's own memory, so its faces are allowed for the owner only. Prompt groups (C3) are in the
  engine now and work through the stage logic unchanged.
- **Client.** `src/net/client.ts` (`RoomClient<S, T>`), `transport.ts` (token key
  `windamere.mp.token.<room>`), `loopback.ts` (`RoomHost`, `FakeClock`, `hostConnect`): the
  UX.md §17 API. Getters `status attempts fatal you room me mySeat isHost game chat`,
  `timerLeftMs()`; events `status room game{game,prev} reveal chat reaction error fatal`
  (`reveal` is derived from `lastReveal` changing); methods `start close leave retryNow pick
unpick answer setName takeSeat leaveSeat configure kick startGame rematch chatSend react sync`.
  A fatal `error` frame followed by the socket close emits one `fatal` event and never retries.
- **Wire glue.** `src/net/ws.ts`: `webSocketConnect(base, roomId, make)` (a `Connect` over
  WebSocket; a failed open reports 1006 so the client backs off) and `httpRoomApi(base, fetch)`
  (`create`, `check`); the UI passes `globalThis.WebSocket`/`fetch`. Unit-tested with fakes.
- **Server e2e under the real runtime.** `src/server/e2e/serverE2e.ts` starts `wrangler dev`
  (workerd), creates a room over HTTP, seats two WebSocket clients (third seat a server bot), plays
  a whole 3-town Windamere game on the Fast clock with autopilot clients, drops and reconnects Bob
  mid-game, and checks every view for leaks. Run: `nice -n 19 pnpm exec tsx
src/server/e2e/serverE2e.ts` (about 1 minute; builds `dist/` if missing; state in `.wrangler-e2e`,
  removed afterwards). **Result: passed**, which is the first time any of this ran under workerd.
  Not in `pnpm test`. A `pnpm e2e:server` script entry is platform's to add.
- **Not done:** the 2-tab _browser_ e2e (playwright is on main, P9): the UI has no online screens
  yet (home, lobby, table over `RoomClient`), so there is nothing to drive. No deploy.

## 11. N4: bot level, seat colour, First game, clock check

- `RoomConfig.botLevels?: ('easy'|'medium'|'hard')[]` (by seat index, default medium) and
  `colours?: number[]` (slots 0..7, by seat index, must differ). Both are at most `seatCount`
  long. `SeatInfo` in the `room` message now always carries `botLevel` and `colour`; seats with no
  chosen colour take the lowest unused slots. A bot playing a seat (empty seat, or grace over)
  uses that seat's level via `pickFor`; a **timeout pick is always Easy** (R15.6).
- **First game (R19.1)** needs no protocol change: the host sets `config.options.firstGame = true`
  and `options` is passed to the engine's `createGame` / `validateConfig`. The engine field is
  engine's E6; untested against the real engine until it lands (the toy ruleset ignores it).
- `src/server/clock.test.ts` asserts the server clock equals `windamereClock.seconds` for every
  preset and turn, so hotseat and online cannot drift.
- **Backward compatible:** `SeatInfo.botLevel` / `colour` are optional on the wire type (absent =
  medium / seat index); the server always sends them.
- **First game** is tested on the real engine (`windamere.test.ts`): `options.firstGame` starts in
  the `pick` phase, no Honours, every town holds a Great Work; a misspelt option key refuses to
  start. The full game then plays to `over`.
- **Season card time (R7 net #1):** `SessionOptions.openingBonusMs` (default 0 in `GameSession`,
  8 400 ms set by the server in `sessionOptionsFrom`) is added to the pick clock of turn 0 of each
  Season; `timer.totalMs` includes it. The in-page/SharedWorker dev backends use the default 0.

## 12. N5: host wake after game over, 2-tab browser e2e

- `nextWakeAt()` no longer returns null in `over` while the host is gone: the host-grace due time
  stays, so a room whose host dropped at final scores passes the role on without a message.
- `src/server/e2e/browserE2e.ts` (`pnpm exec tsx src/server/e2e/browserE2e.ts [--headed] [--out dir]`):
  rebuilds `dist/`, starts `wrangler dev` (app + room server, one origin), opens two isolated
  Chromium contexts. Ann: Play online, invite link; Bob: join card from the link; Ann picks Fast and
  starts; both tabs play to final scores by clicking their own legal choices; every `game` frame a tab
  receives is leak-checked; Ann's Rematch returns both to the lobby. Passed (64 game frames per tab).
  Shared helpers (wrangler lifecycle, leak canary) are in `e2e/support.ts`. Not checked: that the
  Fast clock really applied, phone layout, reconnect in a browser.

## 13. N6: room storage size

- Saved session text at game end (JSON chars, mostly ASCII): **3 towns about 70 KB, 7 towns about
  141 KB** (measured 2026-10-30 on main with E8; every save writes the whole value).
- Limit: SQLite-backed Durable Objects, "Key and value combined cannot exceed 2 MB"
  (https://developers.cloudflare.com/durable-objects/platform/limits/, page updated 2026-10-29).
  KV-backed classes allow only 128 KiB, which a 7-town game would exceed, so `wrangler.jsonc` must
  keep `new_sqlite_classes` (tested). 141 KB is about 7% of 2 MB: **no split needed**.
- `src/server/measure.test.ts` fails if any save of a 3- or 7-town game passes 512 KB (a quarter of
  the limit). If the log keeps growing, split state and log into two keys then.
- Not measured: Durable Object write volume per game (each state change rewrites the value).
- Default bot level is **medium** (Normal, like hotseat; N8). Timeout picks stay Easy (R15.6).

## 14. N7: Durable Object write volume per game (measured, nothing changed)

Method: `RoomCore` on a fake runtime with the real Windamere engine, two humans who act at once
(about 1 s per move) plus server bots (0.9 s), Normal clock, playing to `gameOver`; counting each
`storage.save` and its text length, and each `setAlarm` write. Measured 2026-10-30 on main 86c28af
(throwaway test, not kept):

| towns | saves | bytes written | alarm writes | final value |
| ----- | ----- | ------------- | ------------ | ----------- |
| 3     | 64    | 1.7 MB        | 34           | 50 KB       |
| 7     | 64    | 4.5 MB        | 34           | 143 KB      |

About 4 saves per turn (two picks, bot picks, the resolve). Saves only happen when the snapshot
text changed, so `sync`/ping/hello that change nothing write nothing. 64 writes of one row per
game is small; the bytes are the larger number (a save rewrites the whole value, so bytes grow
with the log). Not looked up: Cloudflare's billing for rows written vs bytes, so I do not claim a
cost. Coalescing (one write per resolved turn plus on alarm) would cut about 4 to 1 per turn, but
risks losing the pending picks on eviction (R15.2 picks are changeable, so a lost pick is
re-sent by the client, but a bot pick is not), so I recommend leaving it unless billing says
otherwise.
