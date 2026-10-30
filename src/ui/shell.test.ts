// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmDialog, openDialog, showResumePrompt } from './dialog';
import { Menu } from './menu';
import { MAX_TOASTS, showToast, TOAST_MS } from './toast';

const key = (k: string, shiftKey = false) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('toasts', () => {
  it('shows a toast and removes it after its time', () => {
    vi.useFakeTimers();
    showToast('Hello', 'error');
    const el = document.querySelector('.ww-toast.is-error')!;
    expect(el.textContent).toBe('Hello');
    expect(el.parentElement!.getAttribute('role')).toBe('status');
    vi.advanceTimersByTime(TOAST_MS + 500);
    expect(document.querySelector('.ww-toast')).toBeNull();
  });

  it(`keeps at most ${MAX_TOASTS} on screen`, () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) showToast(`t${i}`);
    const texts = [...document.querySelectorAll('.ww-toast')].map((t) => t.textContent);
    expect(texts).toEqual(['t2', 't3', 't4']);
  });
});

describe('dialogs', () => {
  it('focuses the primary action, closes on Esc and restores focus', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    openDialog({
      title: 'Leave?',
      actions: [{ label: 'Stay' }, { label: 'Leave', primary: true }],
      onClose,
    });
    const dlg = document.querySelector('[role="dialog"]')!;
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)!.textContent).toBe(
      'Leave?',
    );
    expect(document.activeElement?.textContent).toBe('Leave');
    key('Escape');
    expect(document.querySelector('.ww-scrim')).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the dialog', () => {
    openDialog({ title: 'T', actions: [{ label: 'A' }, { label: 'B' }] });
    const [a, b] = [...document.querySelectorAll<HTMLButtonElement>('.ww-dialog button')];
    b!.focus();
    key('Tab');
    expect(document.activeElement).toBe(a);
    key('Tab', true);
    expect(document.activeElement).toBe(b);
  });

  it('does not close on Esc or a scrim click when not dismissible', () => {
    openDialog({ title: 'T', actions: [{ label: 'OK' }], dismissible: false });
    key('Escape');
    (document.querySelector('.ww-scrim') as HTMLElement).click();
    expect(document.querySelector('.ww-scrim')).not.toBeNull();
  });

  it("stays open when an action returns 'keep-open'", () => {
    openDialog({ title: 'T', actions: [{ label: 'Nope', onClick: () => 'keep-open' }] });
    document.querySelector<HTMLButtonElement>('.ww-dialog button')!.click();
    expect(document.querySelector('.ww-scrim')).not.toBeNull();
  });

  it('confirmDialog resolves true on confirm and false on Esc', async () => {
    const yes = confirmDialog('New game?', 'The running game ends.', 'New game');
    document.querySelector<HTMLButtonElement>('.ww-dialog .btn-primary')!.click();
    await expect(yes).resolves.toBe(true);
    const no = confirmDialog('New game?', 'The running game ends.', 'New game');
    key('Escape');
    await expect(no).resolves.toBe(false);
  });

  it('resume prompt offers New game then Resume and removes itself', () => {
    const resume = vi.fn();
    const fresh = vi.fn();
    showResumePrompt('4 players · era 2, pick 3', resume, fresh);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.ww-resume button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['New game', 'Resume']);
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1]!.click();
    expect(resume).toHaveBeenCalledOnce();
    expect(fresh).not.toHaveBeenCalled();
    expect(document.querySelector('.ww-resume')).toBeNull();
  });
});

describe('Menu', () => {
  function mount() {
    const onNew = vi.fn();
    const onSpeed = vi.fn();
    const menu = new Menu([
      { kind: 'action', label: 'New game', onClick: onNew },
      {
        kind: 'choice',
        label: 'Bot speed',
        options: [
          { id: 'slow', label: 'Slow' },
          { id: 'fast', label: 'Fast' },
        ],
        value: 'slow',
        onChange: onSpeed,
      },
    ]);
    document.body.append(menu.element);
    const toggle = menu.element.querySelector<HTMLButtonElement>('.ww-menu-btn')!;
    return { menu, onNew, onSpeed, toggle };
  }

  it('opens with the first item focused and runs an action, then closes', () => {
    const { menu, onNew, toggle } = mount();
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toBe('New game');
    (document.activeElement as HTMLElement).click();
    expect(onNew).toHaveBeenCalledOnce();
    expect(menu.isOpen).toBe(false);
  });

  it('switches a choice in place and stays open', () => {
    const { menu, onSpeed, toggle } = mount();
    toggle.click();
    menu.element.querySelector<HTMLButtonElement>('[data-k="choice-1-fast"]')!.click();
    expect(onSpeed).toHaveBeenCalledWith('fast');
    expect(menu.isOpen).toBe(true);
    const fast = menu.element.querySelector('[data-k="choice-1-fast"]')!;
    expect(fast.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(fast);
  });

  it('moves with arrow keys and closes on Esc or an outside click', () => {
    const { menu, toggle } = mount();
    toggle.click();
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Slow');
    key('ArrowUp');
    expect(document.activeElement?.textContent).toBe('New game');
    key('Escape');
    expect(menu.isOpen).toBe(false);
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.isOpen).toBe(false);
  });
});
