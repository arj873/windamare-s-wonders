/** Throws on an impossible case; in a `switch` default it also makes TypeScript check exhaustiveness. */
export function assertNever(x: never, message = 'unreachable'): never {
  throw new Error(`${message}: ${JSON.stringify(x)}`);
}

/** Throws unless `cond` holds. */
export function invariant(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`invariant: ${message}`);
}
