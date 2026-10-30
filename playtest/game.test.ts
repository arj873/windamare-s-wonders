import { describe, expect, it } from 'vitest';
import { TextGame } from './game';

/** A scripted human: Build when the first card can be built, else Spend. Uses only the text. */
function playHuman(g: TextGame, seat: number, log: string[]): void {
  for (let guard = 0; guard < 200 && !g.over && g.waiting(seat); guard++) {
    const status = g.run(seat, 'status', [], {}).out;
    log.push(status);
    if (status.includes('Choose your Great Work')) {
      log.push(g.run(seat, 'choose', ['1'], {}).out);
      continue;
    }
    const cards = g.run(seat, 'cards', [], {}).out;
    log.push(cards);
    const lines = cards.split('\n');
    // First card whose Build line is possible, else card 1 Spend.
    let n = 1;
    let use = 'spend';
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\d+)\. /.exec(lines[i]!);
      if (m && lines[i + 1] && !lines[i + 1]!.includes('not possible')) {
        n = Number(m[1]);
        use = 'build';
        break;
      }
    }
    const out = g.run(seat, 'pick', [String(n), use], {}).out;
    log.push(out);
    expect(out, out).not.toMatch(/^(Cannot|Refused|Usage|No card)/);
  }
}

describe('TextGame', () => {
  it('a human seat plays a whole 3-seat game through the text commands', () => {
    const g = new TextGame({ seats: 3, humans: [0], seed: 'pt-1', level: 'easy' });
    const log: string[] = [];
    for (let i = 0; i < 400 && !g.over; i++) playHuman(g, 0, log);
    expect(g.over).toBe(true);
    expect(g.run(0, 'result', [], {}).out).toContain('Final scores');
    expect(g.probe(0).ready).toBe(true);
  });

  it('plays 2 seats (Burn) and 7 seats to the end', () => {
    for (const seats of [2, 7]) {
      const g = new TextGame({ seats, humans: [0], seed: `pt-${seats}`, level: 'easy' });
      const log: string[] = [];
      for (let i = 0; i < 400 && !g.over; i++) playHuman(g, 0, log);
      expect(g.over, `${seats} seats`).toBe(true);
    }
  });

  it('two humans: neither sees the other hand, and wait/probe says whose turn it is', () => {
    const g = new TextGame({ seats: 3, humans: [0, 1], seed: 'pt-hidden', level: 'easy' });
    g.run(0, 'choose', ['1'], {});
    expect(g.probe(0).ready).toBe(false);
    g.run(1, 'choose', ['1'], {});
    expect(g.probe(0).ready).toBe(true);
    const names = (seat: number) =>
      g
        .cards(seat)
        .split('\n')
        .filter((l) => /^\d+\. /.test(l))
        .map((l) => l.replace(/^\d+\. /, '').split(' [')[0]!);
    // A card in the other hand must not be printed as part of this seat's cards or status.
    const mine = names(0);
    const theirs = names(1);
    expect(mine.length).toBeGreaterThan(0);
    const status0 = g.status(0);
    for (const n of theirs.filter((x) => !mine.includes(x))) {
      expect(status0, `seat 1's status shows seat 2's card ${n}`).not.toContain(n);
    }
    // The pick stays hidden until everyone has played.
    g.run(0, 'pick', ['1', 'spend'], {});
    expect(g.probe(0).ready).toBe(false);
    expect(g.status(1)).not.toContain('You picked');
    expect(g.status(0)).toContain('You picked');
    expect(g.run(0, 'unpick', [], {}).out).toContain('withdrawn');
  });

  it('refuses bad input with a message instead of throwing', () => {
    const g = new TextGame({ seats: 3, humans: [0], seed: 'pt-bad', level: 'easy' });
    expect(g.run(0, 'pick', ['1', 'spend'], {}).out).toContain('question to answer first');
    expect(g.run(0, 'choose', ['9'], {}).out).toContain('Choose one of');
    g.run(0, 'choose', ['2'], {});
    expect(g.run(0, 'pick', ['99', 'spend'], {}).out).toContain('No card 99');
    expect(g.run(0, 'pick', ['1', 'dance'], {}).out).toContain('Usage');
    expect(g.run(0, 'pick', ['1', 'build'], { pay: 'bank,bank,bank,bank,bank,bank' }).out).toMatch(
      /--pay|Cannot/,
    );
    expect(g.run(0, 'pick', ['1', 'spend'], { any: 'unobtainium' }).out).toContain('unknown good');
    // Nothing is missing on a coin-only Build, so `--pay auto` has nothing to override.
    expect(g.run(0, 'pick', ['1', 'build'], { pay: 'auto' }).out).not.toContain('--pay');
    g.run(0, 'unpick', [], {});
    expect(g.run(0, 'fly', [], {}).out).toContain('Unknown command');
    expect(g.run(1, 'status', [], {}).out).toContain('is a bot');
  });

  it('is deterministic: same seed and commands give the same text', () => {
    const run = () => {
      const g = new TextGame({ seats: 4, humans: [0], seed: 'pt-det', level: 'medium' });
      const log: string[] = [];
      for (let i = 0; i < 400 && !g.over; i++) playHuman(g, 0, log);
      return log.join('\n--\n');
    };
    expect(run()).toBe(run());
  });
});
