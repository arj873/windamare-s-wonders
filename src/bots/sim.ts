/**
 * Headless bot-vs-bot simulator (library half; the CLI is scripts/sim.ts).
 *
 * Each decision, the runner hands the bot `engine.viewFor(state, seat)` and nothing else, applies
 * the returned action and records any rejection. A game ends at gameOver, on a violation
 * (crash, illegal action, bot with no move) or at `maxActions`.
 */
import type { DraftAction, DraftEngine, DraftState, GameConfig, SeatId } from '../engine';
import { Rng } from '../engine';
import type { Bot } from './types';

export type ViolationKind = 'crash' | 'illegal' | 'noMove' | 'stall';

export interface Violation {
  kind: ViolationKind;
  seat: SeatId | null;
  message: string;
  action?: DraftAction;
}

export interface GameReport {
  seed: number;
  seats: number;
  finished: boolean;
  actions: number;
  rounds: number;
  /** Total per seat, empty if the game did not finish. */
  totals: number[];
  winners: SeatId[];
  /** The bot's name at each seat. */
  botNames: string[];
  /** Samples from `RunOptions.observe`, by metric name. */
  metrics: Record<string, number[]>;
  violation: Violation | null;
}

export interface RunOptions<S, T> {
  engine: DraftEngine<S, T>;
  /** One bot per seat, or a single bot used by every seat. */
  bots: Bot<S, T> | Bot<S, T>[];
  seats: number;
  seed: number;
  options?: GameConfig['options'];
  maxActions?: number;
  /** Called with the final state of a finished game: samples to collect (per town, per game ...). */
  observe?: (state: DraftState<S, T>) => Record<string, number[]>;
}

const botFor = <S, T>(bots: Bot<S, T> | Bot<S, T>[], seat: SeatId): Bot<S, T> => {
  if (!Array.isArray(bots)) return bots;
  const b = bots[seat];
  if (!b) throw new Error(`no bot for seat ${seat}`);
  return b;
};

/** Play one game to the end. Never throws: problems become `violation`. */
export function runGame<S, T>(opts: RunOptions<S, T>): GameReport {
  const { engine, bots, seats, seed } = opts;
  const maxActions = opts.maxActions ?? 5000;
  const report: GameReport = {
    seed,
    seats,
    finished: false,
    actions: 0,
    rounds: 0,
    totals: [],
    winners: [],
    botNames: Array.from({ length: seats }, (_, i) => botFor(bots, i).name),
    metrics: {},
    violation: null,
  };
  const fail = (v: Violation): GameReport => ((report.violation = v), report);
  const rngs = Array.from({ length: seats }, (_, s) => new Rng((seed * 7919 + s + 1) >>> 0 || 1));

  try {
    const config: GameConfig = {
      seed,
      seats: Array.from({ length: seats }, (_, i) => ({ name: `Bot${i}` })),
      ...(opts.options ? { options: opts.options } : {}),
    };
    let state = engine.createGame(config);
    while (state.phase.kind !== 'gameOver') {
      if (report.actions >= maxActions) {
        return fail({
          kind: 'stall',
          seat: null,
          message: `no game over after ${maxActions} actions`,
        });
      }
      const waiting = engine.waitingOn(state);
      if (waiting.length === 0) {
        return fail({ kind: 'stall', seat: null, message: 'nobody is waited on before game over' });
      }
      // Every seat decides from its own view of the SAME state; picks are simultaneous.
      for (const seat of waiting) {
        const rng = rngs[seat];
        if (!rng) throw new Error(`no rng for seat ${seat}`);
        const view = engine.viewFor(state, seat);
        const action = botFor(bots, seat).act({ engine, view, seat, rng });
        if (!action) {
          return fail({
            kind: 'noMove',
            seat,
            message: `bot has no action in phase ${state.phase.kind}`,
          });
        }
        const r = engine.applyAction(state, action);
        if (!r.ok) return fail({ kind: 'illegal', seat, message: r.error, action });
        state = r.state;
        report.actions++;
        // A prompt asks one seat at a time: re-ask the engine who is waited on.
        if (state.phase.kind !== 'pick') break;
      }
    }
    report.finished = true;
    report.rounds = state.round + 1;
    const result = state.result;
    if (result) {
      report.totals = state.seats.map(
        (s) => result.scores.find((x) => x.seat === s.id)?.total ?? 0,
      );
      report.winners = [...result.winners];
    }
    if (opts.observe) report.metrics = opts.observe(state);
  } catch (e) {
    return fail({ kind: 'crash', seat: null, message: e instanceof Error ? e.message : String(e) });
  }
  return report;
}

export interface SimSummary {
  games: number;
  seats: number;
  finished: number;
  violations: { seed: number; violation: Violation }[];
  actions: { mean: number; min: number; max: number };
  /** max total - min total per finished game. */
  spread: { mean: number; max: number };
  /** Mean score per seat. */
  meanScore: number[];
  /** Fraction of finished games each seat won (ties split). */
  winRate: number[];
  /** Per bot name: wins per seat it held (fair share = 1 / seats). Seats rotate in runSim. */
  winByBot: Record<string, number>;
  /** Every `observe` sample of finished games, concatenated per metric name. */
  metrics: Record<string, number[]>;
}

export function summarize(reports: GameReport[], seats: number): SimSummary {
  const done = reports.filter((r) => r.finished);
  const acts = done.map((r) => r.actions);
  const spreads = done.map((r) => Math.max(...r.totals) - Math.min(...r.totals));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const wins = Array.from({ length: seats }, () => 0);
  for (const r of done) for (const w of r.winners) wins[w] = (wins[w] ?? 0) + 1 / r.winners.length;
  const botWins: Record<string, number> = {};
  const botSeats: Record<string, number> = {};
  for (const r of done) {
    for (const n of r.botNames) botSeats[n] = (botSeats[n] ?? 0) + 1;
    for (const w of r.winners) {
      const n = r.botNames[w] ?? '?';
      botWins[n] = (botWins[n] ?? 0) + 1 / r.winners.length;
    }
  }
  const winByBot: Record<string, number> = {};
  for (const [n, seatsHeld] of Object.entries(botSeats)) {
    winByBot[n] = (botWins[n] ?? 0) / seatsHeld;
  }
  const metrics: Record<string, number[]> = {};
  for (const r of done)
    for (const [k, v] of Object.entries(r.metrics)) (metrics[k] ??= []).push(...v);
  return {
    metrics,
    winByBot,
    games: reports.length,
    seats,
    finished: done.length,
    violations: reports.flatMap((r) =>
      r.violation ? [{ seed: r.seed, violation: r.violation }] : [],
    ),
    actions: {
      mean: mean(acts),
      min: acts.length ? Math.min(...acts) : 0,
      max: acts.length ? Math.max(...acts) : 0,
    },
    spread: { mean: mean(spreads), max: spreads.length ? Math.max(...spreads) : 0 },
    meanScore: Array.from({ length: seats }, (_, s) => mean(done.map((r) => r.totals[s] ?? 0))),
    winRate: wins.map((w) => (done.length ? w / done.length : 0)),
  };
}

/**
 * Run `games` seeded games (seeds `seed .. seed + games - 1`). With a bot array, the bots rotate
 * one seat per game so a bot's result is not confounded with its seat.
 */
export function runSim<S, T>(
  base: Omit<RunOptions<S, T>, 'seed'>,
  games: number,
  seed: number,
): { reports: GameReport[]; summary: SimSummary } {
  const reports: GameReport[] = [];
  const { bots } = base;
  for (let i = 0; i < games; i++) {
    const rotated = Array.isArray(bots)
      ? bots.map((_, s) => botFor(bots, (s + i) % bots.length))
      : bots;
    reports.push(runGame({ ...base, bots: rotated, seed: seed + i }));
  }
  return { reports, summary: summarize(reports, base.seats) };
}
