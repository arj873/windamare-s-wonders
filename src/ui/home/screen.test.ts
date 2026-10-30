// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeScreen, parseRoomCode } from './screen';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

afterEach(() => document.body.replaceChildren());

describe('HomeScreen', () => {
  it('remembers the nickname and plays with it (button or Enter)', () => {
    const storage = memory();
    const onPlay = vi.fn();
    const home = new HomeScreen({ onPlay, storage });
    document.body.append(home.element);
    const nick = home.element.querySelector<HTMLInputElement>('[data-k="nickname"]')!;
    nick.value = '  Ana  ';
    home.element.querySelector<HTMLButtonElement>('[data-k="play"]')!.click();
    expect(onPlay).toHaveBeenCalledWith('Ana');
    expect(storage.getItem('ww.name')).toBe('Ana');
    nick.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onPlay).toHaveBeenCalledTimes(2);
    expect(new HomeScreen({ onPlay, storage }).name()).toBe('Ana');
  });

  it('shows online buttons only with handlers, and checks room codes', () => {
    const onJoin = vi.fn();
    const home = new HomeScreen({ onPlay: vi.fn(), onOnline: vi.fn(), onJoin, storage: null });
    const el = home.element;
    expect(el.querySelector('[data-k="online"]')).not.toBeNull();
    const code = el.querySelector<HTMLInputElement>('[data-k="code"]')!;
    code.value = 'no!';
    el.querySelector<HTMLButtonElement>('[data-k="join"]')!.click();
    expect(onJoin).not.toHaveBeenCalled();
    expect(el.querySelector('.hm-error')?.textContent).toMatch(/not a room code/);
    code.value = 'https://ww.example/?room=k7qf';
    el.querySelector<HTMLButtonElement>('[data-k="join"]')!.click();
    expect(onJoin).toHaveBeenCalledWith('K7QF', '');
  });
});

describe('parseRoomCode', () => {
  it('reads a bare code or an invite link', () => {
    expect(parseRoomCode('k7qf')).toBe('K7QF');
    expect(parseRoomCode(' https://x.y/?room=AB12CD ')).toBe('AB12CD');
    expect(parseRoomCode('x')).toBe('');
    expect(parseRoomCode('')).toBe('');
  });
});
