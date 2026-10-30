// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toy } from '../engine/core/testing/helpers';
import { toyPresenter } from '../ui/table/testing/toy';
import { boot } from './boot';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  localStorage.clear();
});

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

const click = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel)!.click();

describe('boot', () => {
  it('shows the setup screen and the menu, and hands Start to the caller', () => {
    const root = mount();
    const onStart = vi.fn();
    boot(root, { onStart });
    expect(root.querySelector('.setup')).not.toBeNull();
    expect(root.querySelector('.ww-menu-btn')).not.toBeNull();
    click(root, '[data-k="start"]');
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: 'standard' }));
  });

  it('remembers the Animations choice and flags <html>', () => {
    const root = mount();
    const { menu } = boot(root);
    menu.setOpen(true);
    click(root, '[data-k="choice-1-off"]');
    expect(document.documentElement.classList.contains('no-anim')).toBe(true);
    expect(localStorage.getItem('ww.animations')).toBe('off');
  });

  it('starts a bound game on the draft table, and New game goes back to setup', () => {
    vi.useFakeTimers();
    const root = mount();
    const app = boot(root, { game: { engine: toy, present: toyPresenter } });
    click(root, '[data-k="start"]');
    expect(app.play).not.toBeNull();
    expect(app.setup).toBeNull();
    expect(root.querySelector('.dt')).not.toBeNull();
    expect(root.querySelectorAll('.dt-card')).toHaveLength(4);

    app.menu.setOpen(true);
    click(root, '[data-k="item-0"]');
    expect(root.querySelector('.setup')).not.toBeNull();
    click(root, '[data-k="back"]');
    expect(root.querySelector('.dt')).not.toBeNull();
    app.play?.dispose();
  });

  it('refuses a setup the ruleset cannot seat, with a notice', () => {
    const root = mount();
    const app = boot(root, { game: { engine: toy, present: toyPresenter } });
    for (let i = 0; i < 3; i++) click(root, '[data-k="add-seat"]'); // 7 players; toy seats 2-5
    click(root, '[data-k="start"]');
    expect(app.play).toBeNull();
    expect(document.querySelector('.ww-toast')?.textContent).toMatch(/Can't start: 7 seats/);
  });
});
