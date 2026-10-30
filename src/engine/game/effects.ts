/**
 * The R13 effect vocabulary as data-driven handlers (docs/ENGINE.md §8). Effects with a trigger
 * act through `onPlay` / `onRoundEnd` / `score`; the passive ones (`yield`, `income`,
 * `exchange`, `discount`, `toll`, `sellBonus`, `spendBonus`, `buildBonus`, `guard`, `lore`,
 * `heldBonus`) only validate here and are read by the turn, Raid and scoring code.
 *
 * `score` returns `{ renown: n }`; `scoreTown` files it under a group by the effect's source
 * (R12.2).
 */
import type { EffectHandler, EffectSpec, Json } from '../core';
import type { WwRules } from './content';
import { addGains, anyCount, checkGains, resolveAny, type GainsAllow } from './gains';
import { countKind, goodsHeld, measure, neighboursBeaten, seasonsWithKind, townOf } from './town';
import {
  KINDS,
  MEASURES,
  type Gains,
  type Kind,
  type Measure,
  type WwSeat,
  type WwTable,
} from './types';

type Handler = EffectHandler<WwSeat, WwTable>;

const isCount = (x: Json | undefined, min = 0): boolean =>
  typeof x === 'number' && Number.isInteger(x) && x >= min;
const num = (spec: EffectSpec, key: string): number => spec[key] as number;
const kindOk = (x: Json | undefined): x is Kind => KINDS.includes(x as Kind);
const measureOk = (x: Json | undefined): x is Measure => MEASURES.includes(x as Measure);

export function makeEffects(rules: WwRules): Record<string, Handler> {
  const gainsCheck =
    (allow: GainsAllow = { labour: true }) =>
    (spec: EffectSpec) =>
      checkGains(rules.goods, spec.gains, allow);
  const amountCheck = (spec: EffectSpec) =>
    isCount(spec.amount, 1) ? null : 'amount must be a positive integer';
  const coinsCheck = (spec: EffectSpec) =>
    isCount(spec.coins, 1) ? null : 'coins must be a positive integer';
  const perKind = (spec: EffectSpec) =>
    kindOk(spec.kind) ? amountCheck(spec) : `kind must be one of ${KINDS.join(', ')}`;
  const renown = (n: number) => ({ renown: n });

  return {
    // R7.3, R12.2a/b: printed Renown.
    renown: { validate: amountCheck, score: (_s, _seat, spec) => renown(num(spec, 'amount')) },
    // R9.2: read by guardOf.
    guard: { validate: amountCheck },
    // R7.6, R10.1: read by loreRanks.
    lore: {
      validate: (spec) =>
        isCount(spec.rank, 1) && num(spec, 'rank') <= 6 ? null : 'rank must be 1 to 6',
    },
    // "When built" gains; a tier's `onBuild` pays when the tier completes (R8.4). "any" is
    // allowed in a card's own onBuild (R13.4): the pick's `args.any` names the goods, in the
    // order of the card's onBuild effects.
    onBuild: {
      validate: gainsCheck({ labour: true, any: true }),
      onPlay: (ctx, seat, spec, source, args) => {
        let gains = spec.gains as Gains;
        if (anyCount(gains) > 0) {
          const chosen = (args as { any?: string[] } | undefined)?.any ?? [];
          const before = source
            ? ctx.def(source).effects.slice(0, ctx.def(source).effects.indexOf(spec))
            : [];
          const offset = before
            .filter((e) => e.type === 'onBuild')
            .reduce((n, e) => n + anyCount(e.gains as Gains), 0);
          gains = resolveAny(gains, chosen.slice(offset, offset + anyCount(gains)));
        }
        addGains(townOf(ctx.state, seat).data, gains);
      },
    },
    // Gains once per uncovered card of `kind`, this card included if it matches (R13, R17.8).
    onBuildPerKind: {
      validate: (spec) => (kindOk(spec.kind) ? gainsCheck()(spec) : 'kind must be a kind'),
      onPlay: (ctx, seat, spec) =>
        addGains(
          townOf(ctx.state, seat).data,
          spec.gains as Gains,
          countKind(rules, ctx.state, seat, spec.kind as string),
        ),
    },
    // R9: read by resolveRaid after the bounty.
    heldBonus: { validate: gainsCheck() },
    // --- read by the turn (turn.ts, pay.ts) ---
    yield: { validate: gainsCheck() },
    income: { validate: (spec) => coinsCheck(spec) },
    exchange: {
      validate: (spec) =>
        rules.goods.includes(spec.good as string)
          ? null
          : `good must be one of ${rules.goods.join(', ')}`,
    },
    discount: { validate: perKind },
    toll: {
      validate: (spec) =>
        spec.kind !== undefined && !kindOk(spec.kind) ? 'kind must be a kind' : coinsCheck(spec),
    },
    sellBonus: { validate: (spec) => coinsCheck(spec) },
    spendBonus: {
      validate: (spec) => (kindOk(spec.kind) ? gainsCheck()(spec) : 'kind must be a kind'),
    },
    buildBonus: {
      validate: (spec) => (kindOk(spec.kind) ? gainsCheck()(spec) : 'kind must be a kind'),
    },
    // R3.6: at the end of each Season, after the Raid, in seat order (the core's round end).
    seasonEnd: {
      validate: gainsCheck(),
      onRoundEnd: (ctx, seat, spec) => addGains(townOf(ctx.state, seat).data, spec.gains as Gains),
    },
    // R12.2a-b scoring effects.
    scorePerKind: {
      validate: perKind,
      score: (state, seat, spec) =>
        renown(num(spec, 'amount') * countKind(rules, state, seat, spec.kind as string)),
    },
    scorePerTier: {
      validate: amountCheck,
      score: (state, seat, spec) => renown(num(spec, 'amount') * townOf(state, seat).data.tiers),
    },
    scorePerValour: {
      validate: amountCheck,
      score: (state, seat, spec) =>
        renown(num(spec, 'amount') * townOf(state, seat).data.valour.length),
    },
    // A full set: one each of Holding, Hall, Market, Watch and Lore.
    scoreSets: {
      validate: amountCheck,
      score: (state, seat, spec) => {
        const sets = Math.min(
          ...(['holding', 'hall', 'market', 'watch', 'lore'] as const).map((k) =>
            countKind(rules, state, seat, k),
          ),
        );
        return renown(num(spec, 'amount') * sets);
      },
    },
    scoreGoods: {
      validate: (spec) => (isCount(spec.per, 1) ? amountCheck(spec) : 'per must be >= 1'),
      score: (state, seat, spec) =>
        renown(num(spec, 'amount') * Math.floor(goodsHeld(state, seat) / num(spec, 'per'))),
    },
    scoreBeat: {
      validate: (spec) =>
        measureOk(spec.measure)
          ? amountCheck(spec)
          : `measure must be one of ${MEASURES.join(', ')}`,
      score: (state, seat, spec) =>
        renown(num(spec, 'amount') * neighboursBeaten(rules, state, seat, spec.measure as Measure)),
    },
    scoreThreshold: {
      validate: (spec) => {
        if (!measureOk(spec.measure)) return `measure must be one of ${MEASURES.join(', ')}`;
        if (!isCount(spec.atLeast, 1)) return 'atLeast must be a positive integer';
        return amountCheck(spec);
      },
      score: (state, seat, spec) =>
        renown(
          measure(rules, state, seat, spec.measure as Measure) >= num(spec, 'atLeast')
            ? num(spec, 'amount')
            : 0,
        ),
    },
    // Per Season whose deck gave the town at least one uncovered card of `kind`.
    scoreSeasons: {
      validate: perKind,
      score: (state, seat, spec) =>
        renown(num(spec, 'amount') * seasonsWithKind(rules, state, seat, spec.kind as string)),
    },
  };
}
