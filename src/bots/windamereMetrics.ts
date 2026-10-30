/**
 * Per-game samples for the balance report (docs/design/research/balance-targets.md). Reads the
 * FINAL full state (a sim may; a bot may not). Every metric is a list of samples, concatenated
 * over games by the sim.
 */
import {
  CATEGORIES,
  KINDS,
  activeEffects,
  measure,
  neighboursBeaten,
  scoreTown,
  type Measure,
  type WwRules,
  type WwState,
} from '../engine';
import type { Json } from '../engine';

/** Research's 8 score sources (balance-targets spec). */
export const SOURCES = [
  'hall',
  'landmark',
  'otherCard',
  'greatWork',
  'valour',
  'lore',
  'honours',
  'purse',
] as const;
export type Source = (typeof SOURCES)[number];

/** Renown by source for one town; the sum equals the town's total (checked in the tests). */
export function sourcesOf(rules: WwRules, state: WwState, seat: number): Record<Source, number> {
  const sheet = scoreTown(rules, state, seat);
  const out: Record<Source, number> = {
    hall: 0,
    landmark: 0,
    otherCard: 0,
    greatWork: 0,
    valour: sheet.raids,
    lore: sheet.lore,
    honours: sheet.honours,
    purse: sheet.purse,
  };
  for (const { spec, source } of activeEffects(rules, state, seat)) {
    const renown = rules.effects[spec.type]?.score?.(state, seat, spec).renown ?? 0;
    if (source.kind !== 'card') out.greatWork += renown;
    else {
      const kind = rules.card(source.card.def).kind;
      out[kind === 'hall' ? 'hall' : kind === 'landmark' ? 'landmark' : 'otherCard'] += renown;
    }
  }
  return out;
}

const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];

export function observeWindamere(rules: WwRules, state: WwState): Record<string, number[]> {
  const m: Record<string, number[]> = {};
  const add = (k: string, v: number) => (m[k] ??= []).push(v);
  const n = state.seats.length;
  const sheets = state.seats.map((s) => scoreTown(rules, state, s.id));
  const totals = sheets.map((sh) => CATEGORIES.reduce((a, c) => a + sh[c], 0));
  const result = state.result;
  const winners = new Set(result?.winners ?? []);

  // Game level: winner/runner-up margin (R3).
  const sorted = [...totals].sort((a, b) => b - a);
  add('winScore', sorted[0] ?? 0);
  add('runnerUpScore', sorted[1] ?? 0);
  add(
    'marginPct',
    sorted[0] ? (100 * ((sorted[0] ?? 0) - (sorted[1] ?? 0))) / (sorted[0] ?? 1) : 0,
  );
  add('blowout', (sorted[0] ?? 0) >= 1.3 * (sorted[1] ?? 1) ? 1 : 0);

  // Winner's largest source (S1), one sample per source per game (1 = it was the largest).
  const src = state.seats.map((x) => sourcesOf(rules, state, x.id));
  const w = [...winners][0];
  if (w !== undefined) {
    const sheet = src[w];
    if (sheet) {
      const top = SOURCES.reduce((a, c) => (sheet[c] > sheet[a] ? c : a), SOURCES[0]);
      for (const c of SOURCES) {
        add(`winnerLargest.${c}`, c === top ? 1 : 0);
        add(`winnerSrc.${c}`, sheet[c]);
      }
    }
  }
  for (const sh of src) for (const c of SOURCES) add(`townSrc.${c}`, sh[c]);

  // Per town.
  const log = state.log;
  for (const s of state.seats) {
    const id = s.id;
    const data = s.data;
    add('loreRun', measure(rules, state, id, 'loreRun' as Measure));
    add('tiers', data.tiers);
    add('coinsEnd', data.coins);

    // Interaction (I1): net coin transfer with neighbours, (received - paid) / coinsPerRenown,
    // plus scoreBeat Renown. Received = sales (with sellBonus) and bounty taken; paid = purchases
    // filled by a neighbour and bounty paid. Tolls come from the bank in reaction to neighbours'
    // Builds; they are reported apart. Purchases the seller could not fill are bank trades.
    let received = 0;
    let paid = 0;
    let tolls = 0;
    for (const e of log) {
      const d = (e.data ?? {}) as Record<string, Json>;
      if (e.kind === 'sale' && d.filled === true) {
        if (e.seat === id) received += (d.price as number) + ((d.bonus as number | undefined) ?? 0);
        if (d.buyer === id) paid += d.price as number;
      } else if (e.kind === 'toll' && e.seat === id) tolls += d.coins as number;
      else if (e.kind === 'bounty') {
        if (e.seat === id) received += d.bounty as number;
        if (d.from === id) paid += d.bounty as number;
      }
    }
    let beat = 0;
    for (const { spec } of activeEffects(rules, state, id, 'scoreBeat')) {
      beat += (spec.amount as number) * neighboursBeaten(rules, state, id, spec.measure as Measure);
    }
    const per = rules.tunables.coinsPerRenown;
    const net = (received - paid) / per + beat;
    add('nbrNet', net);
    add('nbrBeat', beat);
    add('nbrTolls', tolls / per);
    add('nbrGross', (received + paid) / per + beat);
    const total = totals[id] ?? 0;
    add('nbrShare', total > 0 ? net / total : 0);

    // Great Work (F2/F3/S4): who held it, did it win, tiers.
    if (data.greatWork) {
      add(`gw.${data.greatWork}.held`, 1);
      add(`gw.${data.greatWork}.won`, winners.has(id) ? 1 / winners.size : 0);
      add(`gw.${data.greatWork}.tiers`, data.tiers);
    }

    // Raids (I3): held per Season.
    SEASON_NAMES.forEach((_, i) =>
      add(
        `held.${SEASON_NAMES[i]}`,
        data.valour.includes(rules.tunables.valourBySeason[i] ?? -1) ? 1 : 0,
      ),
    );
    add('guard', measure(rules, state, id, 'guard'));
  }

  // Actions: Build vs Spend by Season, Kinds built.
  const builds: Record<string, number> = {};
  for (const e of log) {
    const season = SEASON_NAMES[e.round] ?? '?';
    if (e.kind === 'build') {
      add(`build.${season}`, 1);
      const def = rules.card((e.data as { card: string }).card);
      builds[def.kind] = (builds[def.kind] ?? 0) + 1;
    } else if (e.kind === 'spend') add(`spend.${season}`, 1);
    else if (e.kind === 'sale') add('sale', 1);
    else if (e.kind === 'saleShort') add('saleShort', 1);
  }
  for (const k of KINDS) add(`builtKind.${k}`, (builds[k] ?? 0) / n);
  add('builtPerTown', Object.values(builds).reduce((a, b) => a + b, 0) / n);
  return m;
}
