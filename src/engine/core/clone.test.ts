import { describe, expect, it } from 'vitest';
import { cloneJson, cloneState } from './clone';
import { newToyGame } from './testing/helpers';
import type { ToyState } from './testing/toy';

// JSON.parse turns a "__proto__" key into an own property; a copy must keep it that way.
const evil = '{"a":{"__proto__":{"polluted":true},"b":1}}';

describe('cloneJson', () => {
  it('copies deeply and keeps key order', () => {
    const src = { z: 1, a: [{ y: 2, x: [3] }], m: null };
    const out = cloneJson(src);
    expect(out).toEqual(src);
    expect(Object.keys(out)).toEqual(['z', 'a', 'm']);
    expect(out.a[0]).not.toBe(src.a[0]);
  });

  it('keeps a "__proto__" key as an own key, never as the prototype (qa Q0-E1)', () => {
    const src = JSON.parse(evil) as { a: Record<string, unknown> };
    const out = cloneJson(src);
    expect(Object.getPrototypeOf(out.a)).toBe(Object.prototype);
    expect(out.a.polluted).toBeUndefined();
    expect(Object.hasOwn(out.a, '__proto__')).toBe(true);
    expect(JSON.stringify(out)).toBe(evil);
  });

  it('cloneState keeps a "__proto__" key own at the top level and inside', () => {
    const state = newToyGame(2);
    const parsed = JSON.parse(
      JSON.stringify(state).replace('{', '{"__proto__":{"polluted":true},'),
    ) as ToyState & Record<string, unknown>;
    (parsed.table as unknown as Record<string, unknown>).x = JSON.parse(evil);
    const out = cloneState(parsed) as ToyState & Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.polluted).toBeUndefined();
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    const x = (out.table as unknown as { x: { a: Record<string, unknown> } }).x;
    expect(Object.getPrototypeOf(x.a)).toBe(Object.prototype);
    expect(x.a.polluted).toBeUndefined();
  });
});
