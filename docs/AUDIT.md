# Audit log (qa lane)

A finding gets a failing test marked `it.fails` in a `*.audit.test.ts` file next to the code.
The owning lane removes the marker in the commit that fixes it. Severity: **high** = breaks
hidden information or locks players out; **medium** = a player or host can stall or wedge a room;
**low** = needs a hostile or buggy client, limited damage.

## Q0 — engine core and net session (re-checked on main 63002f4)

Tested: `src/engine/core/*` through the toy ruleset, `src/net/session.ts` through the real engine with the toy ruleset.
Not tested (not on main yet): the Windamere ruleset, the Durable Object adapter, `src/server`,
any real token/seed generator.

| ID    | Sev    | Owner  | Finding                                                                             | Status                                                  |
| ----- | ------ | ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Q0-N1 | medium | net    | `hello` not rate limited; one socket could fill the member cap and lock out joiners | fixed (net c41563a), guarded by `session.audit.test.ts` |
| Q0-N2 | medium | net    | second `hello` on one socket left the first member "connected" forever              | fixed (net c41563a), guarded                            |
| Q0-N3 | medium | net    | no host succession; a departed host stranded the room                               | fixed (net c41563a), guarded                            |
| Q0-N4 | low    | net    | engine exception escaped `start` for an unsupported table size                      | fixed (net c41563a: seat range from ruleset), guarded   |
| Q0-E1 | low    | engine | `cloneJson` turned a JSON `__proto__` key into a prototype                          | fixed (engine cf1cf74), guarded                         |

Open findings: none. The tests stay as regression guards; any lane that changes an API they use must keep them compiling.

## Q1 — Windamere engine against docs/RULES.md (re-run on main 9a7a293, fixture content)

Tested: `src/engine/game/*` through `createWindamereEngine(FIXTURE)` in
`src/engine/game/rules.audit.test.ts`. The real card data (`src/content/`) is not on main, so card
numbers are the engine fixture's. Rules design is still moving in D8 (Summer price, R6.7/R17.9):
those two are covered only by the generic buy/short-supply tests and need a re-check after D8.

**Open findings: none.** Method:

- **Property tests (2 to 7 seats, 5 to 8 seeds each).** Whole 20-turn games of random but legal
  _rich_ picks: purchases from either neighbour, Exchanges, bank, upgrades, random "any" goods,
  random Great Works, random starting coins and stores. A counter test proves they exercise
  buying, Exchanges, the bank, covers, gleans, tier completions and bounty. Per turn: arrival
  order never changes the state (R4.8, R15.9, byte-equal JSON); hands pass to the right
  neighbour for the Season (R3.3, R4.6); five turns a Season, hands empty and glean zone empty at
  Season end (R3.5); coins, goods and counters stay whole numbers >= 0; labour and tiers only
  rise and tiers equal the thresholds reached (R8); Landmarks are unique (R7.8); covered cards
  sit in the covered zone with a coverer in town (R7.9); a Valour token appears exactly when
  Guard >= the Raid, worth the Season's value (R9.4). At game end an **independent oracle**
  re-implemented from RULES.md (Guard, Lore runs, Honours, every R13 `score…` effect, purse,
  tie-break and ranking) must equal the engine's scores and ranking.
- **Hidden information (R1.11).** Views hide later Raids, other hands, other picks and the glean
  zone; towns stay public; changing a pick leaves no trace for other seats.
- **Targeted rules:** R2.2/2.3/2.6/2.7, R3.7 (no Yield in any Winter turn), R4.5 timing,
  R6.3 bank 5, R6.5, R6.6b per-neighbour limit, R6.6c price per Season, R6.7 shortage and
  left-neighbour order, R7.8-R7.10, R9.5-R9.7 and R17.6 (bounty order with scarce coins), R10.5,
  R11.2, R12.2f, R12.4, R17.3, R17.5, R17.11.
- **Mutation check.** I broke the engine on purpose in 10 places (Winter Yield, bounty order,
  plunder size, covered cards counting, seller order, buy limit, missing glean, market price,
  bank price, final tier check): all but one equivalent mutant were caught by these tests.

**Watch: D8 (on `agent/design`, not on main).** It changes the Market price to 1, 3, 4, 5 and the
bank to 6 (R6.3, R6.6c), and R17.9 so a purchase is filled from the seller's store _after its own
Build is paid and including its step-1 Spend gains_. These tests hard-code the current numbers
(`PRICE`, bank 5) and the current fill rule (R6.7 "seller short" tests); when the engine adopts
D8 they must change in the same commit, and a seller whose Spend produces the wanted good needs a
new test. Also: E3 renamed the log events (`sale`/`saleShort` are now one `trade` event with
`filled`); the audit reads `trade`.

**R14 and R2.4/R2.5 (landed in engine PR #27 / E2)** are now tested: 2 seats deal 10 cards
from the 4-seat deck, a Burn is required on turns 1-4 and forbidden on the fifth (hands 10, 8, 6,
4, 2, then the glean), a burned card has no effect and the other town sees only that a card was
burned, the only neighbour counts once (buy limit, Toll, bounty); each town is offered 2 different
Great Works, can choose only its own offers, may change until the last choice, and the choices are
revealed together with the unchosen offers never visible in any view. The property games now run
at 2 to 7 seats. Extra mutants checked (Burn unmasked, Burn on the last turn, wrong timeout
choice): all caught.

## Checked and fine (tests pass, keep them green)

Engine (`src/engine/core/engine.audit.test.ts`):

- Views never carry the seed or rng words; hidden ids (other hands, stashes, deck, box, discard)
  never appear in a view; other seats' prompt data is null.
- 25 malformed actions (wrong types, NaN/Infinity, `__proto__` as type, missing fields) are
  rejected, not thrown; 300 mutated legal actions never throw or mutate the input state.
- Same seed + same actions give byte-identical state; seat submit order within a turn does not
  matter; unpick/re-pick gives the same result; a JSON-resumed state plays on identically.

Net (`src/net/session.audit.test.ts`):

- A seat's pick is on no other connection's wire (incl. spectators) before the reveal; a
  reconnecting client gets only its own pick back; a wrong token gets no seat.
- Spectators cannot submit/withdraw; a seat cannot submit another seat's card; stale, future and
  post-game submits are refused; a second submit replaces the first (matches MULTIPLAYER.md §
  "a seat may change its pick"); submit floods are rate limited.
- An idle player cannot hold the round past the clock; toggling submit/withdraw does not extend
  it; with no timer the host can unblock by `kick`.
- Same picks in any arrival order give the same state; a snapshot restored mid-round continues
  to the same state.

## Watch list (not testable yet)

- **Round guard vs turns.** `submit.round` is `engine.round(state)`. The real engine has several
  picks per round (`turn`); if the adapter maps `round` to `DraftState.round`, a late submit for
  turn _t_ is not caught by `stale_round` and is only rejected if the card id is no longer legal.
  Card ids are unique so this should hold, but the adapter should expose `seq` or `round*100+turn`.
- **Windamere ruleset `maskSeat` / `maskTable`.** `viewFor` passes `seat.data` and `table`
  through unchanged when the ruleset defines no mask. The first ruleset with hidden per-seat
  data (coins, hand-adjacent state) must define `maskSeat`; Q1 should add a leak test with the
  real ruleset.
- **Non-string frames skip `LIMITS.messageChars`** (`session.ts:365-368`). Fine if the adapter
  only forwards text frames; untested.
- **`buckets` map is never pruned** (`session.ts:134`); with unlimited fresh members from N1 it
  grows without bound. Fixed by N1.
- **Viewed state aliasing.** `viewFor` shares unchanged parts with the state (documented). A hotseat UI
  that mutates a view would mutate the game. Not an issue over the wire.
