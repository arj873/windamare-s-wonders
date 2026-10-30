/**
 * Plain-English text for Windamere data: gains, costs and the R13 effect vocabulary. Card faces
 * are text until art A3; these strings are also the screen reader's card labels.
 */
import { ANY, COINS, LABOUR, type EffectSpec, type Gains, type WwRules } from '../../engine';

export const KIND_LABELS: Record<string, { one: string; many: string }> = {
  holding: { one: 'Holding', many: 'Holdings' },
  hall: { one: 'Hall', many: 'Halls' },
  market: { one: 'Market', many: 'Markets' },
  watch: { one: 'Watch', many: 'Watches' },
  lore: { one: 'Lore', many: 'Lore cards' },
  landmark: { one: 'Landmark', many: 'Landmarks' },
};

const MEASURE_LABELS: Record<string, string> = {
  guard: 'Guard',
  holdings: 'Holdings',
  halls: 'Halls',
  markets: 'Markets',
  watches: 'Watches',
  lore: 'Lore cards',
  landmarks: 'Landmarks',
  loreRun: 'longest Lore run',
  tiers: 'Great Work tiers',
  coins: 'coins',
  kinds: 'kinds',
  valour: 'Valour tokens',
};

export const kindOne = (kind: unknown): string => KIND_LABELS[String(kind)]?.one ?? String(kind);
export const kindMany = (kind: unknown): string => KIND_LABELS[String(kind)]?.many ?? String(kind);
export const measureLabel = (m: unknown): string => MEASURE_LABELS[String(m)] ?? String(m);

export function goodName(rules: WwRules, id: string): string {
  return rules.content.goods.find((g) => g.id === id)?.name ?? id;
}

/** "2 Reed, 1 Salt, 3 coins, 1 labour, 1 any good", in goods order; '' for nothing. */
export function gainsText(rules: WwRules, gains: Gains): string {
  const parts: string[] = [];
  for (const g of rules.goods) if (gains[g]) parts.push(`${gains[g]} ${goodName(rules, g)}`);
  const n = (k: string) => gains[k] ?? 0;
  if (n(COINS)) parts.push(`${n(COINS)} coin${n(COINS) === 1 ? '' : 's'}`);
  if (n(LABOUR)) parts.push(`${n(LABOUR)} labour`);
  if (n(ANY)) parts.push(`${n(ANY)} any good${n(ANY) === 1 ? '' : 's'}`);
  return parts.join(', ');
}

const gainsOf = (spec: EffectSpec): Gains => (spec.gains ?? {}) as Gains;
const num = (x: unknown): number => (typeof x === 'number' ? x : 0);
const coins = (n: number): string => `${n} coin${n === 1 ? '' : 's'}`;

/** One R13 effect in a short sentence. Unknown types fall back to their id. */
export function effectText(rules: WwRules, spec: EffectSpec): string {
  const g = gainsText(rules, gainsOf(spec));
  const amount = num(spec.amount);
  switch (spec.type) {
    case 'yield':
      return `Each Yield: +${g}`;
    case 'income':
      return `Each Yield: +${coins(num(spec.coins))}`;
    case 'onBuild':
      return `When built: +${g}`;
    case 'onBuildPerKind':
      return `When built: +${g} per ${kindOne(spec.kind)}`;
    case 'renown':
      return `${amount} Renown`;
    case 'guard':
      return `Guard ${amount}`;
    case 'lore':
      return `Lore rank ${num(spec.rank)}`;
    case 'exchange':
      return `Exchange: ${rules.tunables.exchangeRate} ${goodName(rules, String(spec.good))} for a missing good`;
    case 'discount':
      return `${kindMany(spec.kind)} cost ${amount} fewer good${amount === 1 ? '' : 's'}`;
    case 'toll':
      return `+${coins(num(spec.coins))} per neighbour who builds${spec.kind ? ` a ${kindOne(spec.kind)}` : ''}`;
    case 'sellBonus':
      return `+${coins(num(spec.coins))} per good you sell`;
    case 'spendBonus':
      return `Spend a ${kindOne(spec.kind)}: also +${g}`;
    case 'buildBonus':
      return `Build a ${kindOne(spec.kind)}: also +${g}`;
    case 'heldBonus':
      return `Hold a Raid: +${g}`;
    case 'seasonEnd':
      return `Season end: +${g}`;
    case 'scorePerKind':
      return `${amount} Renown per ${kindOne(spec.kind)}`;
    case 'scorePerTier':
      return `${amount} Renown per Great Work tier`;
    case 'scorePerValour':
      return `${amount} Renown per Valour token`;
    case 'scoreSets':
      return `${amount} Renown per set of Holding, Hall, Market, Watch, Lore`;
    case 'scoreGoods':
      return `${amount} Renown per ${num(spec.per)} goods left`;
    case 'scoreBeat':
      return `${amount} Renown per neighbour with fewer ${measureLabel(spec.measure)}`;
    case 'scoreThreshold':
      return `${amount} Renown at ${num(spec.atLeast)}+ ${measureLabel(spec.measure)}`;
    case 'scoreSeasons':
      return `${amount} Renown per Season you built a ${kindOne(spec.kind)}`;
    default:
      return spec.type;
  }
}

export function effectsText(rules: WwRules, specs: readonly EffectSpec[]): string {
  return specs.length ? specs.map((s) => effectText(rules, s)).join('; ') : 'No effect';
}
