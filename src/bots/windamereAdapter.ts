/**
 * Level-1 greedy adapter for Windamere (RULES.md as of 2026-10-30). "A Build that scores" means
 * the card has an effect that can still pay off: Renown, Guard, Lore and the end-game `score…`
 * effects always; economy effects (Yield, Income, Season-end gains, Tolls, Exchanges, discounts
 * ...) only before Winter, because Winter has no Yield (R3.7) and the game ends soon after.
 * The cost is the printed cost (upgrade cost if the pick covers a card), goods and coins counted
 * alike; neighbour purchases are not priced in. A Spend's value is its band: goods and coins 1,
 * labour 1.5, "any good" 1. Untuned first guesses, not measured play.
 */
import { windamereContent } from '../engine';
import type {
  CardDef,
  EffectSpec,
  WwCardDef,
  WwContent,
  WwPickArgs,
  WwSeat,
  WwTable,
} from '../engine';
import { createGreedyBot, type GreedyAdapter } from './greedy';
import type { Bot } from './types';

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
  'scoreNeighbourMin',
  'scoreSales',
]);
const WINTER = 3;
const CONTENT = windamereContent();

const sum = (g: Record<string, number> | undefined) =>
  Object.values(g ?? {}).reduce((a, b) => a + b, 0);

function scores(effects: readonly EffectSpec[], round: number): boolean {
  return effects.some((e) => ALWAYS.has(e.type) || round < WINTER);
}

export interface WindamereGreedyOptions {
  /** A specialist builds only cards of this kind (others are Spent), for strategy comparisons. */
  focus?: string;
  /**
   * Great Work focus (research S4r): among Builds that score, labour Builds go first; Spends take
   * the most labour; the Great Work offer with the least labour to finish is taken.
   */
  greatWork?: boolean;
  /** With `greatWork`: build only labour cards (everything else is Spent for labour). */
  labourOnly?: boolean;
  /** Content the Great Works are rated from (default: shipped; pass a balance overlay's). */
  content?: WwContent;
}

/**
 * The Great Work choice (R2.5): the offer with the most Renown printed on its tiers, plus 1 for a
 * Perk that scores or defends (renown, guard) and 0.5 for an economy Perk; ties go to the lower
 * labour total (easier to finish). An untuned first guess; it only needs to be a rule, not index 0.
 */
/** Valour a Guard-minded town holds at the end (a first guess from the level 2 sims). */
const EXPECTED_VALOUR = 3;

export function rateGreatWork(content: WwContent, id: string): number {
  const gw = content.greatWorks.find((g) => g.id === id);
  if (!gw) return 0;
  const renown = (specs: readonly EffectSpec[]) =>
    specs.reduce(
      (a, e) =>
        a +
        (e.type === 'renown'
          ? (e.amount as number)
          : e.type === 'scorePerValour'
            ? (e.amount as number) * EXPECTED_VALOUR
            : 0),
      0,
    );
  const tiers = gw.tiers.reduce((a, t) => a + renown(t.reward), 0);
  const perk = gw.perk.reduce(
    (a, e) => a + (e.type === 'renown' || e.type === 'guard' ? 1 : 0.5),
    0,
  );
  const labour = gw.tiers.reduce((a, t) => a + t.threshold, 0);
  return tiers + perk - labour / 1000;
}

/** True if the card's effects hand out labour (Builds that feed the Great Work). */
function givesLabour(d: WwCardDef): boolean {
  return d.effects.some((e) => ((e.gains as Record<string, number> | undefined)?.labour ?? 0) > 0);
}

/** Great Work offers for the focus bot: the least labour to finish all four tiers. */
function labourToFinish(content: WwContent, id: string): number {
  const gw = content.greatWorks.find((g) => g.id === id);
  return gw ? -(gw.tiers[gw.tiers.length - 1]?.threshold ?? 99) : 0;
}

export function windamereAdapter(
  options: WindamereGreedyOptions = {},
): GreedyAdapter<WwSeat, WwTable> {
  const content = options.content ?? CONTENT;
  return {
    rateAnswer(_view, _seat, kind, answer) {
      if (kind !== 'greatWork' || typeof answer !== 'string') return null;
      return options.greatWork ? labourToFinish(content, answer) : rateGreatWork(content, answer);
    },
    assess(view, _seat, pick, def: CardDef | undefined) {
      const d = def as WwCardDef | undefined;
      if (!d) return { scoringBuild: false, cost: 0, value: 0 };
      if (pick.use === 'build') {
        const args = (pick.args ?? {}) as WwPickArgs;
        const cost = sum(args.cover != null && d.upgrade ? d.upgrade.cost : d.cost);
        const focused =
          (options.focus === undefined || d.kind === options.focus) &&
          !(options.greatWork && options.labourOnly && !givesLabour(d));
        // The Great Work focus builds labour cards first: a lower cost wins among scoring Builds.
        const bias = options.greatWork && givesLabour(d) ? 100 : 0;
        return {
          scoringBuild: focused && scores(d.effects, view.round),
          cost: cost - bias,
          value: 0,
        };
      }
      const band = d.spend ?? {};
      const value = options.greatWork
        ? 100 * (band.labour ?? 0) + sum(band)
        : sum(band) + 0.5 * (band.labour ?? 0);
      return { scoringBuild: false, cost: 0, value };
    },
  };
}

/**
 * Level 1 aimed at the Great Work (S4r), for balance to seat as a named policy. Default: scoring
 * Builds still happen but labour Builds go first (`focus-greatWork`). `labourOnly` builds nothing
 * but labour cards (`focus-greatWork-only`), the upper bound of what trying can reach.
 */
export function createGreatWorkBot(
  opts: { content?: WwContent; labourOnly?: boolean; name?: string } = {},
): Bot<WwSeat, WwTable> {
  const adapter = windamereAdapter({
    greatWork: true,
    ...(opts.labourOnly ? { labourOnly: true } : {}),
    ...(opts.content ? { content: opts.content } : {}),
  });
  return createGreedyBot(
    adapter,
    opts.name ?? (opts.labourOnly ? 'focus-greatWork-only' : 'focus-greatWork'),
  );
}
