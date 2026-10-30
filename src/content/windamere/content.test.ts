import { describe, expect, it } from 'vitest';
import type { EffectSpec } from '../../engine';
import {
  AUTUMN,
  CARDS,
  EFFECT_PARAMS,
  FIRST_GAME,
  GAIN_KEYS,
  GOODS,
  GREAT_WORKS,
  HONOURS,
  KINDS,
  MEASURES,
  PENDING_CARDS,
  PENDING_EFFECT_PARAMS,
  PENDING_SWAPS,
  RAIDS,
  SEASONS,
  SPRING,
  SUMMER,
  TUNABLES,
  WINTER,
  g,
} from './index';
import type { Gains, Season, WwCardDef } from './index';

const SEAT_COUNTS = [3, 4, 5, 6, 7] as const;
const BY_SEASON: Record<Season, readonly WwCardDef[]> = {
  spring: SPRING,
  summer: SUMMER,
  autumn: AUTUMN,
  winter: WINTER,
};
const byId = new Map(CARDS.map((c) => [c.id, c]));
const seasonIndex = (s: Season) => SEASONS.indexOf(s);

function gainsProblems(gains: unknown, allowAny: boolean, where: string): string[] {
  if (typeof gains !== 'object' || gains === null || Array.isArray(gains)) {
    return [`${where}: gains is not an object`];
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(gains)) {
    if (!(GAIN_KEYS as readonly string[]).includes(k)) out.push(`${where}: unknown key ${k}`);
    if (k === 'any' && !allowAny) out.push(`${where}: "any" not allowed here (R13.4)`);
    if (!Number.isInteger(v) || (v as number) <= 0) out.push(`${where}: ${k} = ${String(v)}`);
  }
  return out;
}

/**
 * R13 shape check for one effect; `anyOk` = the effect is a card's own onBuild (R13.4).
 * `params` = the vocabulary allowed (shipped by default; pending cards add their types).
 */
function effectProblems(
  e: EffectSpec,
  where: string,
  anyOk: boolean,
  params: Record<string, readonly string[]> = EFFECT_PARAMS,
): string[] {
  const spec = params[e.type];
  if (!spec) return [`${where}: unknown effect type ${e.type}`];
  const out: string[] = [];
  const allowed = spec.map((p) => p.replace('?', ''));
  for (const p of spec) {
    if (!p.endsWith('?') && !(p in e)) out.push(`${where}: ${e.type} lacks ${p}`);
  }
  for (const k of Object.keys(e)) {
    if (k !== 'type' && !allowed.includes(k)) out.push(`${where}: ${e.type} has extra ${k}`);
  }
  if ('kind' in e && !(KINDS as readonly string[]).includes(e.kind as string)) {
    out.push(`${where}: bad kind ${String(e.kind)}`);
  }
  if ('measure' in e && !(MEASURES as readonly string[]).includes(e.measure as string)) {
    out.push(`${where}: bad measure ${String(e.measure)}`);
  }
  if ('good' in e && !(GOODS as readonly string[]).includes(e.good as string)) {
    out.push(`${where}: bad good ${String(e.good)}`);
  }
  if (
    e.type === 'lore' &&
    !(Number.isInteger(e.rank) && (e.rank as number) >= 1 && (e.rank as number) <= 6)
  ) {
    out.push(`${where}: lore rank ${String(e.rank)}`);
  }
  for (const k of ['amount', 'coins', 'per', 'atLeast']) {
    if (k in e && !(Number.isInteger(e[k]) && (e[k] as number) > 0)) {
      out.push(`${where}: ${k} = ${String(e[k])}`);
    }
  }
  if ('gains' in e) out.push(...gainsProblems(e.gains, anyOk && e.type === 'onBuild', where));
  return out;
}

function costProblems(cost: Gains, where: string): string[] {
  const out = gainsProblems(cost, false, where);
  for (const k of Object.keys(cost)) {
    if (k === 'labour') out.push(`${where}: costs use goods and coins only (R6.1)`);
  }
  return out;
}

describe('gains shorthand', () => {
  it('parses goods, coins, labour and any', () => {
    expect(g('2P 1W 3c 1lab 2any')).toEqual({ peat: 2, wax: 1, coins: 3, labour: 1, any: 2 });
    expect(g('')).toEqual({});
    expect(g('—')).toEqual({});
  });
  it('rejects unknown and repeated terms', () => {
    expect(() => g('2L')).toThrow();
    expect(() => g('1P 1P')).toThrow();
  });
});

describe('Season decks (R3.2, R14.1)', () => {
  it.each(SEASONS)('%s holds handSize cards per seat at 3-7 seats', (season) => {
    SEAT_COUNTS.forEach((seats, i) => {
      const total = BY_SEASON[season].reduce((n, c) => n + c.counts[i]!, 0);
      expect(total, `${season} at ${seats} seats`).toBe(TUNABLES.handSize * seats);
    });
  });

  it('2 seats deal 10 each from the 4-seat deck', () => {
    const i = SEAT_COUNTS.indexOf(TUNABLES.twoSeat.deckCounts);
    expect(i).toBeGreaterThanOrEqual(0);
    for (const season of SEASONS) {
      const deck = BY_SEASON[season].reduce((n, c) => n + c.counts[i]!, 0);
      expect(2 * TUNABLES.twoSeat.handSize).toBeLessThanOrEqual(deck);
    }
  });

  it('the cadence leaves exactly one card to glean (R3.5)', () => {
    expect(TUNABLES.handSize - TUNABLES.turnsPerSeason).toBe(1);
    expect(TUNABLES.twoSeat.handSize - 2 * (TUNABLES.turnsPerSeason - 1)).toBe(2);
  });

  it('kind totals at 4 seats match CARDS.md §2', () => {
    const totals: Record<string, number> = {};
    for (const c of CARDS) totals[c.kind] = (totals[c.kind] ?? 0) + c.counts[1];
    expect(totals).toEqual({
      holding: 17,
      hall: 21,
      market: 14,
      watch: 15,
      lore: 18,
      landmark: 11,
    });
  });

  it('copy counts never fall as seats rise', () => {
    for (const c of CARDS) {
      for (let i = 1; i < 5; i++)
        expect(c.counts[i]!, c.id).toBeGreaterThanOrEqual(c.counts[i - 1]!);
    }
  });
});

describe('prices (R6.3, R6.6c)', () => {
  it('market price: never falls, Winter above Spring, never 2, below the bank', () => {
    const p = SEASONS.map((s) => TUNABLES.marketPrice[s]);
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThanOrEqual(p[i - 1]!);
    expect(p[p.length - 1]!).toBeGreaterThan(p[0]!);
    expect(p).not.toContain(2);
    expect(Math.max(...p)).toBeLessThan(TUNABLES.bankPrice);
  });
});

describe('First game option (R19)', () => {
  it('only lowers existing setup numbers and names a real clock option', () => {
    expect(FIRST_GAME.honoursPerGame).toBeLessThan(TUNABLES.honoursPerGame);
    expect(FIRST_GAME.greatWorksOffered).toBeLessThan(TUNABLES.greatWorksOffered);
    expect(FIRST_GAME.greatWorksOffered).toBeGreaterThanOrEqual(1);
    expect(Object.keys(TUNABLES.clockOptions)).toContain(FIRST_GAME.defaultClock);
    expect(FIRST_GAME.upgrades).toBe(false);
  });

  it('still leaves every card buildable (upgrade cards at full cost)', () => {
    for (const c of CARDS.filter((x) => x.upgrade)) {
      expect(Object.keys(c.cost).length, c.id).toBeGreaterThan(0);
    }
  });
});

describe('cards (R1.6, R7, R13)', () => {
  it('ids are unique', () => {
    expect(byId.size).toBe(CARDS.length);
  });

  it('each card sits in its own Season array', () => {
    for (const season of SEASONS) {
      for (const c of BY_SEASON[season]) expect(c.season, c.id).toBe(season);
    }
  });

  it('costs, Spend bands and effects use only R13 vocabulary', () => {
    const problems: string[] = [];
    for (const c of CARDS) {
      if (!(KINDS as readonly string[]).includes(c.kind)) problems.push(`${c.id}: kind ${c.kind}`);
      problems.push(...costProblems(c.cost, `${c.id} cost`));
      problems.push(...gainsProblems(c.spend, true, `${c.id} spend`));
      if (Object.keys(c.spend).length === 0) problems.push(`${c.id}: empty Spend band`);
      if (c.upgrade) problems.push(...costProblems(c.upgrade.cost, `${c.id} upgrade cost`));
      c.effects.forEach((e, i) => problems.push(...effectProblems(e, `${c.id} effect ${i}`, true)));
    }
    expect(problems).toEqual([]);
  });

  it('upgrades cover an earlier card of the same kind and cost less (R7.9)', () => {
    for (const c of CARDS.filter((x) => x.upgrade)) {
      for (const target of c.upgrade!.of) {
        const t = byId.get(target);
        expect(t, `${c.id} upgrades ${target}`).toBeDefined();
        expect(seasonIndex(t!.season), c.id).toBeLessThan(seasonIndex(c.season));
        expect(t!.kind, c.id).toBe(c.kind);
      }
      const size = (x: Gains) => Object.values(x).reduce((a, b) => a + b, 0);
      expect(size(c.upgrade!.cost), c.id).toBeLessThan(size(c.cost));
    }
  });

  it('kind rules: Lore has one rank, Watches give Guard, Landmarks score, no Winter Holdings', () => {
    for (const c of CARDS) {
      const types = c.effects.map((e) => e.type);
      if (c.kind === 'lore')
        expect(
          types.filter((t) => t === 'lore'),
          c.id,
        ).toHaveLength(1);
      else expect(types, c.id).not.toContain('lore');
      if (c.kind === 'watch') expect(types, c.id).toContain('guard');
      if (c.kind === 'landmark')
        expect(
          types.some((t) => t.startsWith('score')),
          c.id,
        ).toBe(true);
      if (c.kind === 'holding') {
        expect(
          types.some((t) => t === 'yield' || t === 'seasonEnd'),
          c.id,
        ).toBe(true);
        expect(c.season, c.id).not.toBe('winter');
      }
    }
  });

  it('Lore ranks by Season: Spring 1-2, Summer 2-4, Autumn 3-5, Winter 5-6 (CARDS.md §2)', () => {
    const range: Record<Season, [number, number]> = {
      spring: [1, 2],
      summer: [2, 4],
      autumn: [3, 5],
      winter: [5, 6],
    };
    for (const c of CARDS.filter((x) => x.kind === 'lore')) {
      const rank = c.effects.find((e) => e.type === 'lore')!.rank as number;
      const [lo, hi] = range[c.season];
      expect(rank, c.id).toBeGreaterThanOrEqual(lo);
      expect(rank, c.id).toBeLessThanOrEqual(hi);
    }
  });

  it('no card prints Renown 7 (research R4 O15)', () => {
    for (const c of [...CARDS, ...PENDING_CARDS]) {
      const renown = c.effects.filter((e) => e.type === 'renown').map((e) => e.amount);
      expect(renown, c.id).not.toContain(7);
    }
  });
});

describe('Great Works (R8, research R4 O7)', () => {
  it('14 works, unique ids, four tiers with rising thresholds', () => {
    expect(GREAT_WORKS).toHaveLength(14);
    expect(new Set(GREAT_WORKS.map((w) => w.id)).size).toBe(14);
    for (const w of GREAT_WORKS) {
      expect(w.tiers, w.id).toHaveLength(4);
      for (let i = 1; i < 4; i++) {
        expect(w.tiers[i]!.threshold, w.id).toBeGreaterThan(w.tiers[i - 1]!.threshold);
      }
    }
  });

  it('perks and rewards use R13 vocabulary with no "any" (R13.4)', () => {
    const problems: string[] = [];
    for (const w of GREAT_WORKS) {
      w.perk.forEach((e, i) => problems.push(...effectProblems(e, `${w.id} perk ${i}`, false)));
      w.tiers.forEach((t, ti) =>
        t.reward.forEach((e, i) =>
          problems.push(...effectProblems(e, `${w.id} tier ${ti + 1} effect ${i}`, false)),
        ),
      );
    }
    expect(problems).toEqual([]);
  });

  it('every tier pays Renown, never a plain 3 or 7, and no tier gives a Lore rank', () => {
    for (const w of GREAT_WORKS) {
      for (const t of w.tiers) {
        const renown = t.reward.filter((e) => e.type === 'renown').map((e) => e.amount as number);
        expect(renown, w.id).toHaveLength(1);
        expect([3, 7], w.id).not.toContain(renown[0]);
        expect(
          t.reward.map((e) => e.type),
          w.id,
        ).not.toContain('lore');
      }
    }
  });
});

describe('Raids and Honours (R9, R11)', () => {
  it('three Raids per Season with rising strength', () => {
    for (const season of SEASONS) {
      expect(
        RAIDS.filter((r) => r.season === season),
        season,
      ).toHaveLength(3);
    }
    const maxOf = (s: Season) =>
      Math.max(...RAIDS.filter((r) => r.season === s).map((r) => r.strength));
    const minOf = (s: Season) =>
      Math.min(...RAIDS.filter((r) => r.season === s).map((r) => r.strength));
    for (let i = 1; i < 4; i++)
      expect(minOf(SEASONS[i]!)).toBeGreaterThanOrEqual(maxOf(SEASONS[i - 1]!) - 1);
  });

  it('the weakest fresh Watch each Season holds every Raid but at most one Spring Raid (R4 D2)', () => {
    let guard = 0;
    const missed: string[] = [];
    for (const season of SEASONS) {
      const fresh = BY_SEASON[season].filter((c) => c.kind === 'watch' && !c.upgrade);
      guard += Math.min(
        ...fresh.map((c) => c.effects.find((e) => e.type === 'guard')!.amount as number),
      );
      for (const r of RAIDS.filter((x) => x.season === season)) {
        if (guard < r.strength) missed.push(r.id);
      }
    }
    expect(missed.length).toBeLessThanOrEqual(1);
    for (const id of missed) expect(RAIDS.find((r) => r.id === id)!.season).toBe('spring');
  });

  it('8 Honours with R11.5 measures', () => {
    expect(HONOURS).toHaveLength(8);
    for (const h of HONOURS) expect(MEASURES, h.id).toContain(h.measure);
  });
});

describe('pending cards (R13.5 staging, empty since D10b)', () => {
  const vocab = { ...EFFECT_PARAMS, ...PENDING_EFFECT_PARAMS };

  it('stay out of CARDS, use only the pending vocabulary, and have new ids', () => {
    const problems: string[] = [];
    for (const c of PENDING_CARDS) {
      if (byId.has(c.id)) problems.push(`${c.id}: already in CARDS`);
      problems.push(...costProblems(c.cost, `${c.id} cost`));
      problems.push(...gainsProblems(c.spend, true, `${c.id} spend`));
      c.effects.forEach((e, i) => problems.push(...effectProblems(e, `${c.id} ${i}`, true, vocab)));
      if (!c.effects.some((e) => e.type in PENDING_EFFECT_PARAMS)) {
        problems.push(`${c.id}: uses no pending type, so it could ship now`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('with their swaps applied, every deck still holds 6 cards per seat', () => {
    expect(Object.keys(PENDING_SWAPS).sort()).toEqual(PENDING_CARDS.map((c) => c.id).sort());
    const swapped = CARDS.map((c) => {
      const s = Object.values(PENDING_SWAPS).find((x) => x.card === c.id);
      return s ? { ...c, counts: s.counts } : c;
    });
    for (const [id, s] of Object.entries(PENDING_SWAPS)) {
      const target = byId.get(s.card);
      const card = PENDING_CARDS.find((c) => c.id === id)!;
      expect(target?.season, id).toBe(card.season);
    }
    for (const season of SEASONS) {
      const deck = [...swapped, ...PENDING_CARDS].filter((c) => c.season === season);
      SEAT_COUNTS.forEach((seats, i) => {
        const total = deck.reduce((n, c) => n + c.counts[i]!, 0);
        expect(total, `${season} at ${seats} seats`).toBe(TUNABLES.handSize * seats);
      });
    }
  });
});

describe('originality blocklist (ORIGINALITY.md §5)', () => {
  const TERMS = [
    'age',
    'stage',
    'shield',
    'science',
    'guild',
    'chain',
    'caravan',
    'treasury',
    'trading post',
    'free city',
    'papyrus',
    'loom',
    'glass',
    'compass',
    'gear',
    'tablet',
    'wonder',
  ];
  const NAMES = [
    'Lumber Yard',
    'Stone Pit',
    'Clay Pool',
    'Ore Vein',
    'Tree Farm',
    'Excavation',
    'Clay Pit',
    'Timber Yard',
    'Forest Cave',
    'Mine',
    'Sawmill',
    'Quarry',
    'Brickyard',
    'Foundry',
    'Loom',
    'Glassworks',
    'Press',
    'Pawnshop',
    'Baths',
    'Altar',
    'Theater',
    'Aqueduct',
    'Temple',
    'Statue',
    'Courthouse',
    'Pantheon',
    'Gardens',
    'Town Hall',
    'Palace',
    'Senate',
    'Tavern',
    'East Trading Post',
    'West Trading Post',
    'Marketplace',
    'Caravansery',
    'Forum',
    'Vineyard',
    'Bazar',
    'Haven',
    'Lighthouse',
    'Chamber of Commerce',
    'Arena',
    'Stockade',
    'Barracks',
    'Guard Tower',
    'Walls',
    'Training Ground',
    'Stables',
    'Archery Range',
    'Fortifications',
    'Circus',
    'Arsenal',
    'Siege Workshop',
    'Apothecary',
    'Workshop',
    'Scriptorium',
    'Dispensary',
    'Laboratory',
    'Library',
    'School',
    'Lodge',
    'Observatory',
    'University',
    'Academy',
    'Study',
    'Palisade',
    'Moneylenders',
    'Smeltery',
    'Kiln',
    'Rampart',
    'Harbour',
    'Moneylender',
    'Colossus',
    'Mausoleum',
    'Pyramids',
    'Hanging Gardens',
  ];
  const BANNED_GOODS = [
    'wood',
    'stone',
    'clay',
    'ore',
    'glass',
    'cloth',
    'papyrus',
    'timber',
    'lumber',
    'brick',
    'wool',
    'grain',
  ];
  const allNames = [
    ...CARDS.map((c) => c.name),
    ...PENDING_CARDS.map((c) => c.name),
    ...GREAT_WORKS.map((w) => w.name),
    ...RAIDS.map((r) => r.name),
    ...HONOURS.map((h) => h.name),
  ];
  const word = (w: string) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}s?\\b`, 'i');

  it('no card, Great Work, Raid or Honour name uses a blocked term or 7 Wonders name', () => {
    const hits = allNames.filter((n) => [...TERMS, ...NAMES].some((b) => word(b).test(n)));
    expect(hits).toEqual([]);
  });

  it('ids follow the names (no stale ids from older drafts)', () => {
    const hits = [...CARDS.map((c) => c.id), ...GREAT_WORKS.map((w) => w.id)].filter((id) =>
      [...TERMS, ...NAMES.map((n) => n.toLowerCase().replace(/ /g, '-'))].some((b) =>
        new RegExp(`(^|-)${b}(-|$)`).test(id),
      ),
    );
    expect(hits).toEqual([]);
  });

  it('goods are ours, not 7 Wonders or Colonizers goods', () => {
    for (const good of GOODS) expect(BANNED_GOODS).not.toContain(good);
  });
});
