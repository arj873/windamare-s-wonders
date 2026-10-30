/**
 * The tutorial game: a normal hotseat game with R19 "First game" on (no Honours, no upgrades,
 * one dealt Great Work, revealed at the start), you at seat 0 and 3 Easy bots. Nothing is rigged.
 * The seed was picked by headless search (seeds.test.ts, `SEEDS=30 pnpm exec vitest run
 * src/ui/tutorial/seeds`): a stand-in learner (Normal bot) sees every lesson, with no recap.
 */
import { FIRST_GAME_OPTION, type Json } from '../../engine';
import type { NewGameConfig } from '../setup/model';

export const TUTORIAL_SEED = 'learn-5';
export const TUTORIAL_ME = 0;

export const TUTORIAL_OPTIONS: Record<string, Json> = { [FIRST_GAME_OPTION]: true };
/** Bot moves are at least this slow while the coach is on (ms per move). */
export const TUTORIAL_PACE_MS = 900;

const COLORS = ['#c1272d', '#1f4fa0', '#2f8f4e', '#d9a21b'];

/** The setup the "Learn to play" button starts (clock off; pass the options to the binding). */
export function tutorialConfig(): NewGameConfig {
  return {
    mode: 'standard',
    clock: 'off',
    seed: TUTORIAL_SEED,
    players: [
      { name: 'You', color: COLORS[0] ?? '', controller: 'human' },
      ...[1, 2, 3].map((i) => ({
        name: `Bot ${i}`,
        color: COLORS[i] ?? '',
        controller: 'bot' as const,
        botLevel: 'easy' as const,
      })),
    ],
  };
}
