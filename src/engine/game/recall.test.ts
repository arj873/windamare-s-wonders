/** R15.8 Recall, on the real engine (test fixture). */
import { describe, expect, it } from 'vitest';
import { fxEngine as e, newGame, playTurn } from './testing/helpers';

describe('Recall (R15.8)', () => {
  it('R15.8 a town may look at each hand it passed on, until the Season ends', () => {
    let s = newGame(3);
    const turns: number[] = [];
    for (let t = 0; t < 4; t++) {
      s = playTurn(s);
      turns.push(t);
      // The latest entry is the hand its left neighbour now holds (Spring passes left).
      expect(s.seats[0]!.recall.map((r) => r.turn)).toEqual(turns);
      expect(s.seats[0]!.recall.at(-1)).toEqual({ turn: t, to: 1, cards: s.seats[1]!.hand });
    }
    expect(e.viewFor(s, 0).seats[0]!.recall).toHaveLength(4);
    expect(e.viewFor(s, 2).seats[0]!.recall).toEqual([]); // owner only
    s = playTurn(s); // the fifth turn: nothing passes; the Season ends
    expect(s.round).toBe(1);
    expect(s.seats.every((t) => t.recall.length === 0)).toBe(true);
  });

  it('R15.8 with 2 towns the hand passed on excludes the picked and the burned card', () => {
    let s = newGame(2);
    s = playTurn(s);
    const [entry] = s.seats[0]!.recall;
    expect(entry?.cards).toHaveLength(8);
    expect(entry?.cards).toEqual(s.seats[1]!.hand);
  });
});
