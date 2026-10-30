// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BASE_SOUNDS, SoundEngine } from '../../audio';
import { mountAudition, wantsAudition } from './audition';

describe('audition panel', () => {
  it('?sfx=1 turns it on', () => {
    expect(wantsAudition('?sfx=1')).toBe(true);
    expect(wantsAudition('')).toBe(false);
  });

  it('lists every recipe, binds mute and volume, and removes itself', () => {
    const engine = new SoundEngine({ storage: null, createContext: () => null });
    const host = document.createElement('div');
    const off = mountAudition(host, engine);
    expect(host.querySelectorAll('button')).toHaveLength(Object.keys(BASE_SOUNDS).length);
    const [vol, mute] = host.querySelectorAll('input');
    mute!.checked = true;
    mute!.dispatchEvent(new Event('change'));
    vol!.value = '0.25';
    vol!.dispatchEvent(new Event('input'));
    expect(engine.settings).toEqual({ volume: 0.25, muted: true });
    off();
    expect(host.children).toHaveLength(0);
  });
});
