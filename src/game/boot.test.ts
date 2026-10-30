// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toy } from '../engine/core/testing/helpers';
import { toyPresenter } from '../ui/table/testing/toy';
import { boot } from './boot';
import { windamereBinding } from './windamere';

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

  it('plays Windamere: Start deals a 6-card hand, bots answer, picks resolve', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const root = mount();
    const app = boot(root, { game: windamereBinding() });
    click(root, '[data-k="start"]');
    expect(root.querySelectorAll('.dt-card')).toHaveLength(6);
    expect(root.querySelector('.dt-round')?.textContent).toMatch(/^Spring · Pick 1 of 5/);
    click(root, '.dt-card');
    click(root, '[data-k^="use-"][data-k$="-spend"]');
    vi.advanceTimersByTime(10);
    expect(root.querySelector('.dt-round')?.textContent).toMatch(/^Spring · Pick 2 of 5/);
    expect(root.querySelectorAll('.dt-card')).toHaveLength(5);
    app.play?.dispose();
  });

  it('covers the hand between two humans on one device (hotseat)', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const root = mount();
    const app = boot(root, { game: { engine: toy, present: toyPresenter } });
    click(root, '[data-k="ctl-1-human"]'); // seat 2 becomes a human
    click(root, '[data-k="start"]');
    const title = () => root.querySelector('#dt-cover-title')?.textContent ?? null;
    expect(title()).toContain('Pass to Player 1');
    expect(root.querySelectorAll('.dt-card')).toHaveLength(0);
    click(root, '[data-k="reveal"]');
    expect(title()).toBeNull();
    expect(root.querySelectorAll('.dt-card')).toHaveLength(4);
    click(root, '.dt-card');
    click(root, '[data-k^="use-"][data-k$="-sell"]');
    expect(title()).toContain('Pass to Player 2');
    expect(root.querySelectorAll('.dt-card')).toHaveLength(0);
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
