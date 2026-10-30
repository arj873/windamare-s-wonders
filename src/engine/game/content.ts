/**
 * Content in, rules out: lookups, the effect registry and the R16 tunables, plus `checkContent`,
 * which design's content tests run on `src/content/`.
 */
import type { CardDefId, EffectHandler, EffectSpec } from '../core';
import { makeEffects } from './effects';
import { ANY, COINS, LABOUR, checkGains } from './gains';
import {
  KINDS,
  MEASURES,
  SEASONS,
  type GoodId,
  type GreatWorkDef,
  type HonourDef,
  type Kind,
  type Measure,
  type RaidDef,
  type Season,
  type WwCardDef,
  type WwContent,
  type WwSeat,
  type WwTable,
  type WwTunables,
} from './types';

/** Seat counts with their own card counts (`WwCardDef.counts` index i = 3 + i seats). */
export const SEAT_COUNTS = [3, 4, 5, 6, 7] as const;

/** R2.7: the `counts` index for `seats` (2 seats use the 4-seat counts). */
export function countsIndex(seats: number): number {
  return seats === 2 ? 1 : Math.min(Math.max(seats, 3), 7) - 3;
}

/** R16, the numbers this code uses. */
export const DEFAULT_TUNABLES: WwTunables = {
  startingCoins: 5,
  honoursPerGame: 3,
  greatWorksOffered: 2,
  handSize: 6,
  turnsPerSeason: 5,
  bankPrice: 5,
  exchangeRate: 2,
  buyLimit: 2,
  marketPrice: [1, 2, 3, 4],
  valourBySeason: [1, 2, 3, 4],
  plunderPerPoint: 1,
  bountyPerNeighbour: 1,
  loreRunScores: [1, 3, 6, 10, 14, 18],
  honourSole: 5,
  honourTied: 2,
  coinsPerRenown: 4,
};

export interface WwRules {
  readonly content: WwContent;
  readonly tunables: WwTunables;
  /** Good ids in goods order (R1.3). */
  readonly goods: readonly GoodId[];
  readonly effects: Record<string, EffectHandler<WwSeat, WwTable>>;
  /** Lookups; each throws on an unknown id. */
  card(id: CardDefId): WwCardDef;
  greatWork(id: string): GreatWorkDef;
  raid(id: string): RaidDef;
  honour(id: string): HonourDef;
}

function lookup<D extends { id: string }>(what: string, defs: readonly D[]): (id: string) => D {
  const map = new Map(defs.map((d) => [d.id, d]));
  return (id) => {
    const d = map.get(id);
    if (!d) throw new Error(`unknown ${what}: ${id}`);
    return d;
  };
}

/** Builds the rules without checking them (checkContent uses it on bad content too). */
function buildRules(content: WwContent): WwRules {
  const effects: WwRules['effects'] = {};
  const rules: WwRules = {
    content,
    tunables: { ...DEFAULT_TUNABLES, ...content.tunables },
    goods: content.goods.map((g) => g.id),
    effects,
    card: lookup('card', content.cards),
    greatWork: lookup('Great Work', content.greatWorks),
    raid: lookup('Raid', content.raids),
    honour: lookup('Honour', content.honours),
  };
  // The handlers read the finished rules (lookups, tunables), so they are added last.
  Object.assign(effects, makeEffects(rules));
  return rules;
}

/** The rules for `content`; throws with every problem `checkContent` finds. */
export function compileContent(content: WwContent): WwRules {
  const problems = checkContent(content);
  if (problems.length > 0) throw new Error(`bad content: ${problems.join('; ')}`);
  return buildRules(content);
}

const isCount = (x: unknown, min = 0): boolean =>
  typeof x === 'number' && Number.isInteger(x) && x >= min;

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

/** Every problem with the content; empty = fine. */
export function checkContent(content: WwContent): string[] {
  const errors: string[] = [];
  const rules = buildRules(content);
  const { goods } = rules;

  // Goods (R1.3): data, never one of the reserved gain keys.
  if (goods.length === 0) errors.push('no goods');
  for (const id of duplicates(goods)) errors.push(`duplicate good ${id}`);
  for (const id of goods) {
    if (!id) errors.push('good with empty id');
    if (id === COINS || id === LABOUR || id === ANY) errors.push(`good id ${id} is reserved`);
  }

  const checkEffects = (where: string, effects: readonly EffectSpec[], anyOk: boolean) => {
    for (const spec of effects) {
      const handler = rules.effects[spec.type];
      if (!handler) {
        errors.push(`${where}: unknown effect type ${spec.type}`);
        continue;
      }
      const err = handler.validate?.(spec);
      if (err) errors.push(`${where}: ${spec.type}: ${err}`);
      // R13.4: "any" only in Spend bands and a card's own onBuild.
      const gains = spec.gains;
      const anyHere = typeof gains === 'object' && gains !== null && ANY in gains;
      if (anyHere && !(anyOk && spec.type === 'onBuild')) {
        errors.push(`${where}: ${spec.type}: "any" is not allowed here (R13.4)`);
      }
    }
  };

  // Cards.
  const seasonOf = new Map(content.cards.map((c) => [c.id, c.season]));
  for (const id of duplicates(content.cards.map((c) => c.id))) errors.push(`duplicate card ${id}`);
  for (const card of content.cards) {
    const at = card.id || `card "${card.name}"`;
    if (!card.id) errors.push(`${at}: empty id`);
    if (!KINDS.includes(card.kind as Kind)) errors.push(`${at}: unknown kind ${card.kind}`);
    if (!SEASONS.includes(card.season as Season))
      errors.push(`${at}: unknown season ${card.season}`);
    const cost = checkGains(goods, card.cost, { empty: true });
    if (cost) errors.push(`${at}: cost: ${cost}`);
    const spend = checkGains(goods, card.spend, { labour: true, any: true, empty: true });
    if (spend) errors.push(`${at}: spend: ${spend}`);
    if (
      !Array.isArray(card.counts) ||
      card.counts.length !== 5 ||
      !card.counts.every((n) => isCount(n))
    ) {
      errors.push(`${at}: counts must be 5 counts (3 to 7 seats)`);
    }
    if (card.upgrade) {
      const upCost = checkGains(goods, card.upgrade.cost, { empty: true });
      if (upCost) errors.push(`${at}: upgrade cost: ${upCost}`);
      if (card.upgrade.of.length === 0) errors.push(`${at}: upgrade of nothing`);
      for (const of of card.upgrade.of) {
        const s = seasonOf.get(of);
        if (s === undefined) errors.push(`${at}: upgrades unknown card ${of}`);
        else if (SEASONS.indexOf(s) >= SEASONS.indexOf(card.season)) {
          errors.push(`${at}: upgrades ${of}, which is not from an earlier Season`);
        }
      }
    }
    checkEffects(at, card.effects, true);
  }

  // Great Works (R8.1): a Perk and four tiers with rising thresholds.
  for (const id of duplicates(content.greatWorks.map((g) => g.id))) {
    errors.push(`duplicate Great Work ${id}`);
  }
  for (const gw of content.greatWorks) {
    checkEffects(`${gw.id} perk`, gw.perk, false);
    if (gw.tiers.length !== 4) errors.push(`${gw.id}: ${gw.tiers.length} tiers, not 4`);
    let prev = 0;
    gw.tiers.forEach((tier, i) => {
      if (!isCount(tier.threshold, 1) || tier.threshold <= prev) {
        errors.push(`${gw.id} tier ${i + 1}: threshold ${tier.threshold} does not rise`);
      }
      prev = tier.threshold;
      checkEffects(`${gw.id} tier ${i + 1}`, tier.reward, false);
    });
  }

  // Raids (R1.9, R2.6): at least one per Season.
  for (const id of duplicates(content.raids.map((r) => r.id))) errors.push(`duplicate Raid ${id}`);
  for (const raid of content.raids) {
    if (!SEASONS.includes(raid.season as Season))
      errors.push(`${raid.id}: unknown season ${raid.season}`);
    if (!isCount(raid.strength)) errors.push(`${raid.id}: strength must be a count`);
  }
  for (const s of SEASONS) {
    if (!content.raids.some((r) => r.season === s)) errors.push(`no Raid for ${s}`);
  }

  // Honours (R11.4).
  for (const id of duplicates(content.honours.map((h) => h.id)))
    errors.push(`duplicate Honour ${id}`);
  for (const h of content.honours) {
    if (!MEASURES.includes(h.measure as Measure))
      errors.push(`${h.id}: unknown measure ${h.measure}`);
  }

  // Tunables (R16).
  const t = rules.tunables;
  for (const [k, v] of Object.entries(t)) {
    const ok = Array.isArray(v) ? v.every((x) => isCount(x)) : isCount(v);
    if (!ok) errors.push(`tunable ${k} must be counts`);
  }
  if (t.valourBySeason.length !== SEASONS.length) {
    errors.push('valourBySeason needs one per Season');
  }
  if (t.marketPrice.length !== SEASONS.length) errors.push('marketPrice needs one per Season');
  const maxSeats = SEAT_COUNTS[SEAT_COUNTS.length - 1] ?? 7;
  if (t.greatWorksOffered < 1 || content.greatWorks.length < t.greatWorksOffered * maxSeats) {
    errors.push(
      `${content.greatWorks.length} Great Works: ${maxSeats} towns need ${t.greatWorksOffered * maxSeats} (R2.4)`,
    );
  }
  if (t.turnsPerSeason < 1 || t.handSize !== t.turnsPerSeason + 1) {
    errors.push('handSize must be turnsPerSeason + 1 (the last turn gleans one card, R3.5)');
  }
  if (t.exchangeRate < 1) errors.push('exchangeRate must be >= 1');
  // R2.7, R3.2: each Season deck deals a full hand to every seat, for 3 to 7 seats.
  for (const season of SEASONS) {
    const cards = content.cards.filter((c) => c.season === season);
    SEAT_COUNTS.forEach((seats, i) => {
      const size = cards.reduce((n, c) => n + (c.counts[i] ?? 0), 0);
      if (size < t.handSize * seats) {
        errors.push(`${season} deck: ${size} cards at ${seats} seats, needs ${t.handSize * seats}`);
      }
    });
  }
  if (t.loreRunScores.length !== 6) errors.push('loreRunScores needs 6 entries (runs of 1 to 6)');
  if (t.coinsPerRenown < 1) errors.push('coinsPerRenown must be >= 1');
  if (content.honours.length < t.honoursPerGame) {
    errors.push(`${content.honours.length} Honours, fewer than honoursPerGame ${t.honoursPerGame}`);
  }
  return errors;
}
