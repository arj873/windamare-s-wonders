/** R9 Raids: drawn at setup, revealed each Season, resolved at Season end. */
import type { Ctx, Rng } from '../core';
import { HIDDEN_CARD, neighboursOf } from '../core';
import type { WwRules } from './content';
import { emit, gained, holdings, isEmpty } from './events';
import { addGains } from './gains';
import { activeEffects, guardOf, townOf } from './town';
import {
  SEASONS,
  type Gains,
  type RaidDef,
  type WwSeat,
  type WwState,
  type WwTable,
} from './types';

const drawRaid = (rules: WwRules, rng: Rng, season: number) =>
  rng.pick(rules.content.raids.filter((r) => r.season === SEASONS[season])).id;

/** R2.6: one Raid per Season, drawn at random from that Season's cards; all face down. */
export function drawRaids(rules: WwRules, rng: Rng): WwTable['raids'] {
  return SEASONS.map((_, season) => ({ id: drawRaid(rules, rng, season), revealed: false }));
}

/** Lookahead (`sampleHidden`): each Raid a view hid is drawn again the same way (R2.6). */
export function sampleHiddenRaids(rules: WwRules, state: WwState, rng: Rng): void {
  state.table.raids.forEach((raid, season) => {
    if (raid.id === HIDDEN_CARD) raid.id = drawRaid(rules, rng, season);
  });
}

/** R2.6, R3.2: the Season's Raid turns face up at the start of the Season. */
export function revealRaid(rules: WwRules, ctx: Ctx<WwSeat, WwTable>, season: number): void {
  const raid = ctx.state.table.raids[season];
  if (!raid || raid.revealed) return;
  raid.revealed = true;
  const def = rules.raid(raid.id);
  emit(
    ctx,
    { type: 'raidRevealed', season, raid: def.id, strength: def.strength },
    `${def.name} (strength ${def.strength}) threatens this Season.`,
  );
}

/** The current Season's Raid, if revealed. */
export function currentRaid(rules: WwRules, state: WwState): RaidDef | null {
  const raid = state.table.raids[state.round];
  return raid?.revealed ? rules.raid(raid.id) : null;
}

export type RaidOutcome = 'held' | 'plundered';

/**
 * R9.3 to R9.7 and `heldBonus`, at Season end. Every Guard is read before anything changes, so
 * seat order never matters (R9.3, R4.8). Returns each town's outcome, by seat.
 */
export function resolveRaid(rules: WwRules, ctx: Ctx<WwSeat, WwTable>): RaidOutcome[] {
  const { state } = ctx;
  const season = state.round;
  const raid = state.table.raids[season];
  if (!raid) throw new Error(`no Raid for Season ${season}`);
  const def = rules.raid(raid.id);
  const t = rules.tunables;
  const seats = state.seats.map((s) => s.id);
  const guards = seats.map((s) => guardOf(rules, state, s));
  const outcome: RaidOutcome[] = guards.map((g) => (g >= def.strength ? 'held' : 'plundered'));

  for (const s of seats) {
    const town = townOf(state, s);
    const guard = guards[s] ?? 0;
    const base = { type: 'raid', seat: s, raid: def.id, guard, strength: def.strength } as const;
    if (outcome[s] === 'held') {
      // R9.4: a Valour token worth the Season's value. R9.7: no surplus.
      const value = t.valourBySeason[season] ?? 0;
      town.data.valour.push(value);
      emit(
        ctx,
        { ...base, outcome: 'held', valour: value, lost: 0 },
        `${town.name} holds (Guard ${guard} vs ${def.strength}): Valour ${value}.`,
      );
    } else {
      // R9.5: coins only, at most all of them (R17.6).
      const lost = Math.min(town.data.coins, (def.strength - guard) * t.plunderPerPoint);
      town.data.coins -= lost;
      emit(
        ctx,
        { ...base, outcome: 'plundered', valour: 0, lost },
        `${town.name} is plundered (Guard ${guard} vs ${def.strength}): -${lost} coins.`,
      );
    }
  }

  // R9.6: after all plunder, each plundered town pays a bounty to each neighbour that held, from
  // the coins it has left, left neighbour first (each neighbour once, R14.5; none at 0, R17.6).
  // A plundered town only pays and a held one only takes, so the order of towns does not matter.
  for (const p of seats) {
    if (outcome[p] !== 'plundered') continue;
    const payer = townOf(state, p);
    for (const n of neighboursOf(state, p)) {
      if (outcome[n] !== 'held') continue;
      const bounty = Math.min(t.bountyPerNeighbour, payer.data.coins);
      if (bounty === 0) continue;
      payer.data.coins -= bounty;
      const taker = townOf(state, n);
      taker.data.coins += bounty;
      emit(
        ctx,
        { type: 'bounty', from: p, to: n, coins: bounty },
        `${taker.name} takes a bounty of ${bounty} from ${payer.name}.`,
      );
    }
  }
  // R13 heldBonus: after R9.6, each time the town holds.
  for (const s of seats) {
    if (outcome[s] !== 'held') continue;
    const town = townOf(state, s);
    const before = holdings(town.data);
    for (const e of activeEffects(rules, state, s, 'heldBonus')) {
      addGains(town.data, e.spec.gains as Gains);
    }
    const gains = gained(before, holdings(town.data));
    if (!isEmpty(gains))
      emit(ctx, { type: 'heldBonus', seat: s, gains }, `${town.name}'s defenders are rewarded.`);
  }
  return outcome;
}

/**
 * R3.6: every "at Season end" effect, in seat order, after the Raid. (Here rather than as the
 * core's per-effect round-end hook, so that the Honours can be updated after them.)
 */
export function seasonEndEffects(rules: WwRules, ctx: Ctx<WwSeat, WwTable>): void {
  for (const s of ctx.state.seats) {
    const before = holdings(s.data);
    for (const e of activeEffects(rules, ctx.state, s.id, 'seasonEnd')) {
      addGains(s.data, e.spec.gains as Gains);
    }
    const gains = gained(before, holdings(s.data));
    if (!isEmpty(gains))
      emit(ctx, { type: 'seasonEnd', seat: s.id, gains }, `${s.name} gathers its stores.`);
  }
}
