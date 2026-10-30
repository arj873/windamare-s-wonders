/**
 * Text for a seat's `DraftView`: status, hand, result. Pure functions of the view, so the text
 * game (engine in-process) and the browser layer (view read from the page's `__pt.view`) print the
 * same words. Uses the UI's own `windamerePresenter` for Build/Spend lines and refusal wording.
 */
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
  type DraftView,
  type Json,
  type SeatId,
  type WwSeat,
  type WwTable,
} from '../src/engine';
import { windamerePresenter } from '../src/game/windamere/present';
import { effectsText, gainsText } from '../src/game/windamere/text';

export type View = DraftView<WwSeat, WwTable>;

export const rules = windamereRules;
export const engine = windamere;
export const presenter = windamerePresenter(rules, engine);
const ROMAN = ['I', 'II', 'III', 'IV'];

export const isOver = (v: View): boolean => v.phase.kind === 'gameOver';
export const nameOf = (v: View, seat: SeatId): string => v.seats[seat]?.name ?? `Seat${seat + 1}`;

/** Does this seat have to act now (or is the game over)? */
export function isWaiting(v: View, seat: SeatId): boolean {
  return isOver(v) || engine.waitingOn(v).includes(seat);
}

export function waitingNames(v: View, seat: SeatId): string {
  const names = engine.waitingOn(v).map((s) => (s === seat ? 'you' : nameOf(v, s)));
  return names.join(', ') || 'the table';
}

export function statusText(v: View, seat: SeatId): string {
  const lines: string[] = [];
  if (isOver(v)) lines.push('GAME OVER', resultText(v));
  const me = at(v.seats, seat);
  const season = presenter.roundName(v.round, 4);
  const turnText =
    v.roundPicks > 0 ? `turn ${v.turn + 1} of ${v.roundPicks}` : 'before the first deal';
  lines.push(
    `${season}, ${turnText} · hands pass ${v.passDirection} · ` +
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
      `${side.toUpperCase()} NEIGHBOUR seat ${n + 1} (${nameOf(v, n)}): ${townLine(v, n)}`,
      `  Great Work: ${greatWorkLine(v, n)}`,
      `  Town: ${tableauText(v, n)}`,
    );
  }
  for (let s = 0; s < v.seats.length; s++) {
    if (s === seat || neighboursOf(v, seat).includes(s)) continue;
    lines.push(`seat ${s + 1} (${nameOf(v, s)}): ${townLine(v, s)}`);
  }
  lines.push('', todoText(v, seat));
  const happened = presenter.happenings?.(v) ?? [];
  if (happened.length) lines.push('', 'Just happened:', ...happened.map((h) => `  ${h}`));
  const tail = v.log.slice(-6).map((e) => `  ${e.text}`);
  if (tail.length) lines.push('', 'Log:', ...tail);
  return lines.join('\n');
}

/** What the seat has to do, in one block. */
export function todoText(v: View, seat: SeatId): string {
  if (isOver(v)) return '';
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
  if (v.prompts.some((p) => p.seat === seat && p.answered)) {
    return `You answered; waiting for ${waitingNames(v, seat)}.`;
  }
  const picked = at(v.seats, seat).pick;
  if (picked) {
    const c = at(v.seats, seat).hand.find((x) => x.id === picked.card);
    const what = c ? rules.card(c.def).name : 'a card';
    return `You picked ${what} (${picked.use}). Waiting for ${waitingNames(v, seat)}. (unpick to change)`;
  }
  if (isWaiting(v, seat)) return `YOUR MOVE: pick a card.\n${cardsText(v, seat)}`;
  return `Waiting for ${waitingNames(v, seat)}.`;
}

export function cardsText(v: View, seat: SeatId): string {
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
      const p = engine.ruleset.normalizePick?.(v, seat, { card: c.id, use }) ?? { card: c.id, use };
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

export function resultText(v: View): string {
  const r = v.result;
  if (!r) return '';
  const lines = ['Final scores (Renown):'];
  for (const group of r.ranking) {
    for (const s of group) {
      const sc = at(r.scores, s);
      const parts = Object.entries(sc.categories).map(
        ([k, n]) => `${presenter.scoreLabel(k)} ${n}`,
      );
      lines.push(
        `  ${r.winners.includes(s) ? '★ ' : '  '}${nameOf(v, s)}: ${sc.total} (${parts.join(', ')})`,
      );
    }
  }
  return lines.join('\n');
}

/** `list[i]`, or a clear error instead of `undefined`. */
export function at<T>(list: readonly T[], i: number): T {
  const x = list[i];
  if (x === undefined) throw new Error(`index ${i} out of range`);
  return x;
}

export function goodNameOf(id: string): string {
  return rules.content.goods.find((g) => g.id === id)?.name ?? id;
}

export function indent(text: string, n: number): string {
  return text
    .split('\n')
    .map((l) => ' '.repeat(n) + l)
    .join('\n');
}

export function townLine(v: View, seat: SeatId): string {
  const d = at(v.seats, seat).data;
  const store = rules.goods
    .filter((g) => (d.store[g] ?? 0) > 0)
    .map((g) => `${d.store[g]} ${goodNameOf(g)}`)
    .join(', ');
  const score = Object.values(scoreTown(rules, v, seat)).reduce((a, b) => a + b, 0);
  return `${d.coins} coins · store: ${store || 'empty'} · labour ${d.labour} · Guard ${guardOf(rules, v, seat)} · ~${score} Renown`;
}

export function greatWorkLine(v: View, seat: SeatId): string {
  const d = at(v.seats, seat).data;
  if (!d.greatWork) return 'not chosen yet';
  const gw = rules.greatWork(d.greatWork);
  const next = nextThreshold(rules, d);
  return `${gw.name}: ${d.tiers === 0 ? 'no tier done' : `tier ${ROMAN[d.tiers - 1]} done`}, ${next === null ? 'complete' : `next at ${next} labour`}`;
}

export function tableauText(v: View, seat: SeatId): string {
  const t = at(v.seats, seat).tableau;
  if (t.length === 0) return '(nothing yet)';
  return t.map((c) => rules.card(c.def).name).join(', ');
}
