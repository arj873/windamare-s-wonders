/**
 * DEV AND TEST FIXTURE, NOT GAME CONTENT: a Presenter for the engine's toy ruleset
 * (src/engine/core/testing/toy.ts), so the draft table can be built and tested before the
 * Windamere ruleset (E2) exists. Never import it from shipped code.
 */
import { toyRuleset, type ToySeat, type ToyTable } from '../../../engine/core/testing/toy';
import type { CardDef, EffectSpec, Json } from '../../../engine';
import { HIDDEN_CARD } from '../../../engine';
import type { CardFace, Presenter } from '../present';

const defs = new Map<string, CardDef>(toyRuleset.cards.map((c) => [c.id, c]));

function effectText(e: EffectSpec): string {
  const n = typeof e.amount === 'number' ? e.amount : 0;
  switch (e.type) {
    case 'coins':
      return `+${n} coin${n === 1 ? '' : 's'} now`;
    case 'income':
      return `+${n} coin each round end`;
    case 'points':
      return `${n} points`;
    case 'perNeighbourKind':
      return `1 point per ${String(e.kind)} card next door`;
    case 'salvage':
      return 'Take a card from the discard';
    default:
      return e.type;
  }
}

function face(def: string): CardFace {
  const d = defs.get(def);
  if (!d || def === HIDDEN_CARD) return { name: 'Hidden card', kind: 'hidden', cost: '', text: '' };
  const cost = typeof d.cost === 'number' && d.cost > 0 ? `${d.cost}g` : '';
  return {
    name: d.name,
    kind: d.kind,
    cost,
    text: d.effects.length ? d.effects.map(effectText).join('; ') : 'No effect',
  };
}

const SCORE_LABELS: Record<string, string> = {
  treasury: 'Treasury (coins ÷ 3)',
  stash: 'Stash',
  civic: 'Civic cards',
  neighbours: 'Neighbours',
};

export const toyPresenter: Presenter<ToySeat, ToyTable> = {
  kinds: [
    { id: 'basic', label: 'Basic', mark: '●' },
    { id: 'civic', label: 'Civic', mark: '▲' },
  ],
  uses: [
    { id: 'build', label: 'Build', verb: 'built', key: 'b' },
    { id: 'sell', label: 'Sell for 2g', verb: 'sold', key: 's' },
    { id: 'stash', label: 'Stash', verb: 'stashed', key: 't' },
  ],
  card: face,
  seatStats(view, seat) {
    const s = view.seats[seat];
    if (!s) return [];
    const estimate = Object.values(toyRuleset.score(view, seat)).reduce((a, b) => a + b, 0);
    return [
      { id: 'coins', label: 'Coins', value: `${s.data.coins}g` },
      { id: 'score', label: 'Score estimate', value: `~${estimate}` },
    ];
  },
  roundName: (round, rounds) => `Round ${round + 1} of ${rounds}`,
  zones: { stash: 'Stash' },
  prompt(prompt) {
    if (prompt.kind === 'salvage') {
      return {
        title: 'Salvage: take a card from the discard',
        answer: (a: Json) => (typeof a === 'number' ? salvageName(prompt.data, a) : 'Take nothing'),
      };
    }
    if (prompt.kind === 'opening') {
      return {
        title: 'Opening: take a coin?',
        answer: (a: Json) => (a === 'coins' ? '+1 coin' : 'No thanks'),
      };
    }
    return { title: prompt.kind, answer: (a: Json) => JSON.stringify(a) };
  },
  scoreLabel: (category) => SCORE_LABELS[category] ?? category,
};

function salvageName(data: Json, id: number): string {
  const cards = (data as { cards?: { id: number; def: string }[] } | null)?.cards ?? [];
  const card = cards.find((c) => c.id === id);
  return card ? face(card.def).name : `Card ${id}`;
}
