// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupScreen } from './screen';
import { MAX_PLAYERS, MIN_PLAYERS, STORAGE_KEY, type SetupStorage } from './model';

function memory(): SetupStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function mount(opts: Partial<ConstructorParameters<typeof SetupScreen>[0]> = {}) {
  const onStart = vi.fn();
  const storage = memory();
  const screen = new SetupScreen({ onStart, storage, ...opts });
  document.body.append(screen.element);
  const q = <T extends HTMLElement = HTMLElement>(k: string) =>
    screen.element.querySelector<T>(`[data-k="${k}"]`);
  return { screen, onStart, storage, q, rows: () => screen.element.querySelectorAll('.su-seat') };
}

afterEach(() => document.body.replaceChildren());

describe('SetupScreen', () => {
  it('shows one row per seat and starts with the built config', () => {
    const { q, rows, onStart, storage } = mount();
    expect(rows()).toHaveLength(4);
    q('start')!.click();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]![0]).toMatchObject({ mode: 'standard', clock: 'off' });
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
  });

  it('adds and removes seats within the range', () => {
    const { q, rows } = mount();
    while (rows().length < MAX_PLAYERS) q('add-seat')!.click();
    expect(q<HTMLButtonElement>('add-seat')!.disabled).toBe(true);
    while (rows().length > MIN_PLAYERS) q('remove-0')!.click();
    expect(q<HTMLButtonElement>('remove-0')!.disabled).toBe(true);
  });

  it('shows the bot level only for bot seats', () => {
    const { q } = mount();
    expect(q('level-0')!.classList.contains('is-hidden')).toBe(true);
    expect(q('level-1')!.classList.contains('is-hidden')).toBe(false);
    q('ctl-1-human')!.click();
    expect(q('level-1')!.classList.contains('is-hidden')).toBe(true);
  });

  it('warns about pass screens with two humans', () => {
    const { q } = mount();
    expect(q('hotseat-note')).toBeNull();
    q('ctl-1-human')!.click();
    expect(q('hotseat-note')!.textContent).toMatch(/2 humans/);
  });

  it('keeps focus and the row while typing a name', () => {
    const { q, screen } = mount();
    const input = q<HTMLInputElement>('name-1')!;
    input.focus();
    input.value = 'Ana';
    input.dispatchEvent(new Event('input'));
    expect(document.activeElement).toBe(input);
    expect(screen.state.seats[1]!.name).toBe('Ana');
  });

  it('keeps focus on the clicked control across a re-render', () => {
    const { q } = mount();
    q('clock-normal')!.focus();
    q('clock-normal')!.click();
    expect(document.activeElement?.getAttribute('data-k')).toBe('clock-normal');
    expect(q('clock-normal')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('summary')!.textContent).toMatch(/Normal clock/);
  });

  it('explains a clock option with the game’s numbers (R15.3)', () => {
    const { q } = mount({ clockHint: (scale) => `${Math.ceil(45 * scale)} s on a fresh hand` });
    q('clock-relaxed')!.click();
    expect(document.querySelector('.su-timer + .su-hint')?.textContent).toMatch(
      /^68 s on a fresh hand\. One clock/,
    );
  });

  it('disables Start with the reason when no human is seated', () => {
    const { q, onStart } = mount();
    q('ctl-0-bot')!.click();
    expect(q<HTMLButtonElement>('start')!.disabled).toBe(true);
    expect(q('summary')!.querySelector('[role="alert"]')!.textContent).toMatch(/human/);
    q('start')!.click();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('shuffles with the injected source and offers Back / Learn when given', () => {
    const onBack = vi.fn();
    const onTutorial = vi.fn();
    const { q, screen } = mount({ onBack, onTutorial, random: () => 0 });
    const before = screen.state.seats.map((s) => s.name);
    q('shuffle')!.click();
    expect(screen.state.seats.map((s) => s.name)).not.toEqual(before);
    q('back')!.click();
    q('learn')!.click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onTutorial).toHaveBeenCalledOnce();
    // "Start" names one button only: a by-name lookup must not land on Learn to play.
    const starts = [...screen.element.querySelectorAll('button')].filter((b) =>
      /start/i.test(`${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`),
    );
    expect(starts.map((b) => b.dataset.k)).toEqual(['start']);
  });

  it('keeps More options open across re-renders', () => {
    const { q, screen } = mount();
    const more = screen.element.querySelector('details')!;
    more.open = true;
    more.dispatchEvent(new Event('toggle'));
    q('add-seat')!.click();
    expect(screen.element.querySelector('details')!.open).toBe(true);
  });
});
