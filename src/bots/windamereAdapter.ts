/**
 * Level-1 greedy adapter for Windamere (RULES.md as of 2026-10-30). "A Build that scores" means
 * the card has an effect that can still pay off: Renown, Guard, Lore and the end-game `score…`
 * effects always; economy effects (Yield, Income, Season-end gains, Tolls, Exchanges, discounts
 * ...) only before Winter, because Winter has no Yield (R3.7) and the game ends soon after.
 * The cost is the printed cost (upgrade cost if the pick covers a card), goods and coins counted
 * alike; neighbour purchases are not priced in. A Spend's value is its band: goods and coins 1,
 * labour 1.5, "any good" 1. Untuned first guesses, not measured play.
 */
import type { CardDef, EffectSpec, WwCardDef, WwPickArgs, WwSeat, WwTable } from '../engine';
import type { GreedyAdapter } from './greedy';

const ALWAYS = new Set([
  'renown',
  'guard',
  'lore',
  'scorePerKind',
  'scorePerTier',
  'scorePerValour',
  'scoreSets',
  'scoreGoods',
  'scoreBeat',
  'scoreThreshold',
  'scoreSeasons',
]);
const WINTER = 3;

const sum = (g: Record<string, number> | undefined) =>
  Object.values(g ?? {}).reduce((a, b) => a + b, 0);

function scores(effects: readonly EffectSpec[], round: number): boolean {
  return effects.some((e) => ALWAYS.has(e.type) || round < WINTER);
}

export interface WindamereGreedyOptions {
  /** A specialist builds only cards of this kind (others are Spent), for strategy comparisons. */
  focus?: string;
}

export function windamereAdapter(
  options: WindamereGreedyOptions = {},
): GreedyAdapter<WwSeat, WwTable> {
  return {
    assess(view, _seat, pick, def: CardDef | undefined) {
      const d = def as WwCardDef | undefined;
      if (!d) return { scoringBuild: false, cost: 0, value: 0 };
      if (pick.use === 'build') {
        const args = (pick.args ?? {}) as WwPickArgs;
        const cost = sum(args.cover != null && d.upgrade ? d.upgrade.cost : d.cost);
        const focused = options.focus === undefined || d.kind === options.focus;
        return { scoringBuild: focused && scores(d.effects, view.round), cost, value: 0 };
      }
      const band = d.spend ?? {};
      const value = sum(band) + 0.5 * (band.labour ?? 0);
      return { scoringBuild: false, cost: 0, value };
    },
  };
}
