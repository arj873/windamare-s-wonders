/** E8: log lines in pieces, read as the viewer ("You discard ..."), core/log.ts. */
import { describe, expect, it } from 'vitest';
import { createDraftEngine, type DraftEngine } from './engine';
import { andList, joinParts, logText, named } from './log';
import { toy, toyConfig } from './testing/helpers';
import { toyRuleset, type ToySeat, type ToyTable } from './testing/toy';
import type { LogEntry } from './types';

const entry = (more: Partial<LogEntry>): LogEntry => ({
  seq: 1,
  round: 0,
  turn: 0,
  seat: null,
  kind: 'x',
  text: '',
  ...more,
});

/** A whole game by default actions. */
function playToEnd(engine: DraftEngine<ToySeat, ToyTable>) {
  let s = engine.createGame(toyConfig(3));
  while (s.phase.kind !== 'gameOver') {
    const seat = engine.waitingOn(s)[0]!;
    const r = engine.applyAction(s, engine.defaultAction(s, seat)!);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

describe('log lines a viewer reads as "You" (E8)', () => {
  it('logText reads a seat piece as "you" for that seat only; no pieces: the text', () => {
    const parts = [
      named(1, 'P1 sells', 'You sell'),
      ' 1 wax to ',
      named(2, 'P2', 'you'),
      ' for 3.',
    ];
    const e = entry({ seat: 1, text: joinParts(parts), parts, targets: [2] });
    expect(e.text).toBe('P1 sells 1 wax to P2 for 3.');
    expect(logText(e, 1)).toBe('You sell 1 wax to P2 for 3.');
    expect(logText(e, 2)).toBe('P1 sells 1 wax to you for 3.');
    for (const viewer of [0, 'spectator', null] as const) expect(logText(e, viewer)).toBe(e.text);
    expect(logText(entry({ text: 'Hands pass left.' }), 0)).toBe('Hands pass left.');
  });

  it('andList: "A and B", capitalised only where the line starts', () => {
    const name = (s: number) => `P${s}`;
    const at = (parts: ReturnType<typeof andList>, v: number) =>
      logText({ text: joinParts(parts), parts }, v);
    expect(at(andList([0, 2], name, true), 0)).toBe('You and P2');
    expect(at(andList([0, 2], name, true), 2)).toBe('P0 and you');
    expect(at(andList([0, 2], name, false), 0)).toBe('you and P2');
    expect(joinParts(andList([0, 1, 2], name, true))).toBe('P0 and P1 and P2');
  });

  it('ctx.log keeps the joined text, the pieces (copied) and the targets; plain lines get neither', () => {
    const s = playToEnd(toy);
    const pass = s.log.find((e) => e.kind === 'pass')!;
    expect(pass.parts).toBeUndefined();
    expect(pass.targets).toBeUndefined();
    // The toy deals 4 and picks 3: one leftover a seat each round.
    const left = s.log.filter((e) => e.kind === 'leftovers');
    expect(left.length).toBeGreaterThan(0);
    for (const e of left) {
      expect(e.text).toBe(`P${e.seat} discards 1 leftover card.`);
      expect(joinParts(e.parts!)).toBe(e.text);
      expect(logText(e, e.seat)).toBe('You discard 1 leftover card.');
      expect(e.targets).toBeUndefined();
    }
  });

  it('game over names the winners as targets: "you win", or a tie read by each winner', () => {
    // Seat 2 scores most.
    const s = playToEnd(
      createDraftEngine({ ...toyRuleset, score: (_s, seat) => ({ civic: seat }) }),
    );
    const over = s.log.at(-1)!;
    expect(over.kind).toBe('gameOver');
    expect(over.targets).toEqual([2]);
    expect(over.text).toBe('Game over: P2 wins.');
    expect(logText(over, 2)).toBe('Game over: you win.');
    expect(logText(over, 0)).toBe(over.text);

    const tie = playToEnd(
      createDraftEngine({ ...toyRuleset, score: () => ({}), tiebreak: () => [] }),
    );
    const end = tie.log.at(-1)!;
    expect(end.targets).toEqual([0, 1, 2]);
    expect(end.text).toBe('Game over: P0 and P1 and P2 tie.');
    expect(logText(end, 1)).toBe('Game over: P0 and you and P2 tie.');
    expect(logText(end, 0)).toBe('Game over: you and P1 and P2 tie.');
  });

  it('views keep the pieces and targets of the entries they show', () => {
    const s = playToEnd(toy);
    for (const viewer of [0, 2, 'spectator'] as const) {
      expect(toy.viewFor(s, viewer).log).toEqual(s.log.filter((e) => !e.to));
    }
  });

  it('E9: a seat named "You" (the tutorial) reads its second person in `text` and for everyone', () => {
    const top = createDraftEngine({ ...toyRuleset, score: (_s, seat) => ({ civic: -seat }) });
    let s = top.createGame({
      ...toyConfig(3),
      seats: [{ name: 'You' }, { name: 'P1' }, { name: 'P2' }],
    });
    while (s.phase.kind !== 'gameOver') {
      const r = top.applyAction(s, top.defaultAction(s, top.waitingOn(s)[0]!)!);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const left = s.log.filter((e) => e.kind === 'leftovers');
    const mine = left.find((e) => e.seat === 0)!;
    for (const viewer of [0, 1, 'spectator', null] as const) {
      expect(logText(mine, viewer)).toBe('You discard 1 leftover card.');
    }
    expect(mine.text).toBe('You discard 1 leftover card.');
    expect(left.find((e) => e.seat === 1)!.text).toBe('P1 discards 1 leftover card.');
    expect(s.log.at(-1)!.text).toBe('Game over: you win.');
  });
});
