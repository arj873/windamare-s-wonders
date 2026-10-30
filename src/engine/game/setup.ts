/** R2 setup of the unchanged systems, and what views hide of them (R1.11). */
import { HIDDEN_CARD, type Ctx, type Viewer } from '../core';
import type { WwRules } from './content';
import { honoursPerGame } from './options';
import { drawRaids } from './raid';
import type { WwSeat, WwTable } from './types';

/**
 * R2.3 Honours (public; none in a First game, R19.2), R2.6 Raids (face down; Spring's is
 * revealed by `onRoundStart(0)`).
 */
export function setupTable(rules: WwRules, ctx: Ctx<WwSeat, WwTable>): WwTable {
  const honours = ctx.rng
    .shuffle(rules.content.honours.map((h) => h.id))
    .slice(0, honoursPerGame(rules, ctx.state));
  // Nobody leads at the start: every measure is 0 (R11.2).
  return { honours, leaders: honours.map(() => []), raids: drawRaids(rules, ctx.rng) };
}

/** R2.2: starting coins, an empty store of every good, no labour, no Great Work yet. */
export function setupSeat(rules: WwRules): WwSeat {
  return {
    coins: rules.tunables.startingCoins,
    store: Object.fromEntries(rules.goods.map((g) => [g, 0])),
    labour: 0,
    greatWork: null,
    tiers: 0,
    valour: [],
    covers: [],
    sold: 0,
  };
}

/** R1.11: the Raids of later Seasons stay hidden (from everyone, players and spectators). */
export function maskTable(table: WwTable, _viewer: Viewer): WwTable {
  return {
    ...table,
    raids: table.raids.map((r) => (r.revealed ? r : { id: HIDDEN_CARD, revealed: false })),
  };
}
