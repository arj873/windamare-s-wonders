import { describe, expect, it } from 'vitest';
import { clockMs, parseClientMessage } from './protocol';

const msg = (m: Record<string, unknown>) => parseClientMessage({ v: 1, ...m });

describe('picks on the wire', () => {
  it('accepts a single card and a multi-card pick, rebuilt from known fields', () => {
    expect(msg({ type: 'pick', pick: { card: 3, use: 'spend' } })).toMatchObject({
      pick: { card: 3, use: 'spend' },
    });
    const many = msg({
      type: 'pick',
      pick: {
        cards: [
          { card: 1, use: 'build', args: { pay: [1] } },
          { card: 2, use: 'spend' },
        ],
      },
    });
    expect(many).toMatchObject({ pick: { cards: [{ card: 1 }, { card: 2 }] } });
  });

  it('rejects extra keys, bad cards and oversized card lists', () => {
    expect(() => msg({ type: 'pick', pick: { card: 1, use: 'x', seat: 2 } })).toThrow();
    expect(() => msg({ type: 'pick', pick: { cards: [{ card: -1, use: 'x' }] } })).toThrow();
    expect(() => msg({ type: 'pick', pick: { cards: [], seat: 1 } })).toThrow();
    const five = Array.from({ length: 5 }, (_, i) => ({ card: i, use: 'spend' }));
    expect(() => msg({ type: 'pick', pick: { cards: five } })).toThrow();
  });
});

describe('clock presets (R15.3)', () => {
  it('follows the turn table, the multipliers and rounds up', () => {
    expect([0, 1, 2, 3, 4].map((t) => clockMs('normal', 'pick', t))).toEqual([
      90_000, 70_000, 55_000, 40_000, 40_000,
    ]);
    expect([0, 1, 2, 3].map((t) => clockMs('fast', 'pick', t))).toEqual([
      45_000, 35_000, 28_000, 20_000,
    ]);
    expect(clockMs('relaxed', 'prompt', 0)).toBe(90_000);
    expect(clockMs('off', 'pick', 0)).toBeNull();
  });
});
