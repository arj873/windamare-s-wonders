# Audit log (qa lane)

Every finding has a failing test marked `it.fails` in a `*.audit.test.ts` file next to the code.
The owning lane removes the marker in the commit that fixes it. Severity: **high** = breaks
hidden information or locks players out; **medium** = a player or host can stall or wedge a room;
**low** = needs a hostile or buggy client, limited damage.

## Q0 — engine core and net session at main 7f5704f

Tested: `src/engine/core/*` through the toy ruleset, `src/net/session.ts` through `toyEngine`.
Not tested (not on main yet): the Windamere ruleset, the Durable Object adapter, `src/server`,
any real token/seed generator.

| ID    | Sev    | Owner  | Where                                                                              | Finding                                                                                                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                                 |
| ----- | ------ | ------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q0-N1 | medium | net    | `src/net/session.ts:386` (hello is handled before the rate limiter) and `:510-523` | `hello` is not rate limited and a socket's own throwaway members are never evictable (they count as connected). One socket sending 42 `hello`s with `token:null` fills `LIMITS.members` (32); every real joiner gets `room_full`. Each hello also broadcasts room + game to all.                                                                                           | Rate limit `hello` per connection (bucket keyed by conn id). One member per connection: a second `hello` on a bound connection must reuse the member or be refused. |
| Q0-N2 | medium | net    | `src/net/session.ts:531`, `:618-630`                                               | A second `hello` on one socket binds it to a new member but the first member keeps `conn` = that socket. `detach` only finds the newest member, so the older one stays "connected" forever: never goes away, never becomes a bot, room never idles out, and with `roundTimerSec: null` its seat stalls the table.                                                          | Same fix as N1; also `detach` should clear every member whose `conn` matches.                                                                                       |
| Q0-N3 | medium | net    | `src/net/session.ts:162` (`host` is set once)                                      | No host succession. If the host leaves for good the room can never `start` or `rematch`, and `configure`/`kick` are dead, while other members stay connected. `docs/MULTIPLAYER.md:28` lists "host + succession" as part of the session shell; it is not implemented.                                                                                                      | When the host is away past the grace period, hand `host` to the longest-connected seated human.                                                                     |
| Q0-N4 | low    | net    | `src/net/session.ts:659` (also `botPick`, `resolveRound` in `work`)                | Engine exceptions escape `receive`/`tick`. Seat range is `SEAT_RANGE` 2..8 (`protocol.ts:42`, a guess) but the ruleset decides; if the engine takes fewer seats, the host's `start` throws out of the session instead of an `error` frame, and the transport sees an exception. State is not corrupted (the throw is before `phase` changes).                              | Catch around `engine.create`, reply `bad_config`; clamp `SEAT_RANGE` to the ruleset's `minSeats`/`maxSeats` when the adapter lands.                                 |
| Q0-E1 | low    | engine | `src/engine/core/clone.ts:8`                                                       | `cloneJson` copies with `out[k] = ...`. A JSON `"__proto__"` key (valid via `JSON.parse`, passes `isJson`) sets the clone's prototype instead of an own key. A pick's `args` then has inherited properties in memory that vanish after a JSON round trip, so a live state and its restored copy can diverge. No global pollution (the prototype is only set on the clone). | Use `Object.defineProperty` or build with `Object.create(null)`/a `Map`; or make `isJson` reject `__proto__` keys.                                                  |

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
- **Non-string frames skip `LIMITS.messageChars`** (`session.ts:370-375`). Fine if the adapter
  only forwards text frames; untested.
- **`buckets` map is never pruned** (`session.ts:136`); with unlimited fresh members from N1 it
  grows without bound. Fixed by N1.
- **Viewed state aliasing.** `viewFor` shares unchanged parts with the state (documented). A hotseat UI
  that mutates a view would mutate the game. Not an issue over the wire.
