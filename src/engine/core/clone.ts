import type { DraftState, Json } from './types';

/**
 * `out[k] = v`, except that a `"__proto__"` key (JSON.parse makes it an own key) stays an own
 * key instead of setting `out`'s prototype.
 */
function setKey(out: Record<string, unknown>, k: string, v: unknown): void {
  if (k === '__proto__') {
    Object.defineProperty(out, k, {
      value: v,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  } else out[k] = v;
}

/** Deep copy of plain JSON data (a state is JSON by contract). Keeps key order. */
export function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v: unknown) => cloneJson(v)) as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value)) {
    setKey(out, k, cloneJson((value as Record<string, unknown>)[k]));
  }
  return out as T;
}

/** applyAction's private draft: everything copied except `config` (fixed, shared). */
export function cloneState<S, T>(s: DraftState<S, T>): DraftState<S, T> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(s) as (keyof DraftState<S, T>)[]) {
    setKey(out, k, k === 'config' ? s.config : cloneJson(s[k]));
  }
  return out as unknown as DraftState<S, T>;
}

/** True for plain JSON only: finite numbers, no undefined, no class instances, no cycles. */
export function isJson(x: unknown, depth = 0): x is Json {
  if (depth > 64) return false;
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return true;
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every((v) => isJson(v, depth + 1));
  if (typeof x !== 'object') return false;
  const proto = Object.getPrototypeOf(x) as unknown;
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(x).every((v) => isJson(v, depth + 1));
}
