// @vitest-environment jsdom
/**
 * QA audit Q6: the words players read about cards. Every card and Great Work in the SHIPPED
 * content, through ui's text (src/game/windamere/text.ts) on every surface that shows it: the card
 * face (name, cost, effect line, Spend line and the amount labels), the tooltip and screen-reader
 * strings the table builds from a face, the Card list sheet (real DOM), the monument,
 * the Great Work choice and the help tooltips. No raw effect type id (camelCase), no "undefined",
 * "NaN", "[object", "Infinity", no empty effect line or empty amount, no raw content id.
 *
 * Known failures are `it.fails` (docs/AUDIT.md): the owning lane (ui) removes the marker in the
 * commit that fixes them. The failure list in each assertion names the card ids.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARDS, GREAT_WORKS, HONOURS, RAIDS } from '../../content/windamere';
import {
  windamereContent,
  type DraftView,
  type EffectSpec,
  type WwSeat,
  type WwTable,
} from '../../engine';
import { TERMS } from '../../ui/help/terms';
import { renderCardList } from '../../ui/help/cards';
import { windamere } from './content';
import { windamerePresenter } from './present';
import { effectText, effectsText } from './text';

const { rules, engine } = windamere();
const presenter = windamerePresenter(rules, engine);
const content = windamereContent();
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

// ---------------------------------------------------------------------------------------------
// What counts as bad text
// ---------------------------------------------------------------------------------------------

/** Every content id (kebab-case ids of cards, Great Works, Honours, Raids): never shown raw. */
const RAW_IDS = [
  ...CARDS.map((c) => c.id),
  ...GREAT_WORKS.map((g) => g.id),
  ...HONOURS.map((h) => h.id),
  ...RAIDS.map((r) => r.id),
].filter((id) => id.includes('-'));

/** What is wrong with one string, as short phrases (empty = fine). */
function badText(text: string): string[] {
  const bad: string[] = [];
  const camel = text.match(/\b[a-z]+[A-Z][A-Za-z]*\b/g);
  if (camel) bad.push(`raw id "${[...new Set(camel)].join('", "')}"`);
  for (const word of ['undefined', 'NaN', '[object', 'Infinity']) {
    if (text.includes(word)) bad.push(`contains "${word}"`);
  }
  if (/\bnull\b/.test(text)) bad.push('contains "null"');
  if (text.trim() === '') bad.push('empty');
  if (/(^|;)\s*(;|$)/.test(text) && text.trim() !== '') bad.push('empty effect line');
  if (/[:+,]\s*($|;)/.test(text)) bad.push('line ends in ":", "+" or ","');
  if (/\+\s*(per|;|$)/.test(text) || /\+0\b/.test(text)) bad.push('empty or zero amount');
  if (/\s{2,}/.test(text)) bad.push('double space');
  if (/\bper\s*(;|$)/.test(text)) bad.push('"per" with nothing after it');
  for (const id of RAW_IDS) if (text.includes(id)) bad.push(`raw content id "${id}"`);
  return bad;
}

/** Collects `where: problem` lines; the test asserts the list is empty so ids show in the diff. */
class Findings {
  readonly lines: string[] = [];
  check(where: string, text: string | undefined): void {
    if (text === undefined) return;
    for (const p of badText(text)) this.lines.push(`${where}: ${p} in "${text.slice(0, 90)}"`);
  }
}

// ---------------------------------------------------------------------------------------------
// The effect vocabulary of RULES.md R13, read from the rules text itself
// ---------------------------------------------------------------------------------------------

/** `type` -> param names from the R13 table in docs/RULES.md. */
function ruledEffects(): Map<string, string[]> {
  const md = readFileSync('docs/RULES.md', 'utf8');
  const out = new Map<string, string[]>();
  for (const line of md.split('\n')) {
    const m = /^\|\s*`([a-zA-Z]+)`\s*\|\s*([^|]*)\|\s*[^|]*\|\s*[^|]*\|\s*$/.exec(line);
    if (!m) continue;
    const params = [...(m[2] ?? '').matchAll(/`([a-zA-Z]+)`/g)].map((x) => x[1] ?? '');
    out.set(m[1] ?? '', params);
  }
  return out;
}

/** A plausible spec for a ruled type, from its parameter names. */
function sampleSpec(type: string, params: string[]): EffectSpec {
  const spec: EffectSpec = { type };
  const goods = rules.goods;
  for (const p of params) {
    if (p === 'gains') spec[p] = { [goods[0] ?? 'reed']: 1, coins: 2 };
    else if (p === 'kind') spec[p] = 'holding';
    else if (p === 'measure') spec[p] = 'guard';
    else if (p === 'good') spec[p] = goods[0] ?? 'reed';
    else if (p === 'coins' || p === 'amount' || p === 'rank' || p === 'per') spec[p] = 2;
    else if (p === 'atLeast') spec[p] = 4;
  }
  return spec;
}

/**
 * Known findings (docs/AUDIT.md Q6): effect types with no text in text.ts, so the card shows the
 * raw id. ui removes `.fails` below, and this list, in the commit that adds the text.
 */
const KNOWN_BAD_CARDS = ['wend-fair', 'commons-of-the-wend', 'brokers-arcade', 'kinsfolk-hall'];

describe('no NEW card with bad text (plain test; the known four are the it.fails below)', () => {
  it('every card outside the known findings reads clean on its face', () => {
    const bad = CARDS.filter(
      (c) =>
        badText(effectsText(rules, c.effects)).length > 0 ||
        badText(presenter.card(c.id).text).length > 0,
    ).map((c) => c.id);
    expect(bad.filter((id) => !KNOWN_BAD_CARDS.includes(id))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------------------

describe('effect text (R13 vocabulary)', () => {
  const ruled = ruledEffects();

  it('the audit reads the R13 table: all the ruled types are found', () => {
    expect(ruled.size).toBeGreaterThanOrEqual(25);
    for (const t of [
      'yield',
      'scoreBeat',
      'onBuildNeighbourMin',
      'scoreNeighbourMin',
      'scoreSales',
    ]) {
      expect(ruled.has(t), t).toBe(true);
    }
  });

  it.fails('every effect type ruled in R13 reads as a sentence, never as its raw id', () => {
    const f = new Findings();
    for (const [type, params] of ruled) {
      const text = effectText(rules, sampleSpec(type, params));
      if (text === type) f.lines.push(`${type}: no text, falls back to the raw id`);
      f.check(`type ${type}`, text);
    }
    expect(f.lines).toEqual([]);
  });

  it.fails('every effect on every shipped card, Perk and tier reward reads as a sentence', () => {
    const f = new Findings();
    const one = (where: string, spec: EffectSpec): void => {
      const text = effectText(rules, spec);
      if (text === spec.type) f.lines.push(`${where}: ${spec.type} has no text`);
      f.check(`${where} (${spec.type})`, text);
    };
    for (const c of content.cards) for (const e of c.effects) one(`card ${c.id}`, e);
    for (const g of content.greatWorks) {
      for (const e of g.perk) one(`Great Work ${g.id} Perk`, e);
      g.tiers.forEach((t, i) =>
        t.reward.forEach((e) => one(`Great Work ${g.id} tier ${i + 1}`, e)),
      );
    }
    expect(f.lines).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------------------------

describe('card faces and the strings the table builds from them', () => {
  it.fails(
    'every card face (name, kind, cost, effect line, Spend line, amount labels) is clean',
    () => {
      const f = new Findings();
      for (const c of CARDS) {
        const face = presenter.card(c.id);
        const where = `card ${c.id}`;
        f.check(`${where} name`, face.name);
        f.check(`${where} kind`, face.kind);
        f.check(`${where} cost`, face.cost || 'free');
        f.check(`${where} text`, face.text);
        f.check(`${where} Spend`, face.alt);
        for (const p of [...(face.costParts ?? []), ...(face.altParts ?? [])]) {
          f.check(`${where} amount label`, p.label);
          f.check(`${where} amount`, p.text);
        }
        // The tooltip and the screen-reader label are built from the face (table.ts).
        f.check(`${where} tooltip`, `${face.name}: ${face.text}`);
        f.check(
          `${where} aria-label`,
          `${face.name}, ${face.kind}${face.cost ? `, costs ${face.cost}` : ''}: ${face.text}${face.alt ? `. ${face.alt}` : ''}`,
        );
        if (c.effects.length > 0 && face.text === 'No effect')
          f.lines.push(`${where}: "No effect" but it has effects`);
      }
      expect(f.lines).toEqual([]);
    },
  );

  it.fails('the Card list sheet (help), rendered in the DOM for every Season, is clean', () => {
    const f = new Findings();
    let rows = 0;
    for (const s of SEASONS) {
      for (const li of renderCardList(s).querySelectorAll('li.ww-card-row')) {
        rows++;
        const name = li.querySelector('strong')?.textContent ?? '?';
        f.check(`sheet ${s} "${name}"`, li.textContent ?? '');
      }
    }
    expect(rows).toBe(CARDS.length);
    expect(f.lines).toEqual([]);
  });

  it('the help tooltips (terms) are clean', () => {
    const f = new Findings();
    for (const t of TERMS) {
      f.check(`term ${t.id} label`, t.label);
      f.check(`term ${t.id}`, t.text);
    }
    expect(f.lines).toEqual([]);
  });
});

describe('Great Works', () => {
  it('Perk, tiers, the choice prompt detail and the monument are clean for every Great Work', () => {
    const f = new Findings();
    // A first-game state: every town has a Great Work from the start, so the monument can be read.
    const base = engine.createGame({
      seed: 1,
      seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      options: { firstGame: true },
    });
    const prompt = presenter.prompt({
      id: 0,
      seat: 0,
      kind: 'greatWork',
      data: null,
      group: 0,
      answered: false,
      answer: null,
    });
    for (const g of GREAT_WORKS) {
      const where = `Great Work ${g.id}`;
      f.check(`${where} name`, g.name);
      f.check(`${where} answer label`, prompt.answer(g.id));
      f.check(`${where} detail`, prompt.detail?.(g.id));
      f.check(`${where} Perk`, effectsText(rules, g.perk));
      g.tiers.forEach((t, i) => f.check(`${where} tier ${i + 1}`, effectsText(rules, t.reward)));
      const state = JSON.parse(JSON.stringify(base)) as typeof base;
      const seat = state.seats[0];
      if (!seat) throw new Error('no seat');
      seat.data.greatWork = g.id;
      const view = engine.viewFor(state, 0) as DraftView<WwSeat, WwTable>;
      const mo = presenter.monument?.(view, 0);
      if (!mo) f.lines.push(`${where}: no monument for a town that has it`);
      else {
        f.check(`${where} monument name`, mo.name);
        f.check(`${where} monument progress`, mo.progress);
        f.check(`${where} monument perk`, mo.perk);
      }
    }
    expect(f.lines).toEqual([]);
  });
});

describe('the checker itself (so a clean result means something)', () => {
  it('flags raw ids, undefined, NaN, empty lines and raw content ids', () => {
    expect(badText('Wend Fair: onBuildNeighbourMin')).not.toEqual([]);
    expect(badText('scoreNeighbourMin')).not.toEqual([]);
    expect(badText('+undefined coins')).not.toEqual([]);
    expect(badText('NaN Renown')).not.toEqual([]);
    expect(badText('[object Object]')).not.toEqual([]);
    expect(badText('Each Yield: +1 Reed; ')).not.toEqual([]);
    expect(badText('Each Yield: +')).not.toEqual([]);
    expect(badText('a;; b')).not.toEqual([]);
    expect(badText('')).not.toEqual([]);
    expect(badText(`built ${RAW_IDS[0] ?? 'x-y'}`)).not.toEqual([]);
  });
  it('passes ordinary card text', () => {
    expect(badText('Each Yield: +1 Reed; 2 Renown per neighbour with fewer Guard')).toEqual([]);
    expect(badText('Cost: 1 Reed, 2 coins. Spend: 4 coins.')).toEqual([]);
    expect(badText('When built: +2 coins per Holding')).toEqual([]);
  });
});
