/**
 * Lookahead bench (docs/ENGINE.md §16), on the shipped content. Not a test and not engine code:
 * nothing imports it. Run: `nice -n 19 pnpm exec tsx src/engine/game/lookahead.bench.ts`
 *
 * For each seat count it builds a mid-game state (random legal picks to Summer, turn 3), then
 * times: one turn through applyAction (the baseline), the same turn on a fork, determinize,
 * fork, play-outs to the Season's end and the game's end (default picks), one seat's legal picks
 * (what a bot policy inside a play-out pays) and a level-3-sized decision.
 */
/* eslint-disable no-restricted-properties -- a bench has to read the clock */
import { createLookahead, Rng, type Pick } from '../core';
import { createWindamereEngine } from './engine';
import type { WwState } from './types';

const engine = createWindamereEngine();
const la = createLookahead(engine.ruleset);
const SAMPLES = 8; // determinizations per candidate pick in the decision row

/** Microseconds per call: warm up, then run for at least `ms` milliseconds. */
function time(fn: () => unknown, ms = 400): number {
  for (let i = 0; i < 10; i++) fn();
  let n = 0;
  const start = performance.now();
  let now = start;
  while (now - start < ms) {
    fn();
    n += 1;
    now = performance.now();
  }
  return ((now - start) * 1000) / n;
}

function apply(s: WwState, picks: (Pick | null)[]): WwState {
  let state = s;
  for (const [seat, pick] of picks.entries()) {
    if (!pick) continue;
    const r = engine.applyAction(state, { type: 'pick', seat, pick });
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

function midGame(seats: number, rng: Rng): WwState {
  let s = engine.createGame({
    seed: seats,
    seats: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })),
  });
  while (s.phase.kind === 'prompt') {
    const seat = engine.waitingOn(s)[0] ?? 0;
    const r = engine.applyAction(s, engine.defaultAction(s, seat) ?? { type: 'unpick', seat });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  while (s.round < 1 || s.turn < 2) {
    s = apply(
      s,
      s.seats.map((x) => rng.pick(engine.legalPicks(s, x.id))),
    );
  }
  return s;
}

const fmt = (us: number) => (us >= 1000 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(1)} µs`);

const rows: string[][] = [];
for (const seats of [2, 3, 5, 7]) {
  const rng = new Rng(seats);
  const s = midGame(seats, rng);
  const picks = s.seats.map((x) => rng.pick(engine.legalPicks(s, x.id)));
  const view = engine.viewFor(s, 0);
  const sample = la.determinize(view, new Rng(1));
  const mine = engine.legalPicks(view, 0);
  const others = s.seats.map(() => null);

  const applyUs = time(() => apply(s, picks));
  const turnUs = time(() => la.playTurn(la.fork(s), picks));
  const decision = () => {
    const r = new Rng(7);
    for (const p of mine) {
      for (let k = 0; k < SAMPLES; k++) {
        const d = la.determinize(view, r);
        la.playTurn(
          d,
          others.map((_, i) => (i === 0 ? p : null)),
        );
      }
    }
  };
  rows.push([
    String(seats),
    String(s.log.length),
    fmt(applyUs),
    fmt(turnUs),
    `${(applyUs / turnUs).toFixed(1)}x`,
    fmt(time(() => la.determinize(view, new Rng(3)))),
    fmt(time(() => la.fork(sample))),
    fmt(time(() => la.playOut(la.fork(sample), 'round'))),
    fmt(time(() => la.playOut(la.fork(sample), 'game'), 800)),
    fmt(time(() => engine.legalPicks(sample, 1))),
    fmt(time(() => engine.ruleset.legalPicks(sample, 1))),
    `${fmt(time(decision, 800))} (${mine.length} picks)`,
  ]);
}

const head = [
  'seats',
  'log entries',
  'turn via applyAction',
  'turn via fork+playTurn',
  'speed-up',
  'determinize',
  'fork',
  'play to Season end',
  'play to game end',
  'engine.legalPicks',
  'ruleset.legalPicks',
  `decision: picks x ${SAMPLES} samples`,
];
console.log(`| ${head.join(' | ')} |`);
console.log(`|${head.map(() => '---').join('|')}|`);
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
