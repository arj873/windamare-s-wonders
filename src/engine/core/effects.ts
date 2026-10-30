/** Card definitions and the data-driven effect registry (docs/ENGINE.md §8). */
import type { CardDef, CardDefId, DraftState, EffectSpec, Ruleset, SeatId } from './types';

const DEF_MAPS = new WeakMap<object, Map<CardDefId, CardDef>>();

function defMap(rules: Pick<Ruleset, 'cards'>): Map<CardDefId, CardDef> {
  let map = DEF_MAPS.get(rules.cards);
  if (!map) {
    map = new Map(rules.cards.map((c) => [c.id, c]));
    DEF_MAPS.set(rules.cards, map);
  }
  return map;
}

/** The catalog entry for `id`, or undefined. */
export function findDef(rules: Pick<Ruleset, 'cards'>, id: CardDefId): CardDef | undefined {
  return defMap(rules).get(id);
}

/** The catalog entry for `id`; throws on an unknown id. */
export function defOf(rules: Pick<Ruleset, 'cards'>, id: CardDefId): CardDef {
  const def = findDef(rules, id);
  if (!def) throw new Error(`unknown card def: ${id}`);
  return def;
}

/**
 * A seat's active effects: the effects of its tableau cards in play order, then the ruleset's
 * extra sources (`activeEffects`). Only those of `type` if given.
 */
export function effectsOf<S, T>(
  rules: Ruleset<S, T>,
  state: DraftState<S, T>,
  seat: SeatId,
  type?: string,
): EffectSpec[] {
  const seatState = state.seats[seat];
  if (!seatState) throw new Error(`no seat ${seat}`);
  const all = seatState.tableau.flatMap((c) => defOf(rules, c.def).effects);
  if (rules.activeEffects) all.push(...rules.activeEffects(state, seat));
  return type === undefined ? all : all.filter((e) => e.type === type);
}

/** Sum of every active effect's `score`, per category. */
export function effectScore<S, T>(
  rules: Ruleset<S, T>,
  state: DraftState<S, T>,
  seat: SeatId,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of effectsOf(rules, state, seat)) {
    const part = rules.effects[spec.type]?.score?.(state, seat, spec);
    if (!part) continue;
    for (const [k, v] of Object.entries(part)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Catalog and registry problems (empty = fine): ids, effect types, effect params, seats. */
export function checkRuleset<S, T>(rules: Ruleset<S, T>): string[] {
  const errors: string[] = [];
  if (!rules.id) errors.push('ruleset id is empty');
  if (!Number.isInteger(rules.version)) errors.push('ruleset version is not an integer');
  if (!Number.isInteger(rules.minSeats) || rules.minSeats < 1) errors.push('minSeats < 1');
  if (!Number.isInteger(rules.maxSeats) || rules.maxSeats < rules.minSeats) {
    errors.push('maxSeats < minSeats');
  }
  if (rules.resolve.length === 0) errors.push('no resolve steps');
  const seen = new Set<CardDefId>();
  for (const card of rules.cards) {
    if (!card.id) errors.push(`card with empty id (${card.name})`);
    if (seen.has(card.id)) errors.push(`duplicate card id: ${card.id}`);
    seen.add(card.id);
    for (const spec of card.effects) {
      const handler = rules.effects[spec.type];
      if (!handler) {
        errors.push(`${card.id}: unknown effect type ${spec.type}`);
        continue;
      }
      const err = handler.validate?.(spec);
      if (err) errors.push(`${card.id}: ${spec.type}: ${err}`);
    }
  }
  return errors;
}
