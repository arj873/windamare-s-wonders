/**
 * Keeps docs/design/CARDS.md in step with the data: every catalog row in the doc must match a
 * row rendered from src/content, and the other way round. If this fails, regenerate the tables
 * from the data (the data is the source of truth, CARDS.md header).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EffectSpec } from '../../engine';
import { CARDS, GREAT_WORKS, HONOURS, PENDING_CARDS, RAIDS } from './index';
import type { Gains } from './index';

const SHORT: Record<string, string> = {
  reed: 'R',
  peat: 'P',
  salt: 'S',
  wax: 'W',
  horn: 'H',
  coins: 'c',
  labour: 'lab',
  any: 'any',
};
const ORDER = ['reed', 'peat', 'salt', 'wax', 'horn', 'labour', 'coins', 'any'];

/** Gains in the CARDS.md shorthand, in table order (goods, labour, coins, any). */
function gs(x: Gains): string {
  const keys = Object.keys(x).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return keys.length ? keys.map((k) => `${x[k]}${SHORT[k]}`).join(' ') : '—';
}

/** One effect as CARDS.md writes it (the shorthand legend in §1). */
function ef(e: EffectSpec): string {
  const p = (k: string) => String(e[k]);
  const gains = () => gs(e.gains as Gains);
  switch (e.type) {
    case 'yield':
      return `yield ${gains()}`;
    case 'income':
      return `income ${p('coins')}`;
    case 'onBuild':
      return `on build ${gains()}`;
    case 'onBuildPerKind':
      return `per ${p('kind')} ${gains()}`;
    case 'renown':
    case 'guard':
      return `${e.type} ${p('amount')}`;
    case 'lore':
      return `lore ${p('rank')}`;
    case 'exchange':
      return `exchange ${SHORT[p('good')] ?? '?'}`;
    case 'discount':
      return `discount ${p('kind')} ${p('amount')}`;
    case 'toll':
      return 'kind' in e ? `toll ${p('kind')} ${p('coins')}` : `toll ${p('coins')}`;
    case 'sellBonus':
      return `sell +${p('coins')}c`;
    case 'spendBonus':
      return `spend ${p('kind')}: +${gains()}`;
    case 'buildBonus':
      return `build ${p('kind')}: +${gains()}`;
    case 'heldBonus':
      return `held +${gains()}`;
    case 'seasonEnd':
      return `season end ${gains()}`;
    case 'scorePerKind':
      return `score ${p('amount')}/${p('kind')}`;
    case 'scorePerTier':
      return `score ${p('amount')}/tier`;
    case 'scorePerValour':
      return `score ${p('amount')}/Valour`;
    case 'scoreSets':
      return `score ${p('amount')}/set`;
    case 'scoreGoods':
      return `score ${p('amount')}/${p('per')} goods`;
    case 'scoreBeat':
      return `score ${p('amount')}/neighbour beaten on ${p('measure')}`;
    case 'scoreThreshold':
      return `score ${p('amount')} if ${p('measure')} ≥ ${p('atLeast')}`;
    case 'scoreSeasons':
      return `score ${p('amount')}/Season with a ${p('kind')}`;
    case 'onBuildNeighbourMin':
      return `on build ${gains()} per ${p('kind')} of the weaker neighbour`;
    case 'scoreNeighbourMin':
      return `score ${p('amount')} per ${p('measure')} of the weaker neighbour`;
    case 'scoreSales':
      return `score ${p('amount')}/${p('per')} goods sold`;
    default:
      return `?${e.type}`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const names = new Map(CARDS.map((c) => [c.id, c.name]));

function dataRows(): string[] {
  const rows: string[] = [];
  for (const c of [...CARDS, ...PENDING_CARDS]) {
    const up = c.upgrade
      ? `${c.upgrade.of.map((i) => names.get(i)).join(' or ')} (${gs(c.upgrade.cost)})`
      : '';
    const effects = c.effects.map(ef).join(', ');
    rows.push(
      `| \`${c.id}\` | ${c.name} | ${cap(c.kind)} | ${gs(c.cost)} | ${up} | ${effects} | ${gs(c.spend)} | ${c.counts.join(' | ')} |`,
    );
  }
  for (const w of GREAT_WORKS) {
    const tiers = w.tiers.map((t) => t.reward.map(ef).join(', ')).join(' | ');
    const thresholds = w.tiers.map((t) => t.threshold).join('/');
    rows.push(
      `| \`${w.id}\` | ${w.name} | ${w.perk.map(ef).join(', ')} | ${tiers} | ${thresholds} |`,
    );
  }
  for (const r of RAIDS)
    rows.push(`| \`${r.id}\` | ${r.name} | ${cap(r.season)} | ${r.strength} |`);
  for (const h of HONOURS) rows.push(`| \`${h.id}\` | ${h.name} | \`${h.measure}\` |`);
  return rows;
}

const norm = (s: string) =>
  s
    .replace(/\s*\|\s*/g, '|')
    .replace(/\s+/g, ' ')
    .trim();

describe('docs/design/CARDS.md matches src/content', () => {
  it('every catalog row in the doc comes from the data, and every data row is in the doc', () => {
    const doc = readFileSync(new URL('../../../docs/design/CARDS.md', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => /^\| `[a-z]/.test(line))
      .map(norm);
    const want = dataRows().map(norm);
    expect({
      missingFromDoc: want.filter((r) => !doc.includes(r)),
      notInData: doc.filter((r) => !want.includes(r)),
    }).toEqual({ missingFromDoc: [], notInData: [] });
    expect(doc).toHaveLength(
      CARDS.length + PENDING_CARDS.length + GREAT_WORKS.length + RAIDS.length + HONOURS.length,
    );
  });
});
