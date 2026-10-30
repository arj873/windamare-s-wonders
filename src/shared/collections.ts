/** `[0, 1, ..., n-1]`. */
export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Counts occurrences of each key. */
export function countBy<T, K extends string | number>(items: readonly T[], key: (t: T) => K) {
  const out = new Map<K, number>();
  for (const it of items) out.set(key(it), (out.get(key(it)) ?? 0) + 1);
  return out;
}

/** Groups items by key, keeping input order within each group. */
export function groupBy<T, K extends string | number>(items: readonly T[], key: (t: T) => K) {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}

/** Index of the seat `delta` steps from `seat` around a table of `n` (negative = other way). */
export function seatOffset(seat: number, delta: number, n: number): number {
  return (((seat + delta) % n) + n) % n;
}
