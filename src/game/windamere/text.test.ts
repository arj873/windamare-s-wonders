import { describe, expect, it } from 'vitest';
import type { EffectSpec } from '../../engine';
import { windamere } from './content';
import { windamerePresenter } from './present';
import { effectText, UNKNOWN_EFFECT } from './text';

const { rules, engine } = windamere();
const present = windamerePresenter(rules, engine);

/** Every effect the shipped content can put in front of a player: cards, Perks, tier rewards. */
const shipped: EffectSpec[] = [
  ...rules.content.cards.flatMap((c) => c.effects),
  ...rules.content.greatWorks.flatMap((w) => [...w.perk, ...w.tiers.flatMap((t) => t.reward)]),
];

describe('effect text', () => {
  it('has a sentence for every effect type the content ships, never a raw type id', () => {
    for (const spec of shipped) {
      const text = effectText(rules, spec);
      expect(text, spec.type).not.toBe(UNKNOWN_EFFECT);
      expect(text, spec.type).not.toContain(spec.type);
    }
    for (const card of rules.content.cards) {
      const face = present.card(card.id).text;
      for (const spec of card.effects) expect(face, card.name).not.toContain(spec.type);
    }
  });

  it('words the D10b effects (weaker neighbour, sales)', () => {
    const say = (spec: EffectSpec) => effectText(rules, spec);
    expect(say({ type: 'onBuildNeighbourMin', kind: 'holding', gains: { coins: 2 } })).toBe(
      'When built: +2 coins for each Holding your weaker neighbour has',
    );
    expect(say({ type: 'scoreNeighbourMin', measure: 'halls', amount: 1 })).toBe(
      '1 Renown for each Hall your weaker neighbour has',
    );
    expect(say({ type: 'scoreSales', per: 3, amount: 2 })).toBe(
      '2 Renown per 3 goods you sell to neighbours',
    );
  });

  it('falls back to plain words for a type it does not know', () => {
    expect(effectText(rules, { type: 'brandNewThing' })).toBe(UNKNOWN_EFFECT);
  });
});
