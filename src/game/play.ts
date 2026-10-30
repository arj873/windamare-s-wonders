/**
 * The offline play screen: a LocalGame (rules, bots, clock) drawn by a DraftTable. Turns the
 * setup screen's NewGameConfig into an engine GameConfig, forwards the table's intents to the
 * game and re-renders on every change; the timer ring ticks between renders.
 */
import { pickFor, type BotLevel as BotStrength } from '../bots';
import type { DraftAction, DraftEngine, GameConfig, Json, SeatId } from '../engine';
import { showToast, type NewGameConfig } from '../ui';
import type { BotLevel } from '../ui/setup/model';
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
}

export interface PlayHooks {
  botDelayMs: () => number;
  onNewGame(): void;
  onRematch(): void;
}

export interface PlayHandle<S, T> {
  element: HTMLElement;
  game: LocalGame<S, T>;
  table: DraftTable;
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
  hooks: PlayHooks,
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
  });

  const tick = () => {
    const c = game.clock();
    table.setTimer(c && { ...c, locked });
  };

  const game: LocalGame<S, T> = new LocalGame({
    engine,
    config,
    bots,
    pickTimerSec: cfg.pickTimerSec,
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
      table.update(tableModel({ view, engine, present, looks }));
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
    dispose: () => {
      clearInterval(ticker);
      game.dispose();
      table.destroy();
    },
  };
}
