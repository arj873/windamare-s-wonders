// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toy } from '../engine/core/testing/helpers';
import { toyPresenter } from '../ui/table/testing/toy';
import { boot } from './boot';
import { BOT_LEVEL } from './play';
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
/** Home → Play vs bots → the setup screen. */
const toSetup = (root: ParentNode) => {
  if (!root.querySelector('.setup')) click(root, '[data-k="play"]');
};

describe('boot', () => {
  it('opens on the home screen; Play vs bots leads to setup, whose Back returns home', () => {
    const root = mount();
    const app = boot(root, { onStart: vi.fn() });
    expect(root.querySelector('.home')).not.toBeNull();
    expect(root.querySelector('.ww-menu-btn')).not.toBeNull();
    expect(app.home).not.toBeNull();
    // Online, join and tutorial have no handler yet: hidden, never dead buttons.
    expect(root.querySelector('[data-k="online"]')).toBeNull();
    expect(root.querySelector('[data-k="join"]')).toBeNull();
    const nick = root.querySelector<HTMLInputElement>('[data-k="nickname"]')!;
    nick.value = 'Arjun';
    click(root, '[data-k="play"]');
    expect(root.querySelector('.setup')).not.toBeNull();
    expect(localStorage.getItem('ww.name')).toBe('Arjun');
    expect(root.querySelector<HTMLInputElement>('[data-k="name-0"]')?.value).toBe('Arjun');
    click(root, '[data-k="back"]');
    expect(root.querySelector('.home')).not.toBeNull();
  });

  it('hands Start to the caller', () => {
    const root = mount();
    const onStart = vi.fn();
    boot(root, { onStart });
    toSetup(root);
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
    toSetup(root);
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

  it('plays Windamere: choose a Great Work, then a 6-card hand, bots answer, picks resolve', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const root = mount();
    const app = boot(root, { game: windamereBinding() });
    toSetup(root);
    click(root, '[data-k="start"]');
    expect(root.querySelector('.dt-prompt h2')?.textContent).toBe('Choose your Great Work');
    expect(root.querySelectorAll('.dt-answer')).toHaveLength(2);
    expect(root.querySelectorAll('.dt-card')).toHaveLength(0);
    vi.advanceTimersByTime(10); // the bots choose theirs
    click(root, '[data-k="answer-0"]');
    expect(root.querySelectorAll('.dt-card')).toHaveLength(6);
    expect(app.play?.game.state.seats[0]?.data).toMatchObject({ greatWork: expect.any(String) });
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
    toSetup(root);
    click(root, '[data-k="ctl-1-human"]'); // seat 2 becomes a human
    toSetup(root);
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

  it('?debug=1 starts an all-human game with no covers and stable data-* hooks', () => {
    const root = mount();
    const app = boot(root, { game: windamereBinding(), debug: { seats: 3, seed: 'qa' } });
    const table = root.querySelector<HTMLElement>('.dt')!;
    expect(app.play?.game.humans).toEqual([0, 1, 2]);
    expect(table.dataset.phase).toBe('prompt');
    expect(root.querySelector('.dt-cover')).toBeNull();
    // Each seat chooses its Great Work in turn; the screen moves on with no pass cover.
    for (const seat of [0, 1, 2]) {
      expect(table.dataset.viewer).toBe(String(seat));
      const option = root.querySelector<HTMLElement>('[data-answer]')!;
      expect(option.dataset.answer).toMatch(/^the-/);
      option.click();
    }
    expect(table.dataset.phase).toBe('pick');
    const card = root.querySelector<HTMLElement>('.dt-card[data-card][data-def]')!;
    card.click();
    expect(
      root.querySelector(`[data-use="spend"][data-card="${card.dataset.card}"]`),
    ).not.toBeNull();
    expect(table.dataset.viewer).toBe('2'); // the last seat to choose keeps the screen
    root.querySelector<HTMLElement>('[data-use="spend"]')!.click();
    expect(table.dataset.viewer).toBe('0');
    expect(root.querySelector('.dt-chip[data-seat="2"]')?.getAttribute('data-status')).toBe(
      'picked',
    );
    app.play?.dispose();
  });

  it('hands each resolved action to the fx hook with anchors and a layer', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const onAction = vi.fn();
    const skip = vi.fn();
    const root = mount();
    const app = boot(root, { game: windamereBinding(), fx: { onAction, skip } });
    toSetup(root);
    click(root, '[data-k="start"]');
    expect(onAction).not.toHaveBeenCalled(); // never for the first render
    vi.advanceTimersByTime(10); // the bots choose their Great Works
    click(root, '[data-k="answer-0"]'); // the group completes: Great Works revealed, Spring dealt
    expect(onAction).toHaveBeenCalledTimes(1);
    const moment = onAction.mock.calls[0]![0];
    expect(moment.key).toBe(moment.model.actionKey);
    expect(moment.anchors.layer.classList.contains('dt-fx-layer')).toBe(true);
    expect(moment.view.view.viewer).toBe(0);
    expect(moment.anchors.town(0)).toBe(root.querySelector('.dt-town'));
    expect(moment.anchors.stat(0, 'coins')).not.toBeNull();
    expect(moment.anchors.town(1)).toBe(root.querySelector('.dt-left'));
    expect(moment.anchors.card(app.play!.game.state.seats[0]!.hand[0]!.id)).not.toBeNull();
    click(root, '.dt-town');
    expect(skip).toHaveBeenCalled();
    app.play?.dispose();
  });

  it('shows Play online and Join on the home screen when the online lane plugs in', () => {
    const root = mount();
    const create = vi.fn();
    const join = vi.fn();
    boot(root, { online: { create, join } });
    root.querySelector<HTMLInputElement>('[data-k="nickname"]')!.value = 'Ana';
    click(root, '[data-k="online"]');
    expect(create).toHaveBeenCalledWith('Ana', root);
    root.querySelector<HTMLInputElement>('[data-k="code"]')!.value = 'k7qf';
    click(root, '[data-k="join"]');
    expect(join).toHaveBeenCalledWith('K7QF', 'Ana', root);
  });

  it('wires tutorial help: How to play, ?, All cards, tooltips on data-term', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const root = mount();
    const app = boot(root, { game: windamereBinding() });
    toSetup(root);
    click(root, '[data-k="start"]');
    vi.advanceTimersByTime(10);
    click(root, '[data-k="answer-0"]');
    expect(root.querySelector('.dt-town [data-term="guard"]')).not.toBeNull();
    app.menu.setOpen(true);
    const howTo = [...root.querySelectorAll<HTMLElement>('.ww-menu-item')].find((b) =>
      b.textContent?.startsWith('How to play'),
    );
    expect(howTo).toBeDefined();
    howTo!.click();
    expect(document.querySelectorAll('.ww-dialog').length).toBeGreaterThan(0);
    document.querySelectorAll('.ww-scrim').forEach((s) => s.remove());
    click(root, '[data-k="catalog"]');
    expect(document.querySelector('.ww-dialog h2')?.textContent).toBe('All cards');
    app.play?.dispose();
    document.querySelectorAll('.ww-scrim').forEach((s) => s.remove());
  });

  it('Learn to play: the coached First game vs 3 Easy bots, paced, kept off other screens', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const root = mount();
    const app = boot(root, { game: windamereBinding() });
    // First visit: the one-time card, plus the home button.
    expect(root.querySelector('[data-k="learn"]')).not.toBeNull();
    click(root, '[data-k="tut-hint-learn"]');
    const s = app.play!.game.state;
    expect(s.config.options).toEqual({ firstGame: true });
    expect(s.seats.map((x) => x.name)).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3']);
    const panel = root.querySelector<HTMLElement>('.tut-panel')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).not.toBe('');
    for (const part of ['hand', 'town', 'monument', 'raid'])
      expect(root.querySelector(`[data-tut="${part}"]`), part).not.toBeNull();
    expect(root.querySelectorAll('[data-tut="neighbours"]')).toHaveLength(2);
    // The coach slows bots to TUTORIAL_PACE_MS even at Instant speed.
    vi.advanceTimersByTime(100);
    expect(app.play!.game.state.seats[1]!.pick).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(app.play!.game.state.seats[1]!.pick).not.toBeNull();
    // Setup over the game hides the panel; Back brings it back.
    app.menu.setOpen(true);
    [...root.querySelectorAll<HTMLElement>('.ww-menu-item')]
      .find((b) => b.textContent?.startsWith('New game'))!
      .click();
    expect(root.querySelector('.setup')).not.toBeNull();
    expect(panel.hidden).toBe(true);
    click(root, '[data-k="back"]');
    expect(panel.isConnected && !panel.hidden).toBe(true);
    // Any other game ends the run.
    app.menu.setOpen(true);
    [...root.querySelectorAll<HTMLElement>('.ww-menu-item')]
      .find((b) => b.textContent?.startsWith('New game'))!
      .click();
    click(root, '[data-k="start"]');
    expect(panel.hidden).toBe(true);
    app.play?.dispose();
    // The card shows once.
    const again = mount();
    boot(again, { game: windamereBinding() });
    expect(again.querySelector('.tut-hint')).toBeNull();
  });

  it('maps setup bot levels onto the bots lane (Normal = level 2, Hard = level 3)', () => {
    expect(BOT_LEVEL).toEqual({ easy: 'easy', normal: 'medium', hard: 'hard' });
  });

  it('starts a First game: no Great Work choice, no Honours, Relaxed clock (R19)', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const root = mount();
    const app = boot(root, { game: windamereBinding() });
    toSetup(root);
    expect(root.querySelector('[data-k="first-game-on"]')).not.toBeNull();
    click(root, '[data-k="first-game-on"]');
    expect(root.querySelector('[data-k="clock-relaxed"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    click(root, '[data-k="start"]');
    const s = app.play!.game.state;
    expect(s.config.options).toEqual({ firstGame: true });
    expect(s.phase.kind).toBe('pick'); // the Great Work is dealt, no choice screen
    expect(root.querySelector('.dt-prompt')).toBeNull();
    expect(root.querySelectorAll('.dt-card')).toHaveLength(6);
    expect(root.querySelector('.dt-side-fact')).toBeNull(); // no Honours to list
    expect(app.play!.game.clock()?.totalMs).toBe(68_000); // Relaxed: 45 s × 1.5, rounded up
    app.play?.dispose();
  });

  it('refuses a setup the ruleset cannot seat, with a notice', () => {
    const root = mount();
    const app = boot(root, { game: { engine: toy, present: toyPresenter } });
    toSetup(root);
    for (let i = 0; i < 3; i++) click(root, '[data-k="add-seat"]'); // 7 players; toy seats 2-5
    click(root, '[data-k="start"]');
    expect(app.play).toBeNull();
    expect(document.querySelector('.ww-toast')?.textContent).toMatch(/Can't start: 7 seats/);
  });
});
