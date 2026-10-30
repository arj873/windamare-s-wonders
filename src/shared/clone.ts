/** Deep copy of JSON-safe data (game state is JSON-safe by contract). */
export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}
