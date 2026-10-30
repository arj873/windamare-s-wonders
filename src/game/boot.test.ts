// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toy } from '../engine/core/testing/helpers';
import { toyPresenter } from '../ui/table/testing/toy';
import { boot, debugFromSearch } from './boot';
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

  it('offers Sound on/off in the ☰ menu when given a switch (as online does)', () => {
    const plain = mount();
    boot(plain).menu.setOpen(true);
    expect(plain.querySelector('[data-k="choice-2-off"]')).toBeNull(); // no switch, no item
    document.body.replaceChildren();
    const root = mount();
    let muted = false;
    const setMuted = vi.fn((m: boolean) => {
      muted = m;
    });
    const { menu } = boot(root, {
      sound: {
        get muted() {
          return muted;
        },
        setMuted,
      },
    });
    menu.setOpen(true);
    expect(root.querySelector('[data-k="choice-2-on"]')?.getAttribute('aria-pressed')).toBe('true');
    click(root, '[data-k="choice-2-off"]');
    expect(setMuted).toHaveBeenCalledWith(true);
    expect(muted).toBe(true);
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

  it('reads ?debug=1 with seats, seed, First game and clock (qa Q2b-3)', () => {
    expect(debugFromSearch('')).toBeNull();
    expect(debugFromSearch('?seats=3')).toBeNull();
    expect(debugFromSearch('?debug=1')).toEqual({ seats: 4 });
    expect(debugFromSearch('?debug=1&seats=2&seed=s&first=1&clock=fast')).toEqual({
      seats: 2,
      seed: 's',
      firstGame: true,
      clock: 'fast',
    });
    expect(debugFromSearch('?debug=1&clock=warp')).toEqual({ seats: 4 });
    const root = mount();
    const app = boot(root, {
      game: windamereBinding(),
      debug: { seats: 3, firstGame: true, clock: 'normal' },
    });
    const g = app.play!.game;
    expect(g.state.config.options).toEqual({ firstGame: true });
    expect(g.state.phase.kind).toBe('pick'); // the Great Work is dealt, no choice
    expect(g.clock()?.totalMs).toBe(45_000);
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
    // qa's playtest hooks: roles on the controls, why a Build is closed, the view as JSON.
    let closed: HTMLButtonElement | null = null;
    for (const c of root.querySelectorAll<HTMLElement>('[data-pt-role="card"]')) {
      c.click();
      expect(root.querySelector('[data-pt-role="spend"]')).not.toBeNull();
      closed = root.querySelector<HTMLButtonElement>('[data-pt-role="build"]:disabled');
      if (closed) break;
    }
    expect(closed?.dataset.why).toMatch(/\S/); // seed 'qa': this hand has a Spend-only card
    expect(root.querySelector('.dt-card .dt-part[role="img"]')?.getAttribute('aria-label')).toMatch(
      /\S/,
    );
    const pt = (window as unknown as { __pt: { view(seat?: number): unknown } }).__pt;
    const view = pt.view() as { view: { viewer: number }; seats: unknown[] };
    expect(view.view.viewer).toBe(0);
    expect(view.seats).toHaveLength(3);
    expect((pt.view(1) as { view: { viewer: number } }).view.viewer).toBe(1);
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

  it('holds the turn clock while the Season card is up (R7 #1)', () => {
    vi.useFakeTimers();
    localStorage.setItem('ww.botSpeed', 'instant');
    const root = mount();
    const app = boot(root, { game: windamereBinding() });
    toSetup(root);
    click(root, '[data-k="clock-normal"]');
    click(root, '[data-k="start"]');
    vi.advanceTimersByTime(10);
    click(root, '[data-k="answer-0"]');
    for (let turn = 0; turn < 5 && !root.querySelector('.dt-season'); turn++) {
      vi.advanceTimersByTime(10);
      click(root, '.dt-card');
      click(root, '[data-use="spend"]');
      vi.advanceTimersByTime(50);
    }
    expect(root.querySelector('.dt-season')).not.toBeNull();
    const game = app.play!.game;
    expect(game.paused).toBe(true);
    const left = game.clock()!.remainingMs;
    vi.advanceTimersByTime(3000);
    expect(game.clock()!.remainingMs).toBe(left);
    click(root, '[data-k="season-ok"]');
    expect(game.paused).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(game.clock()!.remainingMs).toBe(left - 1000);
    app.play?.dispose();
  });

  it('shows a 2-town Burn once, for both uses, and sends it with the pick (R14.2)', () => {
    const root = mount();
    const app = boot(root, {
      game: windamereBinding(),
      debug: { seats: 2, seed: 'duel', firstGame: true },
    });
    const both = [...root.querySelectorAll<HTMLElement>('[data-pt-role="card"]')].find((card) => {
      card.click();
      return root.querySelectorAll('.dt-pop [data-use]:not([disabled])').length === 2;
    });
    expect(both).toBeDefined(); // seed 'duel': some card can be built or spent
    expect(root.querySelectorAll('.dt-pop [data-choice="burn"]')).toHaveLength(1);
    const alt = root.querySelector<HTMLElement>(
      '.dt-pop [data-choice="burn"] [data-option]:not(.is-on)',
    )!;
    const burned = Number(alt.dataset.option!.replace('burn-', ''));
    const name = alt.textContent!;
    alt.click();
    for (const use of ['build', 'spend']) {
      expect(root.querySelector(`.dt-pop [data-use="${use}"] .dt-use-detail`)?.textContent).toMatch(
        new RegExp(`burn ${name}$`),
      );
    }
    root.querySelector<HTMLElement>('.dt-pop [data-use="spend"]')!.click();
    const pick = app.play!.game.state.seats[0]!.pick as { args?: { burn?: number } } | null;
    expect(pick?.args?.burn).toBe(burned);
    app.play?.dispose();
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
