import { describe, expect, it } from 'vitest';
import { windamereClock } from '../game/windamere/clock';
import { clockMs, TIMER_PRESETS } from '../net/protocol';

// R6 #9 / N4: the server clock and hotseat's must be the same numbers.
describe('server clock matches the hotseat clock', () => {
  const scale = { relaxed: 1.5, normal: 1, fast: 0.5 } as const;
  for (const preset of TIMER_PRESETS.filter((p) => p !== 'off')) {
    it(preset, () => {
      for (let turn = 0; turn < 6; turn++) {
        const state = { phase: { kind: 'pick' }, turn } as never;
        expect(clockMs(preset, 'pick', turn)).toBe(
          windamereClock.seconds(state, scale[preset]) * 1000,
        );
      }
      const prompt = { phase: { kind: 'prompt' }, turn: 0 } as never;
      expect(clockMs(preset, 'prompt', 0)).toBe(
        windamereClock.seconds(prompt, scale[preset]) * 1000,
      );
    });
  }
});

describe('server session options', () => {
  it('give the Season card time to the first pick; env vars override the rest', async () => {
    const { sessionOptionsFrom } = await import('./room');
    expect(sessionOptionsFrom({})).toEqual({ openingBonusMs: 8_400 });
    expect(sessionOptionsFrom({ BOT_DELAY_MS: '40' })).toMatchObject({ botDelayMs: 40 });
  });
});
