/**
 * How the draft table draws Windamere (docs/RULES.md): kinds, Build / Spend, card text, a town's
 * coins / store / Guard / labour, this Season's Raid and market price, the payment choices
 * inside a Build (buy from a neighbour, Exchange or bank; upgrade or full cost) and the Renown
 * bands at the end. Reads views only, through the engine's view-safe helpers.
 */
import {
  BUILD,
  buildCostAfterDiscount,
  currentRaid,
  exchangeGoods,
  guardOf,
  HIDDEN_CARD,
  honourStandings,
  marketPrice,
  missingGoods,
  neighboursOf,
  nextThreshold,
  purseOf,
  scoreTown,
  SEASONS,
  SPEND,
  spendGains,
  latestEvents,
  type DraftEngine,
  type DraftView,
  type Gains,
  type Json,
  type Payment,
  type Pick,
  type SeatId,
  type WwPickArgs,
  type WwRules,
  type WwSeat,
  type WwTable,
} from '../../engine';
import type {
  CardFace,
  FacePart,
  ChoiceOption,
  ChoiceRow,
  HandBadge,
  MonumentInfo,
  Presenter,
  PurseInfo,
  SeasonEndInfo,
  SeatStat,
} from '../../ui/table/present';
import { effectsText, gainsText, goodName, KIND_LABELS } from './text';

type View = DraftView<WwSeat, WwTable>;

/** Placeholder kind marks until art A3 draws kind icons (one shape per kind, never colour alone). */
const KIND_MARKS: Record<string, string> = {
  holding: '⬢',
  hall: '▲',
  market: '●',
  watch: '■',
  lore: '✦',
  landmark: '★',
};

/** RULES.md R12.2 categories as the Renown bands of the final tally (UX.md §10.2). */
const BAND_LABELS: Record<string, string> = {
  town: 'Town',
  greatWork: 'Great Work',
  raids: 'Raids',
  lore: 'Lore',
  honours: 'Honours',
  purse: 'Purse',
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Art A5's icons (public/art/goods/): the five goods plus coin, guard, labour, renown, valour. */
const icon = (name: string): string => `${import.meta.env.BASE_URL}art/goods/${name}.svg`;
/** Any file under public/art (kinds/<kind>, great-works/<content id>: art A6). */
const art = (path: string): string => `${import.meta.env.BASE_URL}art/${path}.svg`;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
/** A Raid's Season as a round index (Raids are drawn per Season, R2.6). */
const raidSeason = (season: string): number =>
  Math.max(0, (SEASONS as readonly string[]).indexOf(season));

/**
 * Art A7's card illustrations: three per kind, a placeholder pool (ART.md). A card whose name
 * matches a picture's subject gets it; any other card gets a stable pick from its kind's three.
 */
const ILLUSTRATIONS: Record<string, readonly [string, RegExp][]> = {
  holding: [
    ['reeds', /reed/i],
    ['peat', /peat/i],
    ['hives', /hive|honey|wax/i],
  ],
  hall: [
    ['moot', /moot/i],
    ['hearth', /hearth/i],
    ['bell', /bell/i],
  ],
  market: [
    ['stall', /stall|cart|row/i],
    ['bridge', /bridge|toll/i],
    ['fair', /fair|cross|inn/i],
  ],
  watch: [
    ['beacon', /beacon/i],
    ['fence', /fence|ditch/i],
    ['gatehouse', /gate|tower|moat/i],
  ],
  lore: [
    ['almanac', /almanac|archive|chronicle/i],
    ['stars', /star|sky/i],
    ['rune', /rune|tally/i],
  ],
  landmark: [
    ['barrow', /barrow|stone/i],
    ['highhall', /high hall|hall/i],
    ['orrery', /orrery|wheel/i],
  ],
};

export function illustration(id: string, name: string, kind: string): string | undefined {
  const pool = ILLUSTRATIONS[kind];
  if (!pool) return undefined;
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = pool.find(([, re]) => re.test(name)) ?? pool[hash % pool.length];
  return pick ? art(`cards/${kind}-${pick[0]}`) : undefined;
}
const argsOf = (pick: Pick): WwPickArgs => (pick.args ?? {}) as WwPickArgs;
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A short cost for a card corner: "1 Reed 3c"; '' = free. */
function costShort(rules: WwRules, cost: Gains): string {
  const parts = rules.goods.filter((g) => cost[g]).map((g) => `${cost[g]} ${goodName(rules, g)}`);
  if (cost.coins) parts.push(`${cost.coins}c`);
  return parts.join(' ');
}

export function windamerePresenter(
  rules: WwRules,
  engine: DraftEngine<WwSeat, WwTable>,
): Presenter<WwSeat, WwTable> {
  const nameOf = (view: View, seat: SeatId) => view.seats[seat]?.name ?? `Town ${seat + 1}`;
  const check = (view: View, seat: SeatId, pick: Pick) =>
    engine.ruleset.validatePick(view, seat, pick);
  const normalize = (view: View, seat: SeatId, pick: Pick) =>
    engine.ruleset.normalizePick?.(view, seat, pick) ?? pick;

  function card(def: string): CardFace {
    if (def === HIDDEN_CARD) return { name: 'Hidden card', kind: 'hidden', cost: '', text: '' };
    const d = rules.card(def);
    const upgrade = d.upgrade
      ? ` · Upgrades ${d.upgrade.of.map((id) => rules.card(id).name).join(' or ')} for ${
          costShort(rules, d.upgrade.cost) || 'free'
        }`
      : '';
    return {
      name: d.name,
      kind: d.kind,
      cost: costShort(rules, d.cost),
      text: effectsText(rules, d.effects) + upgrade,
      alt: `Spend: +${gainsText(rules, d.spend)}`,
      costParts: parts(d.cost),
      altParts: parts(d.spend),
      art: illustration(d.id, d.name, d.kind),
    };
  }

  /** Gains or a cost as icon + number parts (R6 #5), in goods order, then coins, labour, any. */
  function parts(gains: Gains): FacePart[] {
    const out: FacePart[] = [];
    for (const g of rules.goods) {
      const n = gains[g];
      if (n) {
        out.push({ icon: icon(g), text: String(n), label: `${n} ${goodName(rules, g)}`, term: g });
      }
    }
    const add = (key: string, iconName: string | null, word: string, term: string) => {
      const n = gains[key];
      if (!n) return;
      out.push({
        ...(iconName ? { icon: icon(iconName) } : {}),
        text: iconName ? String(n) : `${n} ${word}`,
        label: `${n} ${word}`,
        term,
      });
    };
    add('coins', 'coin', 'coins', 'coin');
    add('labour', 'labour', 'labour', 'labour');
    add('any', null, 'any', 'any');
    return out;
  }

  function paymentText(view: View, p: Payment): string {
    const good = goodName(rules, p.good);
    if (p.via === 'buy')
      return `buy ${good} from ${nameOf(view, p.from)} (${marketPrice(rules, view)}g)`;
    if (p.via === 'exchange') {
      return `${rules.tunables.exchangeRate} ${goodName(rules, p.give)} for ${good}`;
    }
    return `${good} from the bank (${rules.tunables.bankPrice}g)`;
  }

  function describe(view: View, seat: SeatId, pick: Pick): string {
    const s = view.seats[seat];
    const c = s?.hand.find((x) => x.id === pick.card);
    if (!s || !c) return '';
    const def = rules.card(c.def);
    const args = argsOf(pick);
    if (pick.use === SPEND) {
      return `+${gainsText(rules, spendGains(rules, view, seat, def, args.any ?? [])) || 'nothing'}`;
    }
    const cost = buildCostAfterDiscount(
      rules,
      view,
      seat,
      def,
      args.cover ?? null,
      args.discount ?? [],
    );
    if (typeof cost === 'string') return '';
    const store = purseOf(view, seat).store;
    const own: Gains = {};
    for (const g of rules.goods) {
      const n = Math.min(cost[g] ?? 0, store[g] ?? 0);
      if (n) own[g] = n;
    }
    if (cost.coins) own.coins = cost.coins;
    const parts: string[] = [];
    if (gainsText(rules, own)) parts.push(`pay ${gainsText(rules, own)}`);
    for (const p of args.pay ?? []) parts.push(paymentText(view, p));
    if (parts.length === 0) parts.push('free');
    const covered = args.cover != null ? s.tableau.find((x) => x.id === args.cover) : undefined;
    if (covered) parts.push(`covers ${rules.card(covered.def).name}`);
    return parts.join(' · ');
  }

  function whyNot(view: View, seat: SeatId, pick: Pick, error: string): string {
    const msg = error.replace(/^cannot pay for [^:]+: /, '');
    if (pick.use === BUILD && /^pay names 0 good/.test(msg)) {
      const c = view.seats[seat]?.hand.find((x) => x.id === pick.card);
      if (c) {
        const def = rules.card(c.def);
        const args = argsOf(pick);
        const cost = buildCostAfterDiscount(
          rules,
          view,
          seat,
          def,
          args.cover ?? null,
          args.discount ?? [],
        );
        if (typeof cost !== 'string') {
          const short: Gains = {};
          for (const g of missingGoods(rules, cost, purseOf(view, seat)))
            short[g] = (short[g] ?? 0) + 1;
          return `Can't pay: short ${gainsText(rules, short)}`;
        }
      }
    }
    return capitalize(msg.replace(/ \(R[\d.a-z]+\)$/, ''));
  }

  function option(
    view: View,
    seat: SeatId,
    key: string,
    label: string,
    pick: Pick,
    selected: boolean,
  ): ChoiceOption {
    const err = check(view, seat, pick);
    return { key, label, pick, selected, why: err ? whyNot(view, seat, pick, err) : null };
  }

  function choices(view: View, seat: SeatId, pick: Pick): ChoiceRow[] {
    if (pick.use !== BUILD) return [];
    const s = view.seats[seat];
    const c = s?.hand.find((x) => x.id === pick.card);
    if (!s || !c) return [];
    const def = rules.card(c.def);
    const args = argsOf(pick);
    const rows: ChoiceRow[] = [];

    const upgradable = def.upgrade ? s.tableau.filter((t) => def.upgrade?.of.includes(t.def)) : [];
    if (def.upgrade && upgradable.length) {
      const opts = upgradable.map((t) =>
        option(
          view,
          seat,
          `cover-${t.id}`,
          `Upgrade ${rules.card(t.def).name} (${costShort(rules, def.upgrade?.cost ?? {}) || 'free'})`,
          normalize(view, seat, { card: c.id, use: BUILD, args: { cover: t.id } }),
          args.cover === t.id,
        ),
      );
      opts.push(
        option(
          view,
          seat,
          'full',
          `Full cost (${costShort(rules, def.cost) || 'free'})`,
          normalize(view, seat, { card: c.id, use: BUILD, args: { cover: null } }),
          args.cover == null,
        ),
      );
      rows.push({ key: 'cover', label: 'Upgrade', options: opts });
    }

    const pay = args.pay ?? [];
    const price = marketPrice(rules, view);
    pay.forEach((p, i) => {
      const alternatives: { key: string; label: string; pay: Payment }[] = [
        ...neighboursOf(view, seat).map((n) => ({
          key: `buy-${n}`,
          label: `${nameOf(view, n)} ${price}g`,
          pay: { good: p.good, via: 'buy', from: n } as Payment,
        })),
        ...exchangeGoods(rules, view, seat)
          .filter((x) => x !== p.good)
          .map((x) => ({
            key: `exchange-${x}`,
            label: `${rules.tunables.exchangeRate} ${goodName(rules, x)}`,
            pay: { good: p.good, via: 'exchange', give: x } as Payment,
          })),
        {
          key: 'bank',
          label: `Bank ${rules.tunables.bankPrice}g`,
          pay: { good: p.good, via: 'bank' },
        },
      ];
      rows.push({
        key: `pay-${i}-${p.good}`,
        label: `Get ${goodName(rules, p.good)}`,
        options: alternatives.map((a) => ({
          ...option(
            view,
            seat,
            a.key,
            a.label,
            {
              ...pick,
              args: { ...args, pay: pay.map((q, j) => (j === i ? a.pay : q)) } as unknown as Json,
            },
            sameJson(a.pay, p),
          ),
          // R6 #2: the bank charges far more than a neighbour.
          warn: a.pay.via === 'bank',
        })),
      });
    });
    return rows;
  }

  /** R6 #4: the latest action's interaction in plain sentences, with names and prices. */
  function happenings(view: View): string[] {
    const name = (s: SeatId) => nameOf(view, s);
    const good = (g: string) => goodName(rules, g);
    const out: string[] = [];
    for (const { event: e } of latestEvents(view)) {
      switch (e.type) {
        case 'pay':
          for (const g of e.bank) {
            out.push(
              `${name(e.seat)} bought ${good(g)} from the bank (${rules.tunables.bankPrice}g)`,
            );
          }
          for (const x of e.exchanges) {
            out.push(
              `${name(e.seat)} exchanged ${rules.tunables.exchangeRate} ${good(x.give)} for ${good(x.for)}`,
            );
          }
          break;
        case 'trade':
          out.push(
            e.filled
              ? `${name(e.buyer)} bought ${good(e.good)} from ${name(e.seller)} (${e.price}g)`
              : `${name(e.buyer)} bought ${good(e.good)} from the bank: ${name(e.seller)} ran short`,
          );
          break;
        case 'toll':
          out.push(`${name(e.seat)} collected ${e.coins} coin${e.coins === 1 ? '' : 's'} in tolls`);
          break;
        case 'tier':
          out.push(
            `${name(e.seat)} completed ${rules.greatWork(e.greatWork).name} tier ${ROMAN[e.tier - 1] ?? e.tier}`,
          );
          break;
        case 'raid':
          out.push(raidLine(view, e));
          break;
        case 'bounty':
          out.push(`${name(e.to)} took a ${e.coins}-coin bounty from ${name(e.from)}`);
          break;
        case 'honour': {
          const h = rules.honour(e.honour).name;
          out.push(
            e.leaders.length
              ? `${e.leaders.map(name).join(' and ')} now lead${e.leaders.length === 1 ? 's' : ''} ${h}`
              : `Nobody leads ${h} now`,
          );
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  function raidLine(
    view: View,
    e: {
      seat: SeatId;
      outcome: string;
      guard: number;
      strength: number;
      valour: number;
      lost: number;
    },
  ): string {
    const who = nameOf(view, e.seat);
    return e.outcome === 'held'
      ? `${who} held the Raid (Guard ${e.guard} vs ${e.strength}): +${e.valour} Valour`
      : `${who} was plundered (Guard ${e.guard} vs ${e.strength}): −${e.lost} coin${e.lost === 1 ? '' : 's'}`;
  }

  /** UX.md §10.1: the Season-end card, when the latest action resolved a Raid. */
  function seasonEnd(view: View): SeasonEndInfo | null {
    const events = latestEvents(view).map((x) => x.event);
    const raids = events.flatMap((e) => (e.type === 'raid' ? [e] : []));
    const first = raids[0];
    if (!first) return null;
    const raid = rules.raid(first.raid);
    const season = (r: number) => capitalize(SEASONS[r] ?? `Season ${r + 1}`);
    const lines: SeasonEndInfo['lines'] = raids.map((e) => ({
      seat: e.seat,
      text: raidLine(view, e),
      tone: e.outcome === 'held' ? 'gain' : 'loss',
    }));
    for (const e of events) {
      if (e.type === 'bounty') {
        lines.push({
          seat: e.to,
          text: `${nameOf(view, e.to)} took a ${e.coins}-coin bounty from ${nameOf(view, e.from)}`,
          tone: 'info',
        });
      }
    }
    // The next Season is already dealt (round + 1) when this action ended the last one.
    const next = view.round > raidSeason(raid.season) ? view.round : null;
    const dir = view.passDirection === 'left' ? '◀ left' : '▶ right';
    return {
      title: `End of ${season(raidSeason(raid.season))} · ${raid.name}, strength ${raid.strength}`,
      lines,
      next: next === null ? null : `Next: ${season(next)} · hands pass ${dir}`,
    };
  }

  /** R6 #1: a hand card's Build at a glance, from its default legal Build (null = illegal). */
  function badge(view: View, seat: SeatId, pick: Pick | null): HandBadge {
    if (!pick) return { text: '✗ Spend only', tone: 'no' };
    const p = purse(view, seat, pick);
    const spent = p ? p.before - p.after : 0;
    const coins = spent > 0 ? ` · ${spent}g` : '';
    const pay = argsOf(pick).pay ?? [];
    if (pay.some((x) => x.via === 'bank')) return { text: `Build: bank${coins}`, tone: 'warn' };
    if (pay.length > 0) return { text: `Build: buy ${pay.length}${coins}`, tone: 'buy' };
    return { text: `✓ Build${coins}`, tone: 'ok' };
  }

  /** R6 #2: coins before → after a pick; a Build that pays the bank is flagged. */
  function purse(view: View, seat: SeatId, pick: Pick): PurseInfo | null {
    const s = view.seats[seat];
    const c = s?.hand.find((x) => x.id === pick.card);
    if (!s || !c) return null;
    const def = rules.card(c.def);
    const args = argsOf(pick);
    const before = s.data.coins;
    if (pick.use === SPEND) {
      const coins = spendGains(rules, view, seat, def, args.any ?? []).coins ?? 0;
      return { before, after: before + coins, warn: false };
    }
    const cost = buildCostAfterDiscount(
      rules,
      view,
      seat,
      def,
      args.cover ?? null,
      args.discount ?? [],
    );
    if (typeof cost === 'string') return null;
    const t = rules.tunables;
    const pay = args.pay ?? [];
    const spent =
      (cost.coins ?? 0) +
      pay.reduce(
        (n, p) =>
          n + (p.via === 'buy' ? marketPrice(rules, view) : p.via === 'bank' ? t.bankPrice : 0),
        0,
      );
    return { before, after: before - spent, warn: pay.some((p) => p.via === 'bank') };
  }

  return {
    kinds: Object.entries(KIND_LABELS).map(([id, l]) => ({
      id,
      label: l.one,
      mark: KIND_MARKS[id] ?? '◇',
      icon: art(`kinds/${id}`),
      term: id, // tutorial's glossary uses the kind ids
    })),
    monument(view, seat): MonumentInfo | null {
      const d = view.seats[seat]?.data;
      if (!d?.greatWork) return null;
      const gw = rules.greatWork(d.greatWork);
      const next = nextThreshold(rules, d);
      return {
        name: gw.name,
        art: art(`great-works/${gw.id}`),
        tiers: d.tiers,
        total: gw.tiers.length,
        progress:
          next === null
            ? `Labour ${d.labour} · every tier done`
            : `Labour ${d.labour} · tier ${ROMAN[d.tiers] ?? d.tiers + 1} at ${next}`,
        perk: effectsText(rules, gw.perk),
      };
    },
    uses: [
      { id: BUILD, label: 'Build', verb: 'built', key: 'b', term: 'build' },
      { id: SPEND, label: 'Spend', verb: 'spent', key: 's', term: 'spend' },
    ],
    card,
    seatStats(view, seat): SeatStat[] {
      const s = view.seats[seat];
      if (!s) return [];
      const d = s.data;
      const renown = Object.values(scoreTown(rules, view, seat)).reduce((a, b) => a + b, 0);
      return [
        {
          id: 'coins',
          label: 'Coins',
          short: 'Coins',
          value: `${d.coins}`,
          icon: icon('coin'),
          term: 'coin',
        },
        {
          id: 'score',
          label: 'Score (Renown estimate)',
          short: 'Score',
          value: `~${renown}`,
          icon: icon('renown'),
          term: 'renown',
        },
        {
          id: 'guard',
          label: 'Guard (against the Raid)',
          short: 'Guard',
          value: `${guardOf(rules, view, seat)}`,
          icon: icon('guard'),
          term: 'guard',
        },
        {
          id: 'labour',
          label: 'Labour (raises your Great Work)',
          short: 'Labour',
          value: `${d.labour}`,
          icon: icon('labour'),
          term: 'labour',
        },
        ...rules.goods.map((g) => ({
          id: `good-${g}`,
          label: goodName(rules, g),
          value: `${d.store[g] ?? 0}`,
          group: 'store',
          dim: !d.store[g],
          icon: icon(g),
          term: g,
        })),
      ];
    },
    roundName: (round) => capitalize(SEASONS[round] ?? `Season ${round + 1}`),
    zones: { glean: 'Glean', covered: 'Covered' },
    prompt(prompt) {
      if (prompt.kind !== 'greatWork') {
        return { title: prompt.kind, answer: (a) => JSON.stringify(a) };
      }
      // R2.4, R2.5: choose 1 of the offered Great Works, hidden until everyone has chosen.
      const work = (a: Json) => (typeof a === 'string' ? rules.greatWork(a) : null);
      return {
        title: 'Choose your Great Work',
        hint: 'Hidden until every town has chosen. You can change it until then.',
        answer: (a) => work(a)?.name ?? String(a),
        art: (a) => {
          const gw = work(a);
          return gw ? art(`great-works/${gw.id}`) : undefined;
        },
        detail: (a) => {
          const gw = work(a);
          if (!gw) return '';
          const tiers = gw.tiers.map(
            (t, i) =>
              `${ROMAN[i] ?? i + 1} at ${t.threshold} labour: ${effectsText(rules, t.reward)}`,
          );
          return [`Perk: ${effectsText(rules, gw.perk)}`, ...tiers].join('\n');
        },
      };
    },
    scoreLabel: (category) => BAND_LABELS[category] ?? category,
    banner(view) {
      const raid = currentRaid(rules, view);
      const honours = honourStandings(rules, view).map((h) => ({
        id: `honour-${h.honour}`,
        label: 'Honour',
        value: `${rules.honour(h.honour).name}: ${
          h.leaders.length ? h.leaders.map((l) => nameOf(view, l)).join(', ') : 'nobody yet'
        }`,
        group: 'side',
        term: 'honour',
      }));
      return [
        {
          id: 'raid',
          label: 'This Season’s Raid',
          value: raid ? `${raid.name} · strength ${raid.strength}` : 'Raid not revealed',
          term: 'raid',
        },
        {
          id: 'market',
          label: 'Price of a good from a neighbour',
          value: `Market ${marketPrice(rules, view)}g`,
          term: 'price',
        },
        ...honours,
      ];
    },
    describe,
    choices,
    whyNot,
    purse,
    badge,
    happenings,
    seasonEnd,
  };
}
