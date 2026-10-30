// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, newToyGame, toy } from '../../engine/core/testing/helpers';
import type { ToyState } from '../../engine/core/testing/toy';
import type { Viewer } from '../../engine';
import { tableModel } from './model';
import { clockText, DraftTable, SEASON_CARD_MS, type DraftTableHandlers } from './table';
import { toyPresenter } from './testing/toy';

const looks = [
  { color: '#e04848', bot: false },
  { color: '#3a7bd5', bot: true },
  { color: '#2fa35b', bot: true },
];

const model = (state: ToyState, viewer: Viewer = 0) =>
  tableModel({ view: toy.viewFor(state, viewer), engine: toy, present: toyPresenter, looks });

function mount(state: ToyState, over: Partial<DraftTableHandlers> = {}) {
  const handlers = {
    pick: vi.fn(),
    unpick: vi.fn(),
    answer: vi.fn(),
    newGame: vi.fn(),
    rematch: vi.fn(),
    ...over,
  };
  const table = new DraftTable(handlers);
  document.body.append(table.element);
  table.update(model(state));
  return { table, handlers, el: table.element };
}

const $ = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel);
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

afterEach(() => document.body.replaceChildren());

describe('DraftTable', () => {
  it('draws the top bar, both neighbours, your town, hand and summary', () => {
    const { el } = mount(newToyGame(3));
    expect($(el, '.dt-round')?.textContent).toBe('Round 1 of 2 · Pick 1 of 3 · hands pass ◀ to P1');
    expect($(el, '.dt-status')?.textContent).toBe('Choose a card');
    expect(el.querySelectorAll('.dt-chip')).toHaveLength(3);
    expect($(el, '.dt-left .seat-name')?.textContent).toBe('P1');
    expect($(el, '.dt-right .seat-name')?.textContent).toBe('P2');
    expect($(el, '.dt-left .dt-arrow')?.classList.contains('is-pass')).toBe(true);
    expect($(el, '.dt-town h2')?.textContent).toBe('Your town');
    expect(el.querySelectorAll('.dt-card')).toHaveLength(4);
    expect(el.querySelectorAll('.dt-row')).toHaveLength(3);
    expect($(el, '.dt-pop')).toBeNull();
  });

  it('opens the action popover on a card and picks a legal use', () => {
    const state = structuredClone(newToyGame(3));
    state.seats[0]!.data.coins = 0;
    const { el, handlers, table } = mount(state);
    const priced = model(state).hand.find((c) => c.face.cost !== '')!;
    $(el, `[data-k="card-${priced.id}"]`)!.click();
    expect(table.selection).toBe(priced.id);
    const pop = $(el, '.dt-pop')!;
    expect(pop.querySelectorAll('button')).toHaveLength(3);
    const build = $(pop, `[data-k="use-${priced.id}-build"]`) as HTMLButtonElement;
    expect(build.disabled).toBe(true);
    expect($(pop, '.why')?.textContent).toBe('Not enough coins');
    $(pop, `[data-k="use-${priced.id}-sell"]`)!.click();
    expect(handlers.pick).toHaveBeenCalledWith({ card: priced.id, use: 'sell' });
    expect(table.selection).toBeNull();
  });

  it('selects with number keys, picks with the use key, Esc closes', () => {
    const state = newToyGame(3);
    const { el, handlers, table } = mount(state);
    const first = state.seats[0]!.hand[0]!;
    key('1');
    expect(table.selection).toBe(first.id);
    expect(document.activeElement?.getAttribute('data-k')).toBe(`card-${first.id}`);
    key('Escape');
    expect(table.selection).toBeNull();
    key('1');
    key('s');
    expect(handlers.pick).toHaveBeenCalledWith({ card: first.id, use: 'sell' });
    expect($(el, '.dt-pop')).toBeNull();
  });

  it('shows the locked pick with Change pick (button and Z)', () => {
    let state = newToyGame(3);
    const card = state.seats[0]!.hand[0]!;
    const { el, handlers, table } = mount(state);
    state = act(state, { type: 'pick', seat: 0, pick: { card: card.id, use: 'sell' } });
    table.update(model(state));
    expect($(el, '.dt-stage-text')?.textContent).toContain('Locked: Sell for 2g');
    expect($(el, `[data-k="card-${card.id}"]`)?.classList.contains('is-staged')).toBe(true);
    expect($(el, '.dt-status')?.textContent).toBe('Waiting for P1 and P2');
    $(el, '[data-k="unpick"]')!.click();
    key('z');
    expect(handlers.unpick).toHaveBeenCalledTimes(2);
  });

  it('keeps focus on a card across re-renders', () => {
    const state = newToyGame(3);
    const { el, table } = mount(state);
    const id = state.seats[0]!.hand[1]!.id;
    $(el, `[data-k="card-${id}"]`)!.focus();
    table.update(model(state));
    expect(document.activeElement?.getAttribute('data-k')).toBe(`card-${id}`);
  });

  it('turns the hand into the open prompt', () => {
    const state = newToyGame(3, { opening: true });
    const { el, handlers } = mount(state);
    expect($(el, '.dt-prompt h2')?.textContent).toBe('Opening: take a coin?');
    $(el, '[data-k="answer-1"]')!.click();
    expect(handlers.answer).toHaveBeenCalledWith(state.prompts[0]!.id, 'none');
    key('1');
    expect(handlers.answer).toHaveBeenLastCalledWith(state.prompts[0]!.id, 'coins');
  });

  it('shows final scores as one band card per town, best first, with New game and Rematch', () => {
    let state = newToyGame(3);
    while (state.phase.kind !== 'gameOver') {
      for (const seat of toy.waitingOn(state)) state = act(state, toy.defaultAction(state, seat)!);
    }
    const { el, handlers } = mount(state);
    expect($(el, '.dt-result h2')?.textContent).toBe('Final scores');
    const cards = [...el.querySelectorAll('.dt-band-card')];
    expect(cards).toHaveLength(3);
    const totals = cards.map((c) => Number(c.querySelector('.dt-band-total')?.textContent));
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(cards[0]!.querySelectorAll('dt').length).toBeGreaterThan(0);
    $(el, '[data-k="new"]')!.click();
    $(el, '[data-k="rematch"]')!.click();
    expect(handlers.newGame).toHaveBeenCalled();
    expect(handlers.rematch).toHaveBeenCalled();
  });

  it('drives the timer ring', () => {
    const { el, table } = mount(newToyGame(3));
    const timer = $(el, '.dt-timer')!;
    expect(timer.hidden).toBe(true);
    table.setTimer({ remainingMs: 30_000, totalMs: 45_000, locked: false });
    expect(timer.hidden).toBe(false);
    expect(timer.textContent).toBe('0:30');
    expect(timer.classList.contains('timer-low')).toBe(false);
    table.setTimer({ remainingMs: 9_000, totalMs: 45_000, locked: false });
    expect(timer.classList.contains('timer-low')).toBe(true);
    table.setTimer({ remainingMs: 9_000, totalMs: 45_000, locked: true });
    expect(timer.textContent).toBe('✓');
    expect(timer.classList.contains('timer-low')).toBe(false);
    // The ring survives a re-render (it is the same node).
    table.update(model(newToyGame(3)));
    expect($(el, '.dt-timer')).toBe(timer);
  });

  it('keeps the hand out of the DOM behind a pass cover', () => {
    const state = newToyGame(3);
    const { el, table, handlers } = mount(state, { reveal: vi.fn() });
    table.select(state.seats[0]!.hand[0]!.id);
    table.setCover({ name: 'Ana', color: '#e04848' });
    expect(el.querySelectorAll('.dt-card')).toHaveLength(0);
    expect($(el, '.dt-pop')).toBeNull();
    expect($(el, '#dt-cover-title')?.textContent).toContain('Pass to Ana');
    expect(document.activeElement?.getAttribute('data-k')).toBe('reveal');
    key('1');
    key('s');
    expect(handlers.pick).not.toHaveBeenCalled();
    $(el, '[data-k="reveal"]')!.click();
    expect(handlers.reveal).toHaveBeenCalled();
    table.setCover(null);
    expect(el.querySelectorAll('.dt-card')).toHaveLength(4);
  });

  it('keeps an fx layer across renders and resolves anchors for every seat', () => {
    const state = newToyGame(3);
    const { el, table, handlers } = mount(state, { skip: vi.fn() });
    const layer = table.anchors.layer;
    layer.append(document.createElement('i')); // fx's sprite
    table.update(model(state));
    expect(el.lastElementChild).toBe(layer);
    expect(layer.childElementCount).toBe(1); // a render never wipes fx's layer
    const a = table.anchors;
    expect(a.town(0)).toBe($(el, '.dt-town'));
    expect(a.town(1)).toBe($(el, '.dt-left'));
    expect(a.town(2)).toBe($(el, '.dt-right'));
    expect(a.stat(0, 'coins')).toBe($(el, '.dt-town .dt-stat.is-coins'));
    expect(a.card(state.seats[0]!.hand[0]!.id)).not.toBeNull();
    expect(a.stage()).not.toBeNull();
    el.querySelector<HTMLElement>('.dt-town')!.click();
    expect(handlers.skip).toHaveBeenCalled();
  });

  it('shows the Season-end card once per Season end; Continue or time closes it', () => {
    vi.useFakeTimers();
    const state = newToyGame(3);
    const { el, table } = mount(state);
    const base = model(state);
    const seasonEnd = {
      title: 'End of Spring · Wolf Pack, strength 2',
      lines: [{ seat: 0, text: 'P0 held the Raid', tone: 'gain' as const }],
      next: 'Next: Summer · hands pass ▶ right',
    };
    table.update({ ...base, actionKey: 'end-1', seasonEnd });
    expect($(el, '#dt-season-title')?.textContent).toBe(seasonEnd.title);
    expect($(el, '.dt-season-next')?.textContent).toBe(seasonEnd.next);
    $(el, '[data-k="season-ok"]')!.click();
    expect($(el, '.dt-season')).toBeNull();
    table.update({ ...base, actionKey: 'end-1', seasonEnd }); // same action: stays closed
    expect($(el, '.dt-season')).toBeNull();
    table.update({ ...base, actionKey: 'end-2', seasonEnd });
    expect($(el, '.dt-season')).not.toBeNull();
    vi.advanceTimersByTime(SEASON_CARD_MS);
    expect($(el, '.dt-season')).toBeNull();
    vi.useRealTimers();
  });

  it('opens the card list (tutorial’s, via the handler) and Recall from the hand header', () => {
    const state = newToyGame(3);
    const cards = vi.fn();
    const { el, table } = mount(state, { cards });
    expect($(el, '[data-k="recall"]')).toBeNull(); // nothing passed yet
    $(el, '[data-k="catalog"]')!.click();
    expect(cards).toHaveBeenCalledOnce();
    const recall = [{ title: 'Pick 1: passed to P1', cards: [] }];
    table.update({ ...model(state), recall });
    $(el, '[data-k="recall"]')!.click();
    expect(document.querySelector('.ww-dialog h2')?.textContent).toBe('Seen this Season');
    expect(document.querySelector('.dt-recall h3')?.textContent).toBe('Pick 1: passed to P1');
  });

  it('marks every card and chip with its kind for art A8 (colour band + shape badge)', () => {
    const state = structuredClone(newToyGame(3));
    state.seats[0]!.tableau = [{ id: 900, def: 'toy-statue' }];
    const { el } = mount(state);
    const card = el.querySelector('.dt-card')!;
    expect(card.querySelector('.dt-card-band.kind-head[data-kind]')).not.toBeNull();
    expect(card.querySelector('.dt-card-kind .kind-badge[data-kind]')).not.toBeNull();
    const chip = el.querySelector('.dt-town .dt-mini[data-kind="civic"]')!;
    expect(chip.querySelector('.kind-badge[data-kind="civic"]')).not.toBeNull();
    expect(el.querySelector('.dt-mark')).toBeNull(); // no text glyphs left
  });

  it('stops listening to keys once destroyed', () => {
    const state = newToyGame(3);
    const { handlers, table } = mount(state);
    table.destroy();
    key('1');
    key('s');
    expect(handlers.pick).not.toHaveBeenCalled();
  });
});

describe('clockText', () => {
  it('formats m:ss, rounding up', () => {
    expect(clockText(45_000)).toBe('0:45');
    expect(clockText(90_000)).toBe('1:30');
    expect(clockText(1)).toBe('0:01');
    expect(clockText(-5)).toBe('0:00');
  });
});
