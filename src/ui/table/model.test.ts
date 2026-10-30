import { describe, expect, it } from 'vitest';
import { act, newToyGame, pickAll, toy } from '../../engine/core/testing/helpers';
import type { ToyState } from '../../engine/core/testing/toy';
import type { Viewer } from '../../engine';
import { listNames, tableModel, type SeatLook } from './model';
import { toyPresenter } from './testing/toy';

const looks = (n: number): SeatLook[] =>
  Array.from({ length: n }, (_, i) => ({ color: `#00000${i}`, bot: i > 0 }));

const model = (state: ToyState, viewer: Viewer = 0) =>
  tableModel({
    view: toy.viewFor(state, viewer),
    engine: toy,
    present: toyPresenter,
    looks: looks(state.seats.length),
  });

/** Every waiting seat takes its default action until the game ends. */
function playOut(state: ToyState): ToyState {
  let s = state;
  while (s.phase.kind !== 'gameOver') {
    for (const seat of toy.waitingOn(s)) {
      const a = toy.defaultAction(s, seat);
      if (a) s = act(s, a);
    }
  }
  return s;
}

describe('tableModel', () => {
  it('describes the opening pick from your seat', () => {
    const m = model(newToyGame(3));
    expect(m.phase).toBe('pick');
    expect(m.round).toBe('Round 1 of 2 · Pick 1 of 3');
    expect(m.pass).toEqual({ dir: 'left', arrow: '◀', to: 'P1' });
    expect(m.status).toBe('Choose a card');
    expect(m.me?.you).toBe(true);
    expect(m.left?.seat).toBe(1);
    expect(m.right?.seat).toBe(2);
    expect(m.seats.map((s) => s.status)).toEqual(['thinking', 'thinking', 'thinking']);
    expect(m.hand).toHaveLength(4);
    for (const c of m.hand) {
      expect(c.options.map((o) => o.use.id)).toEqual(['build', 'sell', 'stash']);
      expect(c.playable).toBe(true);
    }
    expect(m.me?.stats[0]).toEqual({ id: 'coins', label: 'Coins', value: '2g' });
    expect(m.staged).toBeNull();
    expect(m.reveal).toBeNull();
  });

  it('gives the engine reason for a use that is not possible', () => {
    const state = structuredClone(newToyGame(3));
    state.seats[0]!.data.coins = 0;
    const m = model(state);
    const priced = m.hand.find((c) => c.face.cost !== '');
    expect(priced).toBeDefined();
    const build = priced!.options.find((o) => o.use.id === 'build')!;
    expect(build.pick).toBeNull();
    expect(build.why).toBe('Not enough coins');
    expect(priced!.options.find((o) => o.use.id === 'sell')!.pick).not.toBeNull();
  });

  it('stages your pick and says who you wait for, without showing it to others', () => {
    let s = newToyGame(3);
    const card = s.seats[0]!.hand[0]!;
    s = act(s, { type: 'pick', seat: 0, pick: { card: card.id, use: 'sell' } });
    const mine = model(s, 0);
    expect(mine.staged?.card.id).toBe(card.id);
    expect(mine.staged?.use?.id).toBe('sell');
    expect(mine.canUnpick).toBe(true);
    expect(mine.status).toBe('Waiting for P1 and P2');
    expect(mine.seats[0]!.status).toBe('picked');

    const theirs = model(s, 1);
    expect(theirs.seats[0]!.status).toBe('picked');
    expect(theirs.staged).toBeNull();
    expect(theirs.status).toBe('Choose a card');
  });

  it('shows the reveal, fresh cards and the next pick after everyone picks', () => {
    const s = pickAll(newToyGame(3), (st, seat) => ({
      card: st.seats[seat]!.hand[0]!.id,
      use: seat === 0 ? 'stash' : 'sell',
    }));
    const m = model(s, 0);
    expect(m.round).toBe('Round 1 of 2 · Pick 2 of 3');
    expect(m.reveal?.lines.map((l) => l.verb)).toEqual(['stashed', 'sold', 'sold']);
    expect(m.reveal?.lines[0]!.you).toBe(true);
    expect(m.me?.zones[0]).toMatchObject({ id: 'stash', count: 1 });
    expect(m.me?.zones[0]!.cards?.[0]!.fresh).toBe(true);
    expect(m.hand).toHaveLength(3);
    expect(m.log.length).toBeGreaterThan(0);

    // The stash is owner-only: seat 1 sees how many, not which.
    const other = model(s, 1);
    expect(other.seats[0]!.zones[0]).toMatchObject({ count: 1, cards: null });
  });

  it('groups a tableau by kind in presenter order', () => {
    const s = structuredClone(newToyGame(3));
    s.seats[0]!.tableau = [
      { id: 900, def: 'toy-statue' },
      { id: 901, def: 'toy-well' },
      { id: 902, def: 'toy-school' },
    ];
    const m = model(s, 0);
    expect(m.me?.columns.map((c) => [c.kind.id, c.cards.map((x) => x.id)])).toEqual([
      ['basic', [901]],
      ['civic', [900, 902]],
    ]);
    expect(m.me?.counts.map((c) => c.n)).toEqual([1, 2]);
  });

  it('shows one neighbour at a two-seat table', () => {
    const m = model(newToyGame(2), 0);
    expect(m.left?.seat).toBe(1);
    expect(m.right).toBeNull();
  });

  it('offers the open prompt to its seat only', () => {
    const s = newToyGame(3, { opening: true });
    const mine = model(s, 0);
    expect(mine.phase).toBe('prompt');
    expect(mine.prompt?.title).toBe('Opening: take a coin?');
    expect(mine.prompt?.answers.map((a) => a.label)).toEqual(['+1 coin', 'No thanks']);
    expect(mine.status).toBe('Opening: take a coin?');
    const theirs = model(s, 1);
    expect(theirs.prompt).toBeNull();
    expect(theirs.status).toBe('Waiting for P0');
    expect(theirs.seats.map((x) => x.status)).toEqual(['thinking', 'idle', 'idle']);
  });

  it('builds the final scores in rank order', () => {
    const s = playOut(newToyGame(3));
    const m = model(s, 0);
    expect(m.phase).toBe('gameOver');
    expect(m.status).toBe('Game over');
    const r = m.result!;
    expect(r.columns).toHaveLength(3);
    const totals = r.columns.map((c) => c.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(r.columns[0]!.rank).toBe(1);
    expect(r.rows.map((row) => row.category)).toContain('treasury');
    for (const row of r.rows) expect(row.values).toHaveLength(3);
    expect(r.headline).toMatch(/wins?|share/);
  });

  it('gives a spectator no seat, hand or pass', () => {
    const m = model(newToyGame(3), 'spectator');
    expect(m.me).toBeNull();
    expect(m.hand).toEqual([]);
    expect(m.pass).toBeNull();
    expect(m.left).toBeNull();
  });
});

describe('listNames', () => {
  it('joins names in plain English', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['Ana'])).toBe('Ana');
    expect(listNames(['Ana', 'Cy'])).toBe('Ana and Cy');
    expect(listNames(['Ana', 'Cy', 'Dee'])).toBe('Ana, Cy and Dee');
  });
});
