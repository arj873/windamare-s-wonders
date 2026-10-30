// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { WwState } from '../../engine';
import { tableModel } from '../../ui/table/model';
import { DraftTable } from '../../ui/table/table';
import { windamere } from './content';
import { windamereFx } from './fx';
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
});
