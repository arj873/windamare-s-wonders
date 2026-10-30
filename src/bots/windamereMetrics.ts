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

  // Winner's largest category (S1), one sample per category per game (1 = it was the largest).
  const w = [...winners][0];
  if (w !== undefined) {
    const sheet = sheets[w];
    if (sheet) {
      const top = CATEGORIES.reduce((a, c) => (sheet[c] > sheet[a] ? c : a), CATEGORIES[0]);
      for (const c of CATEGORIES) {
        add(`winnerLargest.${c}`, c === top ? 1 : 0);
        add(`winnerCat.${c}`, sheet[c]);
      }
    }
  }
  for (const sh of sheets) for (const c of CATEGORIES) add(`townCat.${c}`, sh[c]);

  // Per town.
  const log = state.log;
  for (const s of state.seats) {
    const id = s.id;
    const data = s.data;
    add('loreRun', measure(rules, state, id, 'loreRun' as Measure));
    add('tiers', data.tiers);
    add('coinsEnd', data.coins);

    // Renown that depends on neighbours (I1): sale, toll and bounty coins at R12.2g's rate,
    // plus scoreBeat Renown. A town's own purchases from the bank are not counted.
    let coins = 0;
    for (const e of log) {
      if (e.seat !== id) continue;
      const d = (e.data ?? {}) as Record<string, Json>;
      if (e.kind === 'sale' && d.filled === true)
        coins += (d.price as number) + ((d.bonus as number | undefined) ?? 0);
      else if (e.kind === 'toll') coins += d.coins as number;
      else if (e.kind === 'bounty') coins += d.bounty as number;
    }
    let beat = 0;
    for (const { spec } of activeEffects(rules, state, id, 'scoreBeat')) {
      beat += (spec.amount as number) * neighboursBeaten(rules, state, id, spec.measure as Measure);
    }
    const nbrRenown = coins / rules.tunables.coinsPerRenown + beat;
    const total = totals[id] ?? 0;
    add('nbrRenown', nbrRenown);
    add('nbrShare', total > 0 ? nbrRenown / total : 0);

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
