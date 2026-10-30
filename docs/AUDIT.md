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
