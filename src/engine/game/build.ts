/**
 * Placing a Build: the card rules of R7.8 (Landmarks) and R7.9 (upgrades). Paying for it (R6)
 * belongs to the turn structure and waits for D2c; this file never touches coins or goods.
 */
import type { Card, CardDefId, CardId, Ctx, Json, SeatId } from '../core';
import type { WwRules } from './content';
import { upgradesAllowed } from './options';
import { townOf, uncovered } from './town';
import type { Gains, WwSeat, WwState, WwTable } from './types';

/** The public seat zone of covered cards (R7.9, R17.7). */
export const COVERED = 'covered';

/**
 * null = the town may place `defId` (covering `cover`, if given) as far as R7.8 and R7.9 go.
 * Affordability is checked by the turn code.
 */
export function checkBuildRules(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  defId: CardDefId,
  cover: CardId | null,
): string | null {
  const def = rules.card(defId);
  const cards = uncovered(state, seat);
  // R7.8: at most one copy of each Landmark per town. Landmarks are never covered.
  if (def.kind === 'landmark' && cards.some((c) => c.def === defId)) {
    return `${def.name} is already in your town`;
  }
  if (cover === null) return null;
  // R19.3: a First game has no upgrades; an upgrade card is built at its full cost.
  if (!upgradesAllowed(rules, state)) return 'a First game has no upgrades: build at full cost';
  // R7.9: an upgrade names one uncovered card it upgrades.
  if (!def.upgrade) return `${def.name} upgrades nothing`;
  const target = cards.find((c) => c.id === cover);
  if (!target) return `card ${cover} is not an uncovered card in your town`;
  if (!def.upgrade.of.includes(target.def)) {
    return `${def.name} does not upgrade ${rules.card(target.def).name}`;
  }
  return null;
}

/** R7.9: the upgrade cost when covering a card, the full cost otherwise. */
export function buildCost(rules: WwRules, defId: CardDefId, cover: CardId | null): Gains {
  const def = rules.card(defId);
  if (cover === null) return def.cost;
  if (!def.upgrade) throw new Error(`${defId} upgrades nothing`);
  return def.upgrade.cost;
}

/**
 * Place a Build that `checkBuildRules` allowed: the covered card (if any) moves under it into
 * the `covered` zone first, so it counts for nothing from then on (R7.9, R7.10); then the card
 * joins the town and its "when built" effects run (R4.5 step 2).
 */
export function placeBuild(
  rules: WwRules,
  ctx: Ctx<WwSeat, WwTable>,
  seat: SeatId,
  card: Card,
  cover: CardId | null,
  args?: Json,
): void {
  const err = checkBuildRules(rules, ctx.state, seat, card.def, cover);
  if (err) throw new Error(`placeBuild: ${err}`);
  if (cover !== null) {
    ctx.place(seat, COVERED, ctx.take(cover));
    townOf(ctx.state, seat).data.covers.push({ card: cover, by: card.id });
  }
  ctx.play(seat, card, args);
}
