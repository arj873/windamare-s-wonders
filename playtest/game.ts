/**
 * Text-mode Windamere table for player agents (Q2, layer 1): the real engine, bots in the seats
 * nobody plays, and a command vocabulary that mirrors what the browser UI offers (status, cards,
 * pick, unpick, choose). It reads the seat's `viewFor` only, never the full state, so what an
 * agent sees is what that player's screen may show. It does not exercise the UI: it finds rules,
 * wording and flow problems before the browser layer exists.
 */
import { pickFor, type BotLevel } from '../src/bots';
import { windamere, windamereRules } from '../src/bots/windamere';
import {
  BUILD,
  SPEND,
  currentRaid,
  guardOf,
  marketPrice,
  neighboursOf,
  nextThreshold,
  scoreTown,
  type DraftAction,
  type DraftState,
  type DraftView,
  type Json,
  type Payment,
  type Pick,
  type SeatId,
  type WwPickArgs,
  type WwSeat,
  type WwTable,
} from '../src/engine';
import { windamerePresenter } from '../src/game/windamere/present';
import { effectsText, gainsText } from '../src/game/windamere/text';
import { matchChoice, parseSeat } from './text';

type State = DraftState<WwSeat, WwTable>;
type View = DraftView<WwSeat, WwTable>;

const rules = windamereRules;
const engine = windamere;
const presenter = windamerePresenter(rules, engine);
const ROMAN = ['I', 'II', 'III', 'IV'];
const USES: Record<string, string> = { build: BUILD, spend: SPEND };

export interface TextGameOptions {
  seats: number;
  /** 0-based seats played by hand; every other seat is a bot. */
  humans: number[];
  seed: string;
  level?: BotLevel;
}

export interface Reply {
  out: string;
  /** For `probe`: the seat has something to do, or the game is over. */
  ready?: boolean;
}

export class TextGame {
  state: State;
  readonly humans: ReadonlySet<SeatId>;
  private readonly level: BotLevel;
  private readonly salt: number;

  constructor(opts: TextGameOptions) {
    this.humans = new Set(opts.humans);
    this.level = opts.level ?? 'medium';
    this.salt = hashString(opts.seed);
    this.state = engine.createGame({
      seed: opts.seed,
      seats: Array.from({ length: opts.seats }, (_, i) => ({
        name: this.humans.has(i) ? `Seat${i + 1}` : `Bot${i + 1}`,
      })),
    });
    this.runBots();
  }

  get over(): boolean {
    return this.state.phase.kind === 'gameOver';
  }

  private view(seat: SeatId): View {
    return engine.viewFor(this.state, seat) as View;
  }

  private name(seat: SeatId): string {
    return this.state.seats[seat]?.name ?? `Seat${seat + 1}`;
  }

  /** Bots act for every bot seat the table waits on, until only humans (or nobody) are left. */
  private runBots(): void {
    for (let guard = 0; guard < 10_000 && !this.over; guard++) {
      const bot = engine.waitingOn(this.state).find((s) => !this.humans.has(s));
      if (bot === undefined) return;
      const action = pickFor(engine, this.view(bot), bot, { level: this.level, salt: this.salt });
      if (!action) throw new Error(`bot ${bot} has no action at seq ${this.state.seq}`);
      this.apply(action);
    }
  }

  private apply(action: DraftAction): string | null {
    const r = engine.applyAction(this.state, action);
    if (!r.ok) return r.error;
    this.state = r.state;
    return null;
  }

  /** Does this seat have to act now? */
  waiting(seat: SeatId): boolean {
    return this.over || engine.waitingOn(this.state).includes(seat);
  }

  probe(seat: SeatId): Reply {
    if (this.over) return { out: 'The game is over.\n' + this.result(), ready: true };
    if (this.waiting(seat)) return { out: this.status(seat), ready: true };
    return { out: `Waiting for ${this.waitingNames(seat)}.`, ready: false };
  }

  private waitingNames(seat: SeatId): string {
    const names = engine.waitingOn(this.state).map((s) => (s === seat ? 'you' : this.name(s)));
    return names.join(', ') || 'the table';
  }

  /** One command from a human seat. Never throws on bad input: the reply says what to do. */
  run(seat: SeatId, cmd: string, args: string[], flags: Record<string, string>): Reply {
    if (!this.humans.has(seat)) return { out: `${this.name(seat)} is a bot.` };
    switch (cmd) {
      case 'status':
        return { out: this.status(seat) };
      case 'cards':
        return { out: this.cards(seat) };
      case 'pick':
        return { out: this.pickCmd(seat, args, flags) };
      case 'unpick':
        return { out: this.unpick(seat) };
      case 'choose':
      case 'choose-gw':
        return { out: this.choose(seat, args) };
      case 'result':
        return { out: this.over ? this.result() : 'The game is not over yet.' };
      case 'probe':
        return this.probe(seat);
      default:
        return { out: `Unknown command "${cmd}". Try: status, cards, pick, unpick, choose, wait.` };
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Looking
  // ---------------------------------------------------------------------------------------------

  status(seat: SeatId): string {
    const v = this.view(seat);
    const lines: string[] = [];
    if (this.over) lines.push('GAME OVER', this.result());
    const me = at(v.seats, seat);
    const season = presenter.roundName(v.round, 4);
    lines.push(
      `${season}, turn ${v.turn + 1} of ${v.roundPicks} · hands pass ${v.passDirection} · ` +
        `market ${marketPrice(rules, v)}g, bank ${rules.tunables.bankPrice}g`,
    );
    const raid = currentRaid(rules, v);
    lines.push(`Raid this Season: ${raid ? `${raid.name}, strength ${raid.strength}` : 'hidden'}`);
    lines.push(
      'Honours: ' +
        (presenter.banner?.(v) ?? [])
          .filter((b) => b.id.startsWith('honour-'))
          .map((b) => b.value)
          .join(' · '),
    );
    lines.push('', `YOU (${me.name}): ${townLine(v, seat)}`);
    lines.push(`  Great Work: ${greatWorkLine(v, seat)}`);
    lines.push(`  Town: ${tableauText(v, seat)}`);
    for (const n of neighboursOf(v, seat)) {
      const side = n === (seat + 1) % v.seats.length ? 'left' : 'right';
      lines.push(
        `${side.toUpperCase()} NEIGHBOUR seat ${n + 1} (${this.name(n)}): ${townLine(v, n)}`,
        `  Great Work: ${greatWorkLine(v, n)}`,
        `  Town: ${tableauText(v, n)}`,
      );
    }
    for (let s = 0; s < v.seats.length; s++) {
      if (s === seat || neighboursOf(v, seat).includes(s)) continue;
      lines.push(`seat ${s + 1} (${this.name(s)}): ${townLine(v, s)}`);
    }
    lines.push('');
    lines.push(this.todo(seat, v));
    const happened = presenter.happenings?.(v) ?? [];
    if (happened.length) lines.push('', 'Just happened:', ...happened.map((h) => `  ${h}`));
    const tail = v.log.slice(-6).map((e) => `  ${e.text}`);
    if (tail.length) lines.push('', 'Log:', ...tail);
    return lines.join('\n');
  }

  /** What the seat has to do, in one block. */
  private todo(seat: SeatId, v: View): string {
    if (this.over) return '';
    const prompt = v.prompts.find((p) => p.seat === seat && !p.answered);
    if (prompt) {
      const info = presenter.prompt(prompt);
      const offers = Array.isArray((prompt.data as { offers?: Json[] } | null)?.offers)
        ? ((prompt.data as { offers: string[] }).offers ?? [])
        : [];
      return [
        `YOUR MOVE: ${info.title}`,
        info.hint ? `  (${info.hint})` : '',
        ...offers.map(
          (o, i) => `  ${i + 1}. ${info.answer(o)}\n${indent(info.detail?.(o) ?? '', 6)}`,
        ),
        `Answer with: choose <number>`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    const mine = v.prompts.find((p) => p.seat === seat && p.answered);
    if (mine) return `You answered; waiting for ${this.waitingNames(seat)}.`;
    const picked = at(v.seats, seat).pick;
    if (picked) {
      const c = at(v.seats, seat).hand.find((x) => x.id === picked.card);
      const what = c ? rules.card(c.def).name : 'a card';
      return `You picked ${what} (${picked.use}). Waiting for ${this.waitingNames(seat)}. (unpick to change)`;
    }
    if (this.waiting(seat)) return `YOUR MOVE: pick a card.\n${this.cards(seat)}`;
    return `Waiting for ${this.waitingNames(seat)}.`;
  }

  cards(seat: SeatId): string {
    const v = this.view(seat);
    const hand = at(v.seats, seat).hand;
    if (hand.length === 0) return 'Your hand is empty.';
    const lines = [
      `Hand (${hand.length}); pick with: pick <n> build|spend` +
        (v.seats.length === 2 && v.turn < v.roundPicks - 1 ? ' [--burn <n>]' : ''),
    ];
    hand.forEach((c, i) => {
      const d = rules.card(c.def);
      const cost = gainsText(rules, d.cost) || 'free';
      lines.push(
        `${i + 1}. ${d.name} [${d.kind}] cost ${cost} · ${effectsText(rules, d.effects)} · Spend +${gainsText(rules, d.spend) || 'nothing'}`,
      );
      for (const [label, use] of [
        ['Build', BUILD],
        ['Spend', SPEND],
      ] as const) {
        const p = engine.ruleset.normalizePick?.(v, seat, { card: c.id, use }) ?? {
          card: c.id,
          use,
        };
        const err = engine.ruleset.validatePick(v, seat, p);
        lines.push(
          err
            ? `     ${label}: not possible — ${presenter.whyNot?.(v, seat, p, err) ?? err}`
            : `     ${label}: ${presenter.describe?.(v, seat, p) ?? 'ok'}`,
        );
      }
    });
    return lines.join('\n');
  }

  result(): string {
    const r = this.state.result;
    if (!r) return '';
    const lines = ['Final scores (Renown):'];
    for (const group of r.ranking) {
      for (const s of group) {
        const sc = at(r.scores, s);
        const parts = Object.entries(sc.categories).map(
          ([k, n]) => `${presenter.scoreLabel(k)} ${n}`,
        );
        lines.push(
          `  ${r.winners.includes(s) ? '★ ' : '  '}${this.name(s)}: ${sc.total} (${parts.join(', ')})`,
        );
      }
    }
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------------------------
  // Acting
  // ---------------------------------------------------------------------------------------------

  private pickCmd(seat: SeatId, words: string[], flags: Record<string, string>): string {
    if (this.over) return 'The game is over.';
    if (!this.waiting(seat)) return `Not your move. Waiting for ${this.waitingNames(seat)}.`;
    const v = this.view(seat);
    if (v.prompts.some((p) => p.seat === seat && !p.answered)) {
      return 'You have a question to answer first: see status, then choose <n>.';
    }
    const hand = at(v.seats, seat).hand;
    const useWord = (words[words.length - 1] ?? '').toLowerCase();
    const use = USES[useWord];
    if (!use)
      return 'Usage: pick <n or card name> build|spend [--cover <name>|none] [--any a,b] [--glean a,b] [--pay buy:<seat>,bank,exchange:<good>] [--burn <n>]';
    const cardWords = words.slice(0, -1).join(' ');
    const which = this.cardIndex(
      hand.map((c) => rules.card(c.def).name),
      cardWords,
    );
    if (typeof which === 'string') return which;
    const card = at(hand, which);

    const args: WwPickArgs = {};
    const goods = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const goodId = (name: string): string | null => {
      const m = matchChoice(
        name,
        rules.content.goods.map((g) => g.name),
      );
      return m.kind === 'one' ? at(rules.goods, m.index) : null;
    };
    for (const key of ['any', 'glean'] as const) {
      if (flags[key] === undefined) continue;
      const ids = goods(flags[key] ?? '').map(goodId);
      if (ids.includes(null))
        return `--${key}: unknown good in "${flags[key]}". Goods: ${rules.content.goods.map((g) => g.name).join(', ')}.`;
      args[key] = ids as string[];
    }
    if (flags.burn !== undefined) {
      const b = Number(flags.burn);
      const c = hand[b - 1];
      if (!c || b - 1 === which) return '--burn: give the number of another card in your hand.';
      args.burn = c.id;
    }
    const tableau = at(v.seats, seat).tableau;
    if (flags.cover !== undefined) {
      if (flags.cover === 'none') args.cover = null;
      else {
        const m = matchChoice(
          flags.cover,
          tableau.map((c) => rules.card(c.def).name),
        );
        if (m.kind !== 'one')
          return `--cover: ${m.kind === 'many' ? 'more than one match' : 'no such card'} in your town.`;
        args.cover = at(tableau, m.index).id;
      }
    }
    // Normalise first (it fills the default payment plan), then apply the --pay overrides.
    let pick: Pick = { card: card.id, use, args: args as unknown as Json };
    pick = engine.ruleset.normalizePick?.(v, seat, pick) ?? pick;
    if (flags.pay !== undefined) {
      const norm = (pick.args ?? {}) as WwPickArgs;
      const plan = [...(norm.pay ?? [])];
      const entries = goods(flags.pay);
      const allAuto = entries.every((e) => e === 'auto' || e === '-');
      if (entries.length !== plan.length && !(plan.length === 0 && allAuto)) {
        return `--pay: this Build is missing ${plan.length} good(s) (${plan.map((p) => (rules.goods.includes(p.good) ? goodNameOf(p.good) : p.good)).join(', ') || 'none'}); give exactly that many entries, in that order.`;
      }
      for (const [i, entry] of entries.entries()) {
        if (entry === 'auto' || entry === '-') continue;
        const parsed = this.parsePay(v, seat, at(plan, i).good, entry);
        if (typeof parsed === 'string') return parsed;
        plan[i] = parsed;
      }
      pick = { ...pick, args: { ...norm, pay: plan } as unknown as Json };
    }
    const err = engine.ruleset.validatePick(v, seat, pick);
    if (err) return `Cannot do that: ${presenter.whyNot?.(v, seat, pick, err) ?? err}`;
    const action: DraftAction = { type: 'pick', seat, pick };
    const failed = this.apply(action);
    if (failed) return `Refused: ${failed}`;
    const note = presenter.describe?.(v, seat, pick) ?? '';
    this.runBots();
    return `Picked ${rules.card(card.def).name} (${useWord})${note ? `: ${note}` : ''}.\n${this.progress(seat)}`;
  }

  private progress(seat: SeatId): string {
    if (this.over) return `The game is over.\n${this.result()}`;
    if (this.waiting(seat)) return 'Everyone has played; it is your move again. Run status.';
    return `Waiting for ${this.waitingNames(seat)}.`;
  }

  /** `buy:<seat>` | `bank` | `exchange:<good>` for the good the plan slot needs. */
  private parsePay(v: View, seat: SeatId, good: string, entry: string): Payment | string {
    const [via, arg] = entry.split(':') as [string, string | undefined];
    if (via === 'bank') return { good, via: 'bank' };
    if (via === 'buy') {
      const n = parseSeat(arg, v.seats.length);
      if (n === null || !neighboursOf(v, seat).includes(n)) {
        return `--pay buy:<seat>: seat must be a neighbour (${neighboursOf(v, seat)
          .map((x) => x + 1)
          .join(' or ')}).`;
      }
      return { good, via: 'buy', from: n };
    }
    if (via === 'exchange') {
      const m = matchChoice(
        arg ?? '',
        rules.content.goods.map((g) => g.name),
      );
      if (m.kind !== 'one') return '--pay exchange:<good>: name the good you give.';
      return { good, via: 'exchange', give: at(rules.goods, m.index) };
    }
    return `--pay: "${entry}" is not buy:<seat>, bank, exchange:<good> or auto.`;
  }

  /** A hand index from a 1-based number or a (unique) name; a string is the error to print. */
  private cardIndex(names: string[], query: string): number | string {
    if (/^\d+$/.test(query)) {
      const n = Number(query);
      return n >= 1 && n <= names.length ? n - 1 : `No card ${n}: your hand has ${names.length}.`;
    }
    const m = matchChoice(query, names);
    if (m.kind === 'one') return m.index;
    if (m.kind === 'many')
      return `"${query}" matches more than one card: ${m.indices.map((i) => `${i + 1}. ${names[i]}`).join('; ')}.`;
    return `No card called "${query}". Run cards.`;
  }

  private unpick(seat: SeatId): string {
    if (this.over) return 'The game is over.';
    const failed = this.apply({ type: 'unpick', seat });
    if (failed) return `Cannot unpick: ${failed}`;
    return 'Pick withdrawn. Choose again with pick.';
  }

  private choose(seat: SeatId, words: string[]): string {
    const v = this.view(seat);
    const prompt = v.prompts.find((p) => p.seat === seat);
    if (!prompt) return 'Nothing to choose now.';
    const offers = ((prompt.data as { offers?: string[] } | null)?.offers ?? []) as string[];
    const info = presenter.prompt(prompt);
    const query = words.join(' ');
    let index: number;
    if (/^\d+$/.test(query)) index = Number(query) - 1;
    else {
      const m = matchChoice(
        query,
        offers.map((o) => info.answer(o)),
      );
      index = m.kind === 'one' ? m.index : -1;
    }
    const answer = offers[index];
    if (answer === undefined) {
      return `Choose one of: ${offers.map((o, i) => `${i + 1}. ${info.answer(o)}`).join('; ')}.`;
    }
    const failed = this.apply({ type: 'answer', seat, prompt: prompt.id, answer });
    if (failed) return `Refused: ${failed}`;
    this.runBots();
    return `You chose ${info.answer(answer)}${prompt.answered ? ' (changed)' : ''}.\n${this.progress(seat)}`;
  }
}

/** `list[i]`, or a clear error instead of `undefined`. */
function at<T>(list: readonly T[], i: number): T {
  const x = list[i];
  if (x === undefined) throw new Error(`index ${i} out of range`);
  return x;
}

function goodNameOf(id: string): string {
  return rules.content.goods.find((g) => g.id === id)?.name ?? id;
}

function indent(text: string, n: number): string {
  return text
    .split('\n')
    .map((l) => ' '.repeat(n) + l)
    .join('\n');
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

function townLine(v: View, seat: SeatId): string {
  const d = at(v.seats, seat).data;
  const store = rules.goods
    .filter((g) => (d.store[g] ?? 0) > 0)
    .map((g) => `${d.store[g]} ${goodNameOf(g)}`)
    .join(', ');
  const score = Object.values(scoreTown(rules, v, seat)).reduce((a, b) => a + b, 0);
  return `${d.coins} coins · store: ${store || 'empty'} · labour ${d.labour} · Guard ${guardOf(rules, v, seat)} · ~${score} Renown`;
}

function greatWorkLine(v: View, seat: SeatId): string {
  const d = at(v.seats, seat).data;
  if (!d.greatWork) return 'not chosen yet';
  const gw = rules.greatWork(d.greatWork);
  const next = nextThreshold(rules, d);
  return `${gw.name}: ${d.tiers === 0 ? 'no tier done' : `tier ${ROMAN[d.tiers - 1]} done`}, ${next === null ? 'complete' : `next at ${next} labour`}`;
}

function tableauText(v: View, seat: SeatId): string {
  const t = at(v.seats, seat).tableau;
  if (t.length === 0) return '(nothing yet)';
  return t.map((c) => rules.card(c.def).name).join(', ');
}
