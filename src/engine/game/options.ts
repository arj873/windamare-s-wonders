/**
 * Game options (`GameConfig.options`, checked by `validateConfig`). Windamere has one: R19, the
 * First game, `{ firstGame: true }`, off by default. It replaces two R16 numbers and turns
 * upgrades off (`WwRules.firstGame`); everything else plays as usual (R19.6).
 */
import type { GameConfig, Json } from '../core';
import type { WwRules } from './content';

/** The option key: `createGame({ seed, seats, options: { firstGame: true } })`. */
export const FIRST_GAME_OPTION = 'firstGame';

const OPTIONS = [FIRST_GAME_OPTION];

/** Unknown keys are refused, so a misspelt option never silently plays the full game. */
export function validateOptions(options: Record<string, Json>): string | null {
  for (const [key, value] of Object.entries(options)) {
    if (!OPTIONS.includes(key)) return `unknown option ${key} (options: ${OPTIONS.join(', ')})`;
    if (typeof value !== 'boolean') return `option ${key} must be true or false`;
  }
  return null;
}

type Configured = { readonly config: GameConfig };

/** R19.1: this game is a First game. */
export const isFirstGame = (state: Configured): boolean =>
  state.config.options?.[FIRST_GAME_OPTION] === true;

/** R2.3, R19.2: Honours dealt at setup. */
export const honoursPerGame = (rules: WwRules, state: Configured): number =>
  isFirstGame(state) ? rules.firstGame.honoursPerGame : rules.tunables.honoursPerGame;

/** R2.4, R19.4: Great Works dealt to each town. */
export const greatWorksOffered = (rules: WwRules, state: Configured): number =>
  isFirstGame(state) ? rules.firstGame.greatWorksOffered : rules.tunables.greatWorksOffered;

/** R7.9, R19.3: an upgrade may cover a card. */
export const upgradesAllowed = (rules: WwRules, state: Configured): boolean =>
  !isFirstGame(state) || rules.firstGame.upgrades;
