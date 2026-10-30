import { describe, expect, it } from 'vitest';
import { assertNever, cloneJson, countBy, groupBy, invariant, range, seatOffset } from './index';

describe('shared', () => {
  it('range', () => expect(range(3)).toEqual([0, 1, 2]));
  it('countBy', () => expect(countBy(['a', 'b', 'a'], (x) => x).get('a')).toBe(2));
  it('groupBy keeps order', () =>
    expect(groupBy([1, 2, 3, 4], (x) => x % 2).get(0)).toEqual([2, 4]));
  it('seatOffset wraps both ways', () => {
    expect(seatOffset(0, -1, 4)).toBe(3);
    expect(seatOffset(3, 1, 4)).toBe(0);
  });
  it('cloneJson is deep', () => {
    const a = { x: [1] };
    const b = cloneJson(a);
    b.x.push(2);
    expect(a.x).toEqual([1]);
  });
  it('invariant throws', () => expect(() => invariant(false, 'x')).toThrow('invariant: x'));
  it('assertNever throws', () => expect(() => assertNever('z' as never)).toThrow());
});
