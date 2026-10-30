/**
 * Gains and costs (R5.1, R6.1, R13): `{ <good id>: n, coins: n, labour: n, any: n }`. Goods are
 * whatever the content lists; nothing here names one.
 */
import type { Json } from '../core';
import type { Gains, GoodId, WwSeat } from './types';

export const COINS = 'coins';
export const LABOUR = 'labour';
/** One good of the town's choice per unit, named by the pick (R4.3, R13.4). */
export const ANY = 'any';

/** Keys a gains object may use besides the goods. */
export interface GainsAllow {
  labour?: boolean;
  any?: boolean;
  /** `{}` allowed (a free cost, an empty Spend band). */
  empty?: boolean;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** null = fine: a plain object of known keys with positive integer amounts. */
export function checkGains(
  goods: readonly GoodId[],
  x: Json | undefined,
  allow: GainsAllow = {},
): string | null {
  if (!isRecord(x)) return 'gains must be an object';
  const keys = Object.keys(x);
  if (keys.length === 0 && !allow.empty) return 'gains are empty';
  for (const k of keys) {
    const known =
      goods.includes(k) ||
      k === COINS ||
      (k === LABOUR && allow.labour === true) ||
      (k === ANY && allow.any === true);
    if (!known) return `unknown gain ${k}`;
    const v = x[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
      return `${k} must be a positive integer`;
    }
  }
  return null;
}

/** How many "any" units `gains` holds. */
export function anyCount(gains: Gains): number {
  return gains[ANY] ?? 0;
}

/** `gains` with its "any" units replaced by the chosen goods (one per unit, R5.1). */
export function resolveAny(gains: Gains, chosen: readonly GoodId[]): Gains {
  const n = anyCount(gains);
  if (chosen.length !== n) throw new Error(`${n} "any" good(s) need ${n} choice(s)`);
  const out: Gains = {};
  for (const [k, v] of Object.entries(gains)) if (k !== ANY) out[k] = v;
  for (const g of chosen) out[g] = (out[g] ?? 0) + 1;
  return out;
}

/** a + b. */
export function sumGains(a: Gains, b: Gains): Gains {
  const out: Gains = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Sum of goods in a store. */
export function storeTotal(store: Record<GoodId, number>): number {
  return Object.values(store).reduce((a, b) => a + b, 0);
}

/**
 * Add gains to a town. Labour only ever goes up (R8.2): gains are positive (checked by the
 * content check). Throws on `any`: that good is chosen by a pick, which the turn code resolves
 * into a named good before it gets here.
 */
export function addGains(town: WwSeat, gains: Gains, times = 1): void {
  for (const [k, v] of Object.entries(gains)) {
    const n = v * times;
    if (k === COINS) town.coins += n;
    else if (k === LABOUR) town.labour += n;
    else if (k === ANY) throw new Error('an "any" gain needs a good chosen by the pick (R13.4)');
    else if (k in town.store) town.store[k] = (town.store[k] ?? 0) + n;
    else throw new Error(`unknown good ${k}`);
  }
}
