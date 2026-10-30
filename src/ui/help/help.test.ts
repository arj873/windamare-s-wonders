// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CARDS } from '../../content/windamere';
import { TERMS, termById } from './terms';
import { renderMarkdown } from './markdown';
import { howToPlayBody } from './rules';
import { cardsBySeasonAndKind } from './cards';
import { attachHelp, helpTerm } from './index';

const BLOCKED = /\b(age|stage|shield|science|guild|chain|caravan|treasury)\b/i;

describe('terms', () => {
  it('has unique ids and no blocklisted words', () => {
    expect(new Set(TERMS.map((t) => t.id)).size).toBe(TERMS.length);
    for (const t of TERMS) expect(`${t.label} ${t.text}`).not.toMatch(BLOCKED);
  });
  it('covers goods, coin, labour, Guard, Valour, Renown, Lore rank, Raid', () => {
    for (const id of [
      'reed',
      'peat',
      'salt',
      'wax',
      'horn',
      'coin',
      'labour',
      'guard',
      'valour',
      'renown',
      'rank',
      'raid',
    ])
      expect(termById(id), id).toBeDefined();
  });
});

describe('rules overlay', () => {
  it('renders HOWTOPLAY without the owner note', () => {
    const body = howToPlayBody();
    expect(body.startsWith('**The goal:**')).toBe(true);
    const els = renderMarkdown(body);
    expect(els.some((e) => e.tagName === 'H4')).toBe(true);
    expect(els.some((e) => e.tagName === 'TABLE')).toBe(true);
  });
  it('opens and closes through attachHelp', () => {
    const help = attachHelp(document.body);
    const d = help.openRules();
    expect(document.querySelector('.ww-help-doc')).not.toBeNull();
    expect(help.openRules()).toBe(d);
    d.close();
    help.destroy();
  });
});

describe('card list', () => {
  it('lists every card exactly once across Seasons', () => {
    const n = (['spring', 'summer', 'autumn', 'winter'] as const)
      .flatMap((s) => cardsBySeasonAndKind(s))
      .reduce((a, g) => a + g.cards.length, 0);
    expect(n).toBe(CARDS.length);
  });
  it('opens the dialog', () => {
    const help = attachHelp(document.body);
    help.openCards();
    expect(document.querySelectorAll('.ww-card-row').length).toBeGreaterThan(0);
    help.destroy();
  });
});

describe('tooltips', () => {
  it('shows on focus and hides on Escape', () => {
    const root = document.createElement('div');
    const el = helpTerm('guard', 'Guard');
    root.append(el);
    document.body.append(root);
    const help = attachHelp(root);
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.ww-tip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain('Guard');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tip.hidden).toBe(true);
    help.destroy();
    root.remove();
  });
});
