// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from './boot';

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('boot', () => {
  it('shows the setup screen and the menu, and hands Start to the caller', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const onStart = vi.fn();
    boot(root, onStart);
    expect(root.querySelector('.setup')).not.toBeNull();
    expect(root.querySelector('.ww-menu-btn')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-k="start"]')!.click();
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: 'standard' }));
  });

  it('remembers the Animations choice and flags <html>', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const { menu } = boot(root);
    menu.setOpen(true);
    root.querySelector<HTMLButtonElement>('[data-k="choice-1-off"]')!.click();
    expect(document.documentElement.classList.contains('no-anim')).toBe(true);
    expect(localStorage.getItem('ww.animations')).toBe('off');
  });
});
