/**
 * An offline game on this device (hotseat vs bots): holds the full engine state, plays the bot
 * seats, runs the round clock and picks which human's view is on screen. No DOM; the screen
 * (play.ts) renders `view()` on every `onChange`.
 *
 * Bots move through `botAction` (play.ts passes the bots lane's pickFor); without it, a random
 * legal action. The clock is local: online it is the server's (MULTIPLAYER.md §2.1.1).
 */
import {
  Rng,
  type DraftAction,
  type DraftEngine,
  type DraftState,
  type DraftView,
  type GameConfig,
  type SeatId,
} from '../engine';

export interface LocalGameOptions<S, T> {
  engine: DraftEngine<S, T>;
  config: GameConfig;
  /** Seats the computer plays. Every other seat is a human on this device. */
  bots: readonly SeatId[];
  /** Seconds per pick for human seats; null = no timer. */
  pickTimerSec: number | null;
  /** How long a bot "thinks" before it acts, ms. */
  botDelayMs: () => number;
  /** Seed of the placeholder bots' choices (used without `botAction`). */
  botSeed?: number;
  /** A bot seat's move (the bots lane's pickFor); default: a random legal action. */
  botAction?: (state: DraftState<S, T>, seat: SeatId) => DraftAction | null;
  /** Clock source (tests use fake timers). */
  now?: () => number;
  onChange(game: LocalGame<S, T>): void;
  /** A human ran out of time; `action` (the engine's default) is applied right after. */
  onTimeout?(seat: SeatId, action: DraftAction): void;
}

export interface ClockInfo {
  remainingMs: number;
  totalMs: number;
}

/** Changes when a new decision starts: a new pick turn, or a new open prompt. */
export function decisionKey(state: DraftState<unknown, unknown>): string | null {
  switch (state.phase.kind) {
    case 'pick':
      return `pick:${state.round}:${state.turn}`;
    case 'prompt':
      return `prompt:${state.prompts[0]?.id ?? -1}`;
    case 'gameOver':
      return null;
  }
}

/** Placeholder bot: a random legal action from the bot's own view, never `unpick`. */
export function randomAction<S, T>(
  engine: DraftEngine<S, T>,
  state: DraftState<S, T>,
  seat: SeatId,
  rng: Rng,
): DraftAction | null {
  const view = engine.viewFor(state, seat);
  const options = engine.legalActions(view, seat).filter((a) => a.type !== 'unpick');
  return options[rng.int(options.length)] ?? engine.defaultAction(view, seat);
}

export class LocalGame<S, T> {
  state: DraftState<S, T>;
  /** The human whose view is on screen; null = no humans (a spectator view). */
  viewer: SeatId | null;
  readonly humans: readonly SeatId[];
  private readonly engine: DraftEngine<S, T>;
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly botTimers = new Map<SeatId, ReturnType<typeof setTimeout>>();
  private deadline: { key: string; at: number; totalMs: number } | null = null;
  private clockTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly opts: LocalGameOptions<S, T>) {
    this.engine = opts.engine;
    this.state = opts.engine.createGame(opts.config);
    this.humans = opts.config.seats.map((_, i) => i).filter((i) => !opts.bots.includes(i));
    this.viewer = this.humans[0] ?? null;
    this.rng = new Rng(opts.botSeed ?? 1);
    this.now = opts.now ?? (() => Date.now());
  }

  /** First render, then bots and the clock start. */
  start(): void {
    this.changed();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.botTimers.values()) clearTimeout(t);
    this.botTimers.clear();
    if (this.clockTimer !== null) clearTimeout(this.clockTimer);
    this.clockTimer = null;
  }

  view(): DraftView<S, T> {
    return this.engine.viewFor(this.state, this.viewer ?? 'spectator');
  }

  get over(): boolean {
    return this.state.phase.kind === 'gameOver';
  }

  /** A human's action. Returns the engine's error, or null when it was applied. */
  act(action: DraftAction): string | null {
    if (this.opts.bots.includes(action.seat)) return 'that seat is played by a bot';
    return this.apply(action);
  }

  /** The current decision's clock, or null (no timer, or nothing for a human to decide). */
  clock(): ClockInfo | null {
    const d = this.deadline;
    return d ? { remainingMs: Math.max(0, d.at - this.now()), totalMs: d.totalMs } : null;
  }

  private apply(action: DraftAction): string | null {
    if (this.disposed) return 'game closed';
    const r = this.engine.applyAction(this.state, action);
    if (!r.ok) return r.error;
    this.state = r.state;
    this.changed();
    return null;
  }

  private changed(): void {
    if (this.disposed) return;
    const waiting = this.engine.waitingOn(this.state);
    this.chooseViewer(waiting);
    this.armClock(waiting);
    this.scheduleBots(waiting);
    this.opts.onChange(this);
  }

  /** Hotseat: stay on the current human while they still have to act, else the next one. */
  private chooseViewer(waiting: readonly SeatId[]): void {
    if (this.viewer !== null && waiting.includes(this.viewer)) return;
    const next = this.humans.find((s) => waiting.includes(s));
    if (next !== undefined) this.viewer = next;
  }

  /** One clock per decision for every human in it; on expiry the engine's default plays. */
  private armClock(waiting: readonly SeatId[]): void {
    const sec = this.opts.pickTimerSec;
    const key = decisionKey(this.state);
    if (sec === null || key === null) return this.stopClock();
    if (this.deadline?.key === key) return;
    if (!this.humans.some((s) => waiting.includes(s))) return this.stopClock();
    this.stopClock();
    const totalMs = sec * 1000;
    this.deadline = { key, at: this.now() + totalMs, totalMs };
    this.clockTimer = setTimeout(() => this.expire(key), totalMs);
  }

  private stopClock(): void {
    if (this.clockTimer !== null) clearTimeout(this.clockTimer);
    this.clockTimer = null;
    this.deadline = null;
  }

  private expire(key: string): void {
    this.clockTimer = null;
    if (this.disposed || decisionKey(this.state) !== key) return;
    for (const seat of this.humans) {
      if (decisionKey(this.state) !== key) break;
      if (!this.engine.waitingOn(this.state).includes(seat)) continue;
      const action = this.engine.defaultAction(this.state, seat);
      if (!action) continue;
      this.opts.onTimeout?.(seat, action);
      this.apply(action);
    }
  }

  private scheduleBots(waiting: readonly SeatId[]): void {
    for (const [seat, t] of this.botTimers) {
      if (!waiting.includes(seat)) {
        clearTimeout(t);
        this.botTimers.delete(seat);
      }
    }
    for (const seat of this.opts.bots) {
      if (!waiting.includes(seat) || this.botTimers.has(seat)) continue;
      const t = setTimeout(() => {
        this.botTimers.delete(seat);
        if (this.disposed || !this.engine.waitingOn(this.state).includes(seat)) return;
        const action =
          this.opts.botAction?.(this.state, seat) ??
          randomAction(this.engine, this.state, seat, this.rng);
        if (action) this.apply(action);
      }, this.opts.botDelayMs());
      this.botTimers.set(seat, t);
    }
  }
}
