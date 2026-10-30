import { describe, expect, it } from 'vitest';
import { TextGame } from './game';
import { cardsText, engine, isWaiting, statusText, waitingNames, type View } from './render';

describe('render (shared by the text and browser layers)', () => {
  const game = new TextGame({ seats: 3, humans: [0, 1], seed: 'render', level: 'easy' });
  game.run(0, 'choose', ['1'], {});
  game.run(1, 'choose', ['2'], {});
  const view = (seat: number) => engine.viewFor(game.state, seat) as View;

  it('prints the same words whether it is given the engine view or goes through TextGame', () => {
    expect(statusText(view(0), 0)).toBe(game.status(0));
    expect(cardsText(view(1), 1)).toBe(game.cards(1));
  });

  it('works from a JSON copy of the view, as the browser layer gets it from the page', () => {
    const copy = JSON.parse(JSON.stringify(view(0))) as View;
    expect(statusText(copy, 0)).toBe(statusText(view(0), 0));
    expect(cardsText(copy, 0)).toBe(cardsText(view(0), 0));
    expect(isWaiting(copy, 0)).toBe(true);
  });

  it('names who the table waits for, and says "you" for the asking seat', () => {
    game.run(0, 'pick', ['1', 'spend'], {});
    expect(waitingNames(view(0), 0)).toBe('Seat2');
    expect(waitingNames(view(1), 1)).toBe('you');
  });

  it("shows no other hand: a card only in the other seat's hand never appears in this seat's text", () => {
    const names = (seat: number) =>
      cardsText(view(seat), seat)
        .split('\n')
        .filter((l) => /^\d+\. /.test(l))
        .map((l) => l.replace(/^\d+\. /, '').split(' [')[0] ?? '');
    const mine = names(0);
    const onlyTheirs = names(1).filter((n) => !mine.includes(n));
    expect(mine.length).toBeGreaterThan(0);
    expect(onlyTheirs.length).toBeGreaterThan(0);
    for (const n of onlyTheirs) expect(statusText(view(0), 0)).not.toContain(n);
  });
});
