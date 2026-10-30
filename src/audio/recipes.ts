/**
 * The game's sounds, all synthesized (no files). Short, soft, wooden and bell-like, so they sit
 * under the table instead of on top of it. Ids are what `cues.ts` maps events to.
 */
import type { SoundRecipe } from './types';
import { NOTE as N, bell, horn, knock, noise, pluck, swish, thud, tick, ting } from './voices';

export type BaseSoundId =
  | 'pick'
  | 'reveal'
  | 'spend'
  | 'build'
  | 'coin'
  | 'raidHold'
  | 'raidHit'
  | 'tier'
  | 'yourTurn'
  | 'season'
  | 'scoreTick'
  | 'gameEnd';

export const BASE_SOUNDS: Readonly<Record<BaseSoundId, SoundRecipe>> = {
  pick: {
    label: 'Pick a card',
    vary: 40,
    voices: [tick(2600, 0, { gain: 0.35 }), knock(520, 0.01, { gain: 0.22, dur: 0.08 })],
  },
  reveal: {
    label: 'Cards turn face up',
    vary: 30,
    voices: [
      swish(1200, 3600, 0, 0.14, { gain: 0.5 }),
      tick(3200, 0.13, { gain: 0.3 }),
      pluck(N.D5, 0.14, { gain: 0.16, dur: 0.3 }),
    ],
  },
  spend: {
    label: 'Card spent for goods',
    vary: 40,
    voices: [swish(2200, 900, 0, 0.1, { gain: 0.4 }), pluck(N.G4, 0.08, { gain: 0.22, dur: 0.3 })],
  },
  build: {
    label: 'Build lands in town',
    vary: 25,
    voices: [
      knock(240, 0, { gain: 0.6, dur: 0.14 }),
      tick(1500, 0, { gain: 0.28 }),
      knock(300, 0.08, { gain: 0.35 }),
      bell(N.E5, 0.13, { gain: 0.12, dur: 0.7 }),
    ],
  },
  coin: {
    label: 'Coins change hands',
    vary: 30,
    voices: [
      ting(2093, 0, { gain: 0.22 }),
      ting(2637, 0.07, { gain: 0.19 }),
      tick(5000, 0, { gain: 0.15 }),
    ],
  },
  raidHold: {
    label: 'Raid held',
    voices: [
      thud(0, { freq: 140, to: 80, gain: 0.45 }),
      knock(900, 0.02, { gain: 0.3, dur: 0.07 }),
      bell(N.C5, 0.1, { gain: 0.2, dur: 0.9 }),
      bell(N.G5, 0.18, { gain: 0.14, dur: 0.9 }),
    ],
  },
  raidHit: {
    label: 'Raid plunders the town',
    voices: [
      thud(0, { freq: 120, to: 50, glide: 0.3, dur: 0.45, gain: 0.7 }),
      noise(0, 0.35, { attack: 0.01, gain: 0.3, filter: { type: 'lowpass', freq: 350 } }),
      horn(110, 0.05, 0.6, { to: 98, gain: 0.12, filter: { type: 'lowpass', freq: 500 } }),
    ],
  },
  tier: {
    label: 'Great Work tier complete',
    voices: [
      pluck(N.C5, 0),
      pluck(N.E5, 0.08),
      pluck(N.G5, 0.16),
      bell(N.C6, 0.24, { gain: 0.18, dur: 0.9 }),
    ],
  },
  yourTurn: {
    label: 'Your turn',
    voices: [
      bell(N.G5, 0, { gain: 0.3 }),
      bell(N.C6, 0.13, { gain: 0.34, dur: 1.4 }),
      { kind: 'tone', wave: 'sine', freq: N.C5, at: 0.13, dur: 0.9, attack: 0.05, gain: 0.1 },
    ],
  },
  season: {
    label: 'Season changes',
    voices: [
      thud(0, { freq: 130, to: 70, dur: 0.5, gain: 0.4 }),
      bell(N.G4, 0.02, { gain: 0.26, dur: 1.6 }),
      bell(N.D5, 0.2, { gain: 0.2, dur: 1.4 }),
      swish(500, 2200, 0, 0.5, { gain: 0.25 }),
    ],
  },
  scoreTick: {
    label: 'Score counts up',
    vary: 120,
    voices: [ting(N.A5, 0, { gain: 0.1, dur: 0.12 }), tick(4200, 0, { gain: 0.1 })],
  },
  gameEnd: {
    label: 'Game over fanfare',
    voices: [
      horn(N.G4, 0, 0.16, { gain: 0.18 }),
      horn(N.G4, 0.17, 0.16, { gain: 0.18 }),
      horn(N.G4, 0.34, 0.16, { gain: 0.18 }),
      horn(N.C5, 0.52, 1.6, { gain: 0.2, hold: 0.6 }),
      horn(N.E5, 0.52, 1.6, { gain: 0.11, hold: 0.6 }),
      horn(N.G5, 0.52, 1.6, { gain: 0.09, hold: 0.6 }),
      thud(0.52, { freq: 110, to: 60, dur: 0.5, gain: 0.5 }),
      bell(N.C6, 0.55, { gain: 0.12 }),
      bell(N.E6, 0.65, { gain: 0.1 }),
      bell(N.G6, 0.75, { gain: 0.08, dur: 1.4 }),
    ],
  },
};
