/**
 * One-ply pick evaluator for the level 2 and 3 Windamere bots. It never reads hidden
 * information: it works on a seat's `viewFor` output, copies only the acting town, applies the
 * pick to that copy and prices the difference in Renown. All weights are untuned first guesses.
 *
 *   value = change in end-game Renown (the engine's own `scoreTown`, minus the purse)
 *         + resources gained or spent (coins, goods, labour) at fixed Renown prices
 *         + future income of the built card (Yield, Income, Season-end, Tolls, discounts ...)
 *         + Raid value of Guard gained (this Season's Raid is public, later ones are averaged).
 */
import {
  activeEffects,
  guardOf,
  loreRanks,
  loreRuns,
  neighboursOf,
  marketPrice,
  scoreTown,
  type EffectSpec,
  type SeatId,
  type WwCardDef,
  type WwPickArgs,
  type WwRules,
  type WwState,
} from '../engine';
import type { Card, CardId } from '../engine';

const COIN = 0.28; // a coin is a quarter Renown at the end and buys goods before
const GOOD = 0.4;
const NEIGHBOUR_PER_TURN = 0.5; // a neighbour Builds about every second turn

export interface Intent {
  def: WwCardDef;
  role: 'build' | 'spend';
  /** Build: card id of the covered card (upgrade) or null. */
  cover?: CardId | null;
  /** The card's id in a hand (own picks), for the tableau copy. */
  cardId?: CardId;
  /** Own picks: the normalized args of the engine's pick (payment, "any" goods, glean). */
  args?: WwPickArgs;
  /** Own picks on the last turn: the glean card's def (Spent as well). */
  glean?: WwCardDef | null;
}

/** Chance, per rank, that the town still gets it: from the Lore cards left in the Seasons to come. */
function loreChances(rules: WwRules, state: WwState, scale: number): Map<number, number> {
  const seatIdx = Math.min(7, Math.max(3, state.seats.length === 2 ? 4 : state.seats.length)) - 3;
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const miss = new Map<number, number>(); // rank -> chance of never getting it
  for (const c of rules.content.cards) {
    if (c.kind !== 'lore') continue;
    const si = seasons.indexOf(c.season);
    if (si < state.round) continue;
    // The current Season counts for the turns left in it only (it may already be dealt out).
    const w =
      si === state.round ? Math.max(0, (state.roundPicks - state.turn - 1) / state.roundPicks) : 1;
    const copies = c.counts[seatIdx] ?? 0;
    const rank = c.effects.find((e) => e.type === 'lore')?.rank as number | undefined;
    if (rank === undefined) continue;
    miss.set(rank, (miss.get(rank) ?? 1) * Math.pow(1 - Math.min(0.9, 0.3 * w * scale), copies));
  }
  return new Map([...miss].map(([r, m]) => [r, 1 - m]));
}

/**
 * Lore Renown as it will probably end: each rank the town lacks is added with the chance that a
 * card of that rank still comes (`loreChances`), and the run scores of every outcome are averaged.
 */
function expectedLore(rules: WwRules, state: WwState, seat: SeatId, scale: number): number {
  const table = rules.tunables.loreRunScores;
  const have = loreRanks(rules, state, seat);
  const score = (ranks: number[]) => loreRuns(ranks).reduce((a, n) => a + (table[n - 1] ?? 0), 0);
  if (scale <= 0) return score(have);
  const chances = loreChances(rules, state, scale);
  const missing = [...chances.keys()].filter((r) => !have.includes(r) && (chances.get(r) ?? 0) > 0);
  let total = 0;
  for (let mask = 0; mask < 1 << missing.length; mask++) {
    let p = 1;
    const ranks = [...have];
    missing.forEach((r, i) => {
      const q = chances.get(r) ?? 0;
      if (mask & (1 << i)) {
        p *= q;
        ranks.push(r);
      } else p *= 1 - q;
    });
    ranks.sort((a, b) => a - b);
    total += p * score(ranks);
  }
  return total;
}

/** Renown without the purse (coins are priced separately, smoothly). */
function endRenown(rules: WwRules, state: WwState, seat: SeatId, tune: EvalTune): number {
  const s = scoreTown(rules, state, seat);
  return (
    s.town + s.greatWork + s.raids + expectedLore(rules, state, seat, tune.loreProject) + s.honours
  );
}

/** Turns on which a Yield still happens: this one counts (R17.3), Winter has none (R3.7). */
function yieldTurns(state: WwState): number {
  if (state.round >= 3) return 0;
  return state.roundPicks - state.turn + 5 * Math.max(0, 2 - state.round);
}
const turnsLeft = (state: WwState) =>
  state.roundPicks - state.turn + 5 * Math.max(0, 3 - state.round);
const seasonEndsLeft = (state: WwState) => 4 - state.round;

/** The town's seat with a private copy of what an intent changes. */
function copySeat(state: WwState, seat: SeatId): WwState {
  const s = state.seats[seat];
  if (!s) throw new Error(`no seat ${seat}`);
  const copy = {
    ...s,
    tableau: [...s.tableau],
    zones: { ...s.zones },
    data: {
      ...s.data,
      store: { ...s.data.store },
      covers: [...s.data.covers],
      valour: [...s.data.valour],
    },
  };
  return { ...state, seats: state.seats.map((x) => (x.id === seat ? copy : x)) } as WwState;
}

/** Add a gains object to a town; "any" units go to the good held least. */
function addGains(
  rules: WwRules,
  data: WwState['seats'][number]['data'],
  gains: Record<string, number>,
  sign = 1,
): void {
  for (const [k, v] of Object.entries(gains)) {
    if (k === 'coins') data.coins += sign * v;
    else if (k === 'labour') data.labour += sign * v;
    else if (k === 'any') {
      for (let i = 0; i < v; i++) {
        const g = rules.goods.reduce((a, b) =>
          (data.store[b] ?? 0) < (data.store[a] ?? 0) ? b : a,
        );
        data.store[g] = (data.store[g] ?? 0) + sign;
      }
    } else data.store[k] = (data.store[k] ?? 0) + sign * v;
  }
}

/** Renown per labour point left on the town's Great Work (0 when finished). */
function labourPrice(rules: WwRules, state: WwState, seat: SeatId): number {
  const town = state.seats[seat]?.data;
  if (!town || town.greatWork === null) return 0.4;
  const gw = rules.greatWork(town.greatWork);
  const left = gw.tiers.slice(town.tiers);
  if (left.length === 0) return 0;
  const renown = left.reduce(
    (a, t) =>
      a + t.reward.reduce((b, e) => b + (e.type === 'renown' ? (e.amount as number) : 0), 0),
    0,
  );
  const last = gw.tiers[gw.tiers.length - 1]?.threshold ?? 15;
  return Math.max(0.3, (0.8 * renown) / Math.max(1, last - town.labour));
}

/** Value of a gains object at the town's prices. */
function gainsValue(g: Record<string, number>, lp: number, gf: number): number {
  let v = 0;
  for (const [k, n] of Object.entries(g)) {
    if (k === 'coins') v += n * COIN;
    else if (k === 'labour') v += n * lp;
    else v += n * GOOD * gf;
  }
  return v;
}

/** Winter has no more Builds soon: goods lose value as the game ends. */
function goodsFactor(state: WwState): number {
  return state.round >= 3 ? Math.max(0, (state.roundPicks - state.turn - 1) / state.roundPicks) : 1;
}

function econValue(
  _rules: WwRules,
  state: WwState,
  _seat: SeatId,
  spec: EffectSpec,
  lp: number,
  gf: number,
  neighbours: number,
): number {
  const yt = yieldTurns(state);
  const tl = turnsLeft(state);
  const gains = (spec.gains ?? {}) as Record<string, number>;
  switch (spec.type) {
    case 'yield':
      return yt * gainsValue(gains, lp, gf);
    case 'income':
      return yt * (spec.coins as number) * COIN;
    case 'seasonEnd':
      return seasonEndsLeft(state) * gainsValue(gains, lp, gf);
    case 'heldBonus':
      return 0.5 * seasonEndsLeft(state) * gainsValue(gains, lp, gf);
    case 'toll':
      return tl * neighbours * NEIGHBOUR_PER_TURN * (spec.coins as number) * COIN * 0.6;
    case 'exchange':
      return 1.2 * (tl / 20) * 2;
    case 'discount':
      return (spec.amount as number) * GOOD * gf * Math.max(0, tl * 0.3);
    case 'spendBonus':
      return tl * 0.3 * gainsValue(gains, lp, gf);
    case 'buildBonus':
      return tl * 0.3 * gainsValue(gains, lp, gf);
    case 'scoreSales': {
      // Renown per `per` goods sold from now on; the sales so far are already in scoreTown.
      const sales = 0.25 * tl;
      return (sales / (spec.per as number)) * (spec.amount as number) * 0.7;
    }
    case 'sellBonus':
      return (tl / 5) * (spec.coins as number) * COIN * 1.5;
    default:
      return 0;
  }
}

/** Evaluator knobs that sims compare (the defaults are what the shipped bots use). */
export interface EvalTune {
  /** 0 = Guard counts only when it reaches a Raid's strength; 1 = progress towards it counts too. */
  guardSmooth: number;
  /** Scale of the chance that a missing Lore rank turns up later (0 = Lore counts as it stands). */
  loreProject: number;
}
export const DEFAULT_TUNE: EvalTune = { guardSmooth: 0, loreProject: 1 };

/** Chance a Guard of `g` holds against strength `x` in a later Season (Guard grows by then). */
const soft = (g: number, x: number) => 1 / (1 + Math.exp(-(g - x + 0.5) / 1.5));

/** Expected Guard value: Valour and avoided plunder over the Seasons left. */
function guardValue(
  rules: WwRules,
  state: WwState,
  g0: number,
  g1: number,
  tune: EvalTune,
): number {
  if (g1 === g0) return 0;
  const t = rules.tunables;
  let v = 0;
  for (let s = state.round; s < 4; s++) {
    const known = s === state.round ? state.table.raids[s] : undefined;
    const raids = rules.content.raids.filter(
      (r) => r.season === ['spring', 'summer', 'autumn', 'winter'][s],
    );
    const strengths =
      known?.revealed === true ? [rules.raid(known.id).strength] : raids.map((r) => r.strength);
    if (strengths.length === 0) continue;
    const per = (t.valourBySeason[s] ?? 0) + 1.0;
    const sm = tune.guardSmooth;
    const now = s === state.round;
    const held = (g: number) =>
      strengths.reduce((a, x) => {
        const hard = g >= x ? 1 : 0;
        // Between Seasons the town can add Guard, so progress is worth a share of the Valour.
        return (
          a +
          (1 - sm) * hard +
          sm * (now && known?.revealed === true ? 0.5 * hard + 0.5 * soft(g, x) : soft(g, x))
        );
      }, 0) / strengths.length;
    v += (held(g1) - held(g0)) * per * (now ? 1 : 0.8);
  }
  return v;
}

/**
 * The value of an intent for `seat` in `state` (a view is fine). Returns null if a Build cannot
 * be paid for with the town's goods and coins at the current market price (neighbour intents).
 */
export function valueOf(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  it: Intent,
  tune: EvalTune = DEFAULT_TUNE,
): number | null {
  const base = state.seats[seat];
  if (!base) throw new Error(`no seat ${seat}`);
  const hyp = copySeat(state, seat);
  const town = hyp.seats[seat];
  if (!town) throw new Error(`no seat ${seat}`);
  const data = town.data;
  const before = { coins: data.coins, labour: data.labour, store: { ...data.store } };
  const neighbours = hyp.seats.length === 2 ? 1 : 2;
  const lp = labourPrice(rules, state, seat);
  const gf = goodsFactor(state);
  const beforeScore = endRenown(rules, state, seat, tune);
  const beforeGuard = guardOf(rules, state, seat);
  let econ = 0;

  const spendOf = (def: WwCardDef) => {
    addGains(rules, data, def.spend);
    for (const e of activeEffects(rules, hyp, seat, 'spendBonus')) {
      if (e.spec.kind === def.kind) addGains(rules, data, e.spec.gains as Record<string, number>);
    }
  };

  if (it.role === 'spend') {
    spendOf(it.def);
    if (it.glean) spendOf(it.glean);
  } else {
    if (it.glean) spendOf(it.glean);
    const cover = it.cover ?? null;
    const base0 = cover !== null && it.def.upgrade ? it.def.upgrade.cost : it.def.cost;
    const cost: Record<string, number> = { ...base0 };
    // Discounts: the pick's own choice if named, else the cheapest goods the discounts remove.
    if (it.args?.discount) {
      for (const g of it.args.discount) if ((cost[g] ?? 0) > 0) cost[g] = (cost[g] ?? 0) - 1;
    }
    let missing = 0;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'coins') data.coins -= v;
      else {
        const have = data.store[k] ?? 0;
        data.store[k] = have - Math.min(have, v);
        missing += Math.max(0, v - have);
      }
    }
    const price = marketPrice(rules, state);
    if (it.args?.pay) {
      for (const p of it.args.pay) {
        if (p.via === 'buy') data.coins -= price;
        else if (p.via === 'bank') data.coins -= rules.tunables.bankPrice;
        else data.store[p.give] = (data.store[p.give] ?? 0) - rules.tunables.exchangeRate;
      }
    } else data.coins -= missing * price;
    if (data.coins < 0) return null;
    for (const g of Object.keys(data.store)) if ((data.store[g] ?? 0) < 0) return null;

    if (cover !== null) {
      const idx = town.tableau.findIndex((c) => c.id === cover);
      const gone = idx >= 0 ? town.tableau.splice(idx, 1)[0] : undefined;
      if (gone) {
        const cd = rules.card(gone.def);
        for (const e of cd.effects) econ -= econValue(rules, state, seat, e, lp, gf, neighbours);
        data.covers.push({ card: cover, by: it.cardId ?? -1 });
      }
    }
    const card: Card = { id: it.cardId ?? -1, def: it.def.id };
    town.tableau.push(card);
    for (const e of it.def.effects) {
      if (e.type === 'onBuild') addGains(rules, data, e.gains as Record<string, number>);
      else if (e.type === 'onBuildNeighbourMin') {
        // The weaker neighbour's uncovered cards of the kind, as the Build step began (public).
        const times = Math.min(
          ...neighboursOf(state, seat).map(
            (n) =>
              state.seats[n]?.tableau.filter((c) => rules.card(c.def).kind === e.kind).length ?? 0,
          ),
        );
        for (let i = 0; i < times; i++) addGains(rules, data, e.gains as Record<string, number>);
      } else if (e.type === 'onBuildPerKind') {
        const n = town.tableau.filter((c) => rules.card(c.def).kind === e.kind).length;
        for (let i = 0; i < n; i++) addGains(rules, data, e.gains as Record<string, number>);
      } else econ += econValue(rules, state, seat, e, lp, gf, neighbours);
    }
  }

  // Great Work tiers that this labour completes (their Renown shows up in scoreTown).
  if (data.greatWork !== null) {
    const gw = rules.greatWork(data.greatWork);
    while (gw.tiers[data.tiers] && data.labour >= (gw.tiers[data.tiers]?.threshold ?? Infinity)) {
      const t = gw.tiers[data.tiers];
      data.tiers += 1;
      for (const e of t?.reward ?? []) {
        if (e.type === 'onBuild') addGains(rules, data, e.gains as Record<string, number>);
      }
    }
  }

  const dRenown = endRenown(rules, hyp, seat, tune) - beforeScore;
  let res = (data.coins - before.coins) * COIN;
  for (const g of rules.goods) res += ((data.store[g] ?? 0) - (before.store[g] ?? 0)) * GOOD * gf;
  // Labour that did not complete a tier is progress, priced at half (the tier itself is in dRenown).
  res += (data.labour - before.labour) * lp * 0.5;
  const guard = guardValue(rules, state, beforeGuard, guardOf(rules, hyp, seat), tune);
  return dRenown + res + econ + guard;
}

/** Best of Build and Spend for a card on a town (neighbour valuation); 0 if nothing helps. */
export function bestUse(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  def: WwCardDef,
  tune: EvalTune = DEFAULT_TUNE,
): number {
  let best = valueOf(rules, state, seat, { def, role: 'spend' }, tune) ?? 0;
  const build = valueOf(rules, state, seat, { def, role: 'build' }, tune);
  if (build !== null && build > best) best = build;
  return best;
}

/** A full state's worth of one town: end Renown plus its coins and goods at the fixed prices. */
export function townValue(
  rules: WwRules,
  state: WwState,
  seat: SeatId,
  tune: EvalTune = DEFAULT_TUNE,
): number {
  const d = state.seats[seat]?.data;
  if (!d) throw new Error(`no seat ${seat}`);
  let v = endRenown(rules, state, seat, tune) + d.coins * COIN;
  for (const g of rules.goods) v += (d.store[g] ?? 0) * GOOD * goodsFactor(state);
  return v;
}
