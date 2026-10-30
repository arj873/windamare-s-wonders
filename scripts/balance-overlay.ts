/**
 * Experiment overlays for scripts/balance.ts (docs/BALANCE.md, docs/balance/experiments/*.json).
 * An overlay patches the shipped content in memory; design's `src/content/windamere` is never
 * edited. Unknown ids and malformed patches throw, so a typo cannot silently test the baseline.
 *
 * Shape (every field optional):
 *   name, hypothesis: free text, echoed in the report
 *   tunables: engine `WwTunables` keys (shipped.ts maps design's TUNABLES onto these), replaced
 *   greatWorks: { "<id>" | "*": GwPatch } — "*" applies to every Great Work first, then by id
 *   cards: { "<def id>": { cost?, spend?, effects?, counts?, upgrade? } } — fields replaced
 *   cardSpend: { labourDelta?, refund?, coinsDelta?, kinds?, seasons? } — every matching card's
 *     Spend band with labour gets `labourDelta` labour (floored at 0) and `refund` coins
 *     (default 1) per labour removed; every matching band gets `coinsDelta` coins
 *   cardRenown: { delta, kinds?, seasons? } — printed `renown` of matching cards + delta (min 1)
 *   cardEffect: { types, delta, min?, kinds?, seasons?, ids? } — the `amount` of every effect of
 *     those types on matching cards + delta (floored at `min`, default 1)
 *   raids: { "<id>": { strength } }
 *   extends: "<file>.json" (next to this one) — start from that overlay. Keyed maps (tunables,
 *     greatWorks, cards, raids) merge key by key, a Great Work's or card's patch field by field;
 *     every other field of this overlay replaces the base's.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  EffectSpec,
  GreatWorkDef,
  GreatWorkTier,
  WwCardDef,
  WwContent,
  WwTunables,
} from '../src/engine';

export interface GwPatch {
  /** Absolute tier thresholds I-IV. */
  thresholds?: number[];
  /** Added to each tier threshold. */
  thresholdDelta?: number[];
  /** The `renown` amount of each tier (null keeps it; 0 removes the effect). */
  tierRenown?: (number | null)[];
  /** Added to each tier's `renown` amount (floored at 0). */
  tierRenownDelta?: number[];
  perk?: EffectSpec[];
  /** Full replacement of the tiers. */
  tiers?: GreatWorkTier[];
}

export interface Overlay {
  name?: string;
  hypothesis?: string;
  tunables?: Partial<WwTunables>;
  greatWorks?: Record<string, GwPatch>;
  cards?: Record<
    string,
    Partial<Pick<WwCardDef, 'cost' | 'spend' | 'effects' | 'counts' | 'upgrade'>>
  >;
  cardSpend?: {
    labourDelta?: number;
    refund?: number;
    /** Coins added to every matching Spend band (floored at 0). */
    coinsDelta?: number;
    kinds?: string[];
    seasons?: string[];
  };
  /** Printed `renown` of every matching card + `delta`, floored at 1 (cards with none untouched). */
  cardRenown?: { delta: number; kinds?: string[]; seasons?: string[] };
  /** `amount` of every effect of `types` on matching cards + `delta`, floored at `min` (1). */
  cardEffect?: {
    types: string[];
    delta: number;
    min?: number;
    kinds?: string[];
    seasons?: string[];
    ids?: string[];
  };
  raids?: Record<string, { strength: number }>;
  /** Another overlay file, next to this one, to start from. */
  extends?: string;
}

const KEYED = ['tunables', 'greatWorks', 'cards', 'raids'] as const;

/** `own` on top of `base`: keyed maps merge per key (and per field inside), the rest replaces. */
export function mergeOverlays(base: Overlay, own: Overlay): Overlay {
  const out: Overlay = { ...base, ...own };
  for (const k of KEYED) {
    const a = (base[k] ?? {}) as Record<string, unknown>;
    const b = (own[k] ?? {}) as Record<string, unknown>;
    if (!base[k] && !own[k]) continue;
    const merged: Record<string, unknown> = { ...a };
    for (const [id, v] of Object.entries(b)) {
      const prev = merged[id];
      merged[id] =
        k !== 'tunables' && prev && typeof prev === 'object' && v && typeof v === 'object'
          ? { ...prev, ...v }
          : v;
    }
    (out as Record<string, unknown>)[k] = merged;
  }
  delete out.extends;
  return out;
}

export function loadOverlay(path: string, seen: string[] = []): Overlay {
  if (seen.includes(path)) throw new Error(`overlay: extends loop ${[...seen, path].join(' -> ')}`);
  const own = JSON.parse(readFileSync(path, 'utf8')) as Overlay;
  if (!own.extends) return own;
  const base = loadOverlay(join(dirname(path), own.extends), [...seen, path]);
  return mergeOverlays(base, own);
}

const four = (xs: unknown, what: string): number[] => {
  if (!Array.isArray(xs) || xs.length !== 4) throw new Error(`${what}: need 4 numbers`);
  return xs as number[];
};

function setRenown(reward: readonly EffectSpec[], amount: number): EffectSpec[] {
  const rest = reward.filter((e) => e.type !== 'renown');
  return amount > 0 ? [{ type: 'renown', amount }, ...rest] : rest;
}
const renownOf = (reward: readonly EffectSpec[]) =>
  reward.reduce((a, e) => a + (e.type === 'renown' ? (e.amount as number) : 0), 0);

function patchWork(gw: GreatWorkDef, p: GwPatch): GreatWorkDef {
  let tiers = (p.tiers ?? gw.tiers).map((t) => ({ ...t, reward: [...t.reward] }));
  if (p.thresholds) {
    const th = four(p.thresholds, `${gw.id}.thresholds`);
    tiers = tiers.map((t, i) => ({ ...t, threshold: th[i] as number }));
  }
  if (p.thresholdDelta) {
    const d = four(p.thresholdDelta, `${gw.id}.thresholdDelta`);
    tiers = tiers.map((t, i) => ({ ...t, threshold: t.threshold + (d[i] as number) }));
  }
  if (p.tierRenown) {
    const r = four(p.tierRenown, `${gw.id}.tierRenown`);
    tiers = tiers.map((t, i) =>
      r[i] === null || r[i] === undefined ? t : { ...t, reward: setRenown(t.reward, r[i]) },
    );
  }
  if (p.tierRenownDelta) {
    const d = four(p.tierRenownDelta, `${gw.id}.tierRenownDelta`);
    tiers = tiers.map((t, i) => ({
      ...t,
      reward: setRenown(t.reward, Math.max(0, renownOf(t.reward) + (d[i] as number))),
    }));
  }
  return { ...gw, perk: p.perk ?? gw.perk, tiers };
}

function patchSpend(
  spend: Record<string, number>,
  delta: number,
  refund: number,
): Record<string, number> {
  const lab = spend.labour ?? 0;
  if (lab === 0) return spend;
  const next = Math.max(0, lab + delta);
  const out = { ...spend };
  if (next === 0) delete out.labour;
  else out.labour = next;
  if (next < lab && refund > 0) out.coins = (out.coins ?? 0) + refund * (lab - next);
  return out;
}

export function applyOverlay(base: WwContent, ov: Overlay): WwContent {
  const gwIds = new Set(base.greatWorks.map((g) => g.id));
  for (const id of Object.keys(ov.greatWorks ?? {}))
    if (id !== '*' && !gwIds.has(id)) throw new Error(`overlay: unknown Great Work "${id}"`);
  const cardIds = new Set(base.cards.map((c) => c.id));
  for (const id of Object.keys(ov.cards ?? {}))
    if (!cardIds.has(id)) throw new Error(`overlay: unknown card "${id}"`);
  for (const id of ov.cardEffect?.ids ?? [])
    if (!cardIds.has(id)) throw new Error(`overlay: unknown card "${id}" in cardEffect`);
  const raidIds = new Set(base.raids.map((r) => r.id));
  for (const id of Object.keys(ov.raids ?? {}))
    if (!raidIds.has(id)) throw new Error(`overlay: unknown Raid "${id}"`);

  const all = ov.greatWorks?.['*'];
  const greatWorks = base.greatWorks.map((gw) => {
    let out = all ? patchWork(gw, all) : gw;
    const own = ov.greatWorks?.[gw.id];
    if (own) out = patchWork(out, own);
    return out;
  });

  const cs = ov.cardSpend;
  const cards = base.cards.map((c) => {
    let out: WwCardDef = { ...c, ...(ov.cards?.[c.id] ?? {}) };
    const match =
      cs &&
      (!cs.kinds || cs.kinds.includes(c.kind)) &&
      (!cs.seasons || cs.seasons.includes(c.season));
    if (match && cs.labourDelta)
      out = { ...out, spend: patchSpend(out.spend, cs.labourDelta, cs.refund ?? 1) };
    if (match && cs.coinsDelta) {
      const spend = { ...out.spend };
      const coins = Math.max(0, (spend.coins ?? 0) + cs.coinsDelta);
      if (coins > 0) spend.coins = coins;
      else delete spend.coins;
      out = { ...out, spend };
    }
    const cr = ov.cardRenown;
    if (
      cr &&
      (!cr.kinds || cr.kinds.includes(c.kind)) &&
      (!cr.seasons || cr.seasons.includes(c.season))
    ) {
      const effects = out.effects.map((e) =>
        e.type === 'renown' ? { ...e, amount: Math.max(1, (e.amount as number) + cr.delta) } : e,
      );
      out = { ...out, effects };
    }
    const ce = ov.cardEffect;
    if (
      ce &&
      (!ce.kinds || ce.kinds.includes(c.kind)) &&
      (!ce.seasons || ce.seasons.includes(c.season)) &&
      (!ce.ids || ce.ids.includes(c.id))
    ) {
      const effects = out.effects.map((e) =>
        ce.types.includes(e.type) && typeof e.amount === 'number'
          ? { ...e, amount: Math.max(ce.min ?? 1, e.amount + ce.delta) }
          : e,
      );
      out = { ...out, effects };
    }
    return out;
  });

  const raids = base.raids.map((r) => ({ ...r, ...(ov.raids?.[r.id] ?? {}) }));
  return {
    ...base,
    greatWorks,
    cards,
    raids,
    tunables: { ...base.tunables, ...(ov.tunables ?? {}) },
  };
}
