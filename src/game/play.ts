/**
 * The offline play screen: a LocalGame (rules, bots, clock) drawn by a DraftTable. Turns the
 * setup screen's NewGameConfig into an engine GameConfig, forwards the table's intents to the
 * game and re-renders on every change; the timer ring ticks between renders.
 */
import { pickFor, type BotLevel as BotStrength } from '../bots';
import type { DraftAction, DraftEngine, DraftState, GameConfig, Json, SeatId } from '../engine';
import { motionOn, showToast, type NewGameConfig } from '../ui';
import type { RevealHook } from './fx';
import { clockScale, type BotLevel } from '../ui/setup/model';
import { tableModel, type SeatLook } from '../ui/table/model';
import type { Presenter } from '../ui/table/present';
import { DraftTable } from '../ui/table/table';
import { LocalGame } from './local';

/** A ruleset plus how to draw it: what boot needs to start a game. */
export interface GameBinding<S, T> {
  engine: DraftEngine<S, T>;
  present: Presenter<S, T>;
  /** Ruleset options for every new game. */
  options?: Record<string, Json>;
  /** The ruleset's reveal animation and sound (fx lane, via src/game/fx.ts). */
  fx?: RevealHook<S, T>;
  /**
   * R15.3 turn clock: seconds for the decision a state waits on at clock `scale` (Normal = 1),
   * and the setup screen's words for a scale. Absent: a flat 45 s × scale.
   */
  clock?: {
    seconds(state: DraftState<S, T>, scale: number): number;
    hint(scale: number): string;
  };
}

/** Without a game-specific clock: Normal is a flat 45 s per decision. */
export const FLAT_CLOCK_SEC = 45;

export interface PlayHooks<S = unknown, T = unknown> {
  botDelayMs: () => number;
  onNewGame(): void;
  onRematch(): void;
  /** Hotseat pass covers between humans (default on; the playtest harness turns them off). */
  covers?: boolean;
  /** A reveal hook overriding the binding's (tests); see src/game/fx.ts. */
  fx?: RevealHook<S, T>;
}

export interface PlayHandle<S, T> {
  element: HTMLElement;
  game: LocalGame<S, T>;
  table: DraftTable;
  /** The table left the screen (setup opened over it): stop the clock. */
  hide(): void;
  /** Back on screen: the clock runs again unless a pass cover is up. */
  show(): void;
  dispose(): void;
}

/** Setup screen bot levels → the bots lane's levels (only 'easy' plays differently today). */
const BOT_LEVEL: Record<BotLevel, BotStrength> = { easy: 'easy', normal: 'medium', hard: 'hard' };

/** Timer ring refresh between renders, ms. */
export const TICK_MS = 250;

/** 128 random bits as hex (offline seeds; online the server draws them). */
export function randomSeed(): string {
  const words = crypto.getRandomValues(new Uint32Array(4));
  return [...words].map((w) => w.toString(16).padStart(8, '0')).join('');
}

export function gameConfig(cfg: NewGameConfig, options?: Record<string, Json>): GameConfig {
  return {
    seed: cfg.seed ?? randomSeed(),
    seats: cfg.players.map((p) => ({ name: p.name })),
    ...(options ? { options } : {}),
  };
}

/** Start a game, or return why the engine refused the setup. */
export function playLocal<S, T>(
  binding: GameBinding<S, T>,
  cfg: NewGameConfig,
  hooks: PlayHooks<S, T>,
): PlayHandle<S, T> | string {
  const { engine, present } = binding;
  const config = gameConfig(cfg, binding.options);
  const err = engine.validateConfig(config);
  if (err) return `Can't start: ${err}`;

  const looks: SeatLook[] = cfg.players.map((p) => ({
    color: p.color,
    bot: p.controller === 'bot',
  }));
  const bots = cfg.players.flatMap((p, i) => (p.controller === 'bot' ? [i] : []));
  const botSalt = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  let locked = false;
  /** The reveal (fx lane): a caller's hook wins over the ruleset's own. */
  const fx = hooks.fx ?? binding.fx;
  /** The last action handed to the fx hook (null until the first render). */
  let fxKey: string | null = null;

  const send = (make: (seat: SeatId) => DraftAction) => {
    const seat = game.viewer;
    if (seat === null) return;
    const error = game.act(make(seat));
    if (error) showToast(error, 'error');
  };

  const table = new DraftTable({
    pick: (pick) => send((seat) => ({ type: 'pick', seat, pick })),
    unpick: () => send((seat) => ({ type: 'unpick', seat })),
    answer: (prompt, answer) => send((seat) => ({ type: 'answer', seat, prompt, answer })),
    newGame: () => hooks.onNewGame(),
    rematch: () => hooks.onRematch(),
    skip: () => fx?.skip?.(),
    reveal: () => {
      shownTo = game.viewer;
      syncCover(game);
    },
  });

  /**
   * Hotseat (UX.md §9): with 2+ humans the hand on screen belongs to `shownTo`. When the game
   * moves on to another human, a pass cover goes up and their clock waits until they say so.
   */
  let shownTo: SeatId | null = null;
  const syncCover = (g: LocalGame<S, T>) => {
    const covers = hooks.covers ?? true;
    const next = covers && g.humans.length > 1 && !g.over && g.viewer !== shownTo ? g.viewer : null;
    if (next === null) {
      g.resume();
      table.setCover(null);
    } else {
      g.pause();
      table.setCover({
        name: g.state.seats[next]?.name ?? 'the next player',
        color: looks[next]?.color ?? '',
      });
    }
  };

  const tick = () => {
    const c = game.clock();
    table.setTimer(c && { ...c, locked });
  };

  const game: LocalGame<S, T> = new LocalGame({
    engine,
    config,
    bots,
    clockSec: (state) => {
      const scale = clockScale(cfg.clock);
      if (scale <= 0) return null;
      return binding.clock?.seconds(state, scale) ?? Math.ceil(FLAT_CLOCK_SEC * scale);
    },
    botDelayMs: hooks.botDelayMs,
    // Each bot decides from its own view only (bots lane, docs/BOTS.md).
    botAction: (state, seat) =>
      pickFor(engine, engine.viewFor(state, seat), seat, {
        level: BOT_LEVEL[cfg.players[seat]?.botLevel ?? 'normal'],
        salt: botSalt,
      }),
    onChange: (g) => {
      const view = g.view();
      const viewer = view.view.viewer;
      locked = viewer !== null && view.view.submitted[viewer] === true;
      // Cover first, so the next human's hand is never rendered before the cover is up.
      syncCover(g);
      const model = tableModel({ view, engine, present, looks });
      table.update(model);
      // The fx lane animates each new action once the table shows it (never the first render).
      if (fxKey !== null && model.actionKey !== fxKey && !table.covered) {
        fx?.onAction({
          key: model.actionKey,
          view,
          model,
          anchors: table.anchors,
          reducedMotion: !motionOn(),
        });
      }
      fxKey = model.actionKey;
      tick();
    },
    onTimeout: (seat, action) => {
      const who = game.humans.length > 1 ? (game.state.seats[seat]?.name ?? 'you') : 'you';
      if (action.type === 'pick') {
        const card = game.state.seats[seat]?.hand.find((c) => c.id === action.pick.card);
        const name = card ? present.card(card.def).name : 'a card';
        showToast(`Time's up: we picked ${name} for ${who}`);
      } else {
        showToast(`Time's up: we answered for ${who}`);
      }
    },
  });

  const ticker = setInterval(tick, TICK_MS);
  game.start();
  return {
    element: table.element,
    game,
    table,
    hide: () => game.pause(),
    show: () => syncCover(game),
    dispose: () => {
      clearInterval(ticker);
      game.dispose();
      fx?.dispose?.();
      table.destroy();
    },
  };
}
