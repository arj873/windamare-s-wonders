// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sfx } from '../../audio';
import type { WwState } from '../../engine';
import { tableModel } from '../../ui/table/model';
import { DraftTable } from '../../ui/table/table';
import { windamere } from './content';
import { cardLook, windamereFx } from './fx';
import { windamerePresenter } from './present';

const { rules, engine } = windamere();
const present = windamerePresenter(rules, engine);
const looks = Array.from({ length: 3 }, (_, i) => ({ color: '#888888', bot: i > 0 }));

function finished(): WwState {
  let s = engine.createGame({ seed: 'fx', seats: ['A', 'B', 'C'].map((name) => ({ name })) });
  while (s.phase.kind !== 'gameOver') {
    for (const seat of engine.waitingOn(s)) {
      const r = engine.applyAction(s, engine.defaultAction(s, seat)!);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
  }
  return s;
}

afterEach(() => document.body.replaceChildren());

describe('windamereFx', () => {
  it('opts the table into fx motion and runs the game-end count-up to the real totals', async () => {
    const table = new DraftTable({ pick() {}, unpick() {}, answer() {} });
    document.body.append(table.element);
    const fx = windamereFx(rules);
    fx.attach?.(table.anchors);
    expect(table.element.classList.contains('fx-motion')).toBe(true);

    const s = finished();
    const view = engine.viewFor(s, 0);
    const model = tableModel({ view, engine, present, looks });
    table.update(model);
    expect(table.anchors.scoreTotals()).toHaveLength(3);
    fx.onAction({ key: model.actionKey, view, model, anchors: table.anchors, reducedMotion: true });
    await new Promise((r) => setTimeout(r, 50));
    for (const { seat, el } of table.anchors.scoreTotals()) {
      const total = model.result!.columns.find((c) => c.seat === seat)!.total;
      expect(el.textContent).toBe(String(total));
    }
    fx.dispose?.();
    table.destroy();
  });

  it('opens the final card at 0 with no ranks, counts up, then shows ranks (R10 #1)', async () => {
    const table = new DraftTable({ pick() {}, unpick() {}, answer() {} });
    document.body.append(table.element);
    const fx = windamereFx(rules);
    const s = finished();
    const view = engine.viewFor(s, 0);
    const model = tableModel({ view, engine, present, looks });
    table.update(model);
    // The Winter Raid had no card of its own: its lines head the final card.
    expect(model.seasonEnd?.title).toMatch(/^End of Winter/);
    const raid = table.element.querySelector('.dt-result-raid');
    expect(raid?.querySelectorAll('.dt-season-lines li').length).toBeGreaterThanOrEqual(3);
    vi.useFakeTimers();
    const gameEnd = vi.spyOn(sfx, 'play');
    const card = table.element.querySelector('.dt-result')!;
    const totals = () => table.anchors.scoreTotals().map(({ el }) => el.textContent);
    const real = model.result!.columns.map((c) => String(c.total));
    const moment = { key: model.actionKey, view, model, anchors: table.anchors };
    fx.onAction({ ...moment, reducedMotion: false });
    expect(card.classList.contains('is-counting')).toBe(true); // ranks and headline wait (CSS)
    expect(totals()).toEqual(['0', '0', '0']);
    // A tap shows the ranks now; fx lands every total on its next frame.
    fx.skip?.();
    expect(card.classList.contains('is-counting')).toBe(false);
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(50);
    expect(totals()).toEqual(real);
    expect(gameEnd.mock.calls.filter(([id]) => id === 'gameEnd')).toHaveLength(1);
    // The same game end again (a reconnect, a repeated call): totals as they are, no second count.
    fx.onAction({ ...moment, reducedMotion: false });
    expect(totals()).toEqual(real);
    await vi.advanceTimersByTimeAsync(50);
    expect(gameEnd.mock.calls.filter(([id]) => id === 'gameEnd')).toHaveLength(1);
    fx.dispose?.();
    table.destroy();

    // Another game on a new table counts by itself, lowest first (about 2.6 s here).
    const next = new DraftTable({ pick() {}, unpick() {}, answer() {} });
    document.body.append(next.element);
    next.update(model);
    const fx2 = windamereFx(rules);
    fx2.onAction({ ...moment, anchors: next.anchors, reducedMotion: false });
    const nextTotals = () => next.anchors.scoreTotals().map(({ el }) => el.textContent);
    expect(nextTotals()).toEqual(['0', '0', '0']);
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(100);
    expect(next.element.querySelector('.dt-result')!.classList.contains('is-counting')).toBe(false);
    expect(nextTotals()).toEqual(real);
    expect(gameEnd.mock.calls.filter(([id]) => id === 'gameEnd')).toHaveLength(2);
    gameEnd.mockRestore();
    vi.useRealTimers();
    fx2.dispose?.();
    next.destroy();
  });

  it('gives fx F5 sprites the card face’s art and kind; nothing for goods', () => {
    const look = cardLook(rules, present);
    const card = rules.content.cards[0]!;
    const face = present.card(card.id);
    expect(look(card.id)).toEqual({ kind: card.kind, ...(face.art ? { art: face.art } : {}) });
    expect(look(card.id)?.art).toMatch(/\.svg$/);
    expect(look(rules.content.goods[0]!.id)).toBeNull();
  });
});
