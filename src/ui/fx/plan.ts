/**
 * F1: turns one action's events (engine `latestEvents`) into an ordered list of beats for the
 * reveal. Pure: no DOM, no audio. Each beat is a group of steps that play together; beats play
 * one after another, in the order things happened (picks, Spends, payments, builds, tiers,
 * Raids, Season end). `reveal.ts` draws the steps, `cues.ts` (audio) is derived from them.
 */
import type { SeatId } from '../../engine/core';
import type { Gains } from '../../engine/game/types';
import type { WwEvent, WwEventEntry } from '../../engine/game/events';

/** What one step shows. `seat`/`from`/`to` are towns; the player resolves them to elements. */
export type Step =
  /** A town's picked card flips face up. */
  | { kind: 'flip'; seat: SeatId; card: string | null; name: string | null }
  /** A built card flies from the hand into the town. */
  | { kind: 'build'; seat: SeatId; card: string; name: string }
  /** A floating gain / loss over a town. */
  | { kind: 'chip'; seat: SeatId; text: string; tone: 'gain' | 'loss' | 'note' }
  /** Coins or a good travel from one town to another (buys, tolls, bounty). */
  | { kind: 'fly'; from: SeatId; to: SeatId; text: string }
  /** A Great Work tier fills. */
  | { kind: 'tier'; seat: SeatId; greatWork: string; tier: number }
  /** A message for the whole table (the Season's Raid revealed, an Honour left unclaimed). */
  | { kind: 'notice'; text: string }
  /** A Raid result lands on a town. */
  | { kind: 'raid'; seat: SeatId; outcome: 'held' | 'plundered'; text: string };

/** Sound ids from src/audio/recipes.ts that a beat triggers. */
export type BeatCue = 'reveal' | 'spend' | 'build' | 'coin' | 'raidHold' | 'raidHit' | 'tier';

export interface Beat {
  steps: Step[];
  cue: BeatCue | null;
  /** Which seat the cue is about (for loudness: yours is louder than a bot's). */
  seat: SeatId | null;
}

export interface PlanOptions {
  /** Display name of a good / card def; default is the id. */
  label?: (id: string) => string;
}

/** "1 coin", "2 coins". */
export const coinsText = (n: number): string => `${n} ${n === 1 ? 'coin' : 'coins'}`;

/** "+2 flint, +1 coin" for the nonzero entries of `gains`. */
export function gainsText(gains: Gains, label: (id: string) => string = (s) => s): string {
  return Object.entries(gains)
    .filter(([, n]) => n !== 0)
    .map(([k, n]) => {
      const sign = n > 0 ? '+' : '−';
      const abs = Math.abs(n);
      return k === 'coins' ? `${sign}${coinsText(abs)}` : `${sign}${abs} ${label(k)}`;
    })
    .join(', ');
}

const STEP_ORDER: Record<WwEvent['type'], number> = {
  greatWork: 0,
  raidRevealed: 0,
  burn: 1,
  glean: 1,
  spend: 1,
  pay: 2,
  trade: 2,
  build: 3,
  tier: 4,
  toll: 5,
  yield: 5,
  raid: 6,
  bounty: 6,
  heldBonus: 7,
  seasonEnd: 7,
  honour: 8,
};

/** Events in the order given, folded into beats: one beat per resolve phase, per kind. */
export function planReveal(entries: readonly WwEventEntry[], opts: PlanOptions = {}): Beat[] {
  const label = opts.label ?? ((s: string) => s);
  const beats: Beat[] = [];
  let last = -1;
  let current: Beat | null = null;
  const push = (event: WwEvent, step: Step, cue: BeatCue | null, seat: SeatId | null) => {
    const phase = STEP_ORDER[event.type];
    // A new beat when the phase changes, or for cues that must sound on their own.
    if (!current || phase !== last || (cue && current.cue && cue !== current.cue)) {
      current = { steps: [], cue, seat };
      beats.push(current);
    }
    last = phase;
    current.steps.push(step);
    if (!current.cue && cue) {
      current.cue = cue;
      current.seat = seat;
    }
  };

  for (const { event: e } of entries) {
    switch (e.type) {
      case 'spend':
        push(
          e,
          { kind: 'flip', seat: e.seat, card: e.card.def, name: label(e.card.def) },
          'spend',
          e.seat,
        );
        if (Object.keys(e.gains).length)
          push(
            e,
            { kind: 'chip', seat: e.seat, text: gainsText(e.gains, label), tone: 'gain' },
            null,
            e.seat,
          );
        break;
      case 'glean':
        push(e, { kind: 'flip', seat: e.seat, card: null, name: null }, 'spend', e.seat);
        if (Object.keys(e.gains).length)
          push(
            e,
            { kind: 'chip', seat: e.seat, text: gainsText(e.gains, label), tone: 'gain' },
            null,
            e.seat,
          );
        break;
      case 'burn':
        push(e, { kind: 'chip', seat: e.seat, text: 'Burned', tone: 'note' }, null, e.seat);
        break;
      case 'pay':
        if (e.coins > 0)
          push(
            e,
            { kind: 'chip', seat: e.seat, text: `−${coinsText(e.coins)}`, tone: 'loss' },
            'coin',
            e.seat,
          );
        break;
      case 'trade':
        push(
          e,
          {
            kind: 'fly',
            from: e.buyer,
            to: e.seller,
            text: `${coinsText(e.price)} for ${label(e.good)}`,
          },
          'coin',
          e.buyer,
        );
        break;
      case 'build':
        push(
          e,
          { kind: 'build', seat: e.seat, card: e.card.def, name: label(e.card.def) },
          'build',
          e.seat,
        );
        if (Object.keys(e.gains).length)
          push(
            e,
            { kind: 'chip', seat: e.seat, text: gainsText(e.gains, label), tone: 'gain' },
            null,
            e.seat,
          );
        break;
      case 'tier':
        push(
          e,
          { kind: 'tier', seat: e.seat, greatWork: e.greatWork, tier: e.tier },
          'tier',
          e.seat,
        );
        if (Object.keys(e.gains).length)
          push(
            e,
            { kind: 'chip', seat: e.seat, text: gainsText(e.gains, label), tone: 'gain' },
            null,
            e.seat,
          );
        break;
      case 'toll':
        for (const from of e.from)
          push(e, { kind: 'fly', from, to: e.seat, text: 'toll' }, 'coin', e.seat);
        break;
      case 'yield':
      case 'heldBonus':
      case 'seasonEnd':
        if (Object.keys(e.gains).length)
          push(
            e,
            { kind: 'chip', seat: e.seat, text: gainsText(e.gains, label), tone: 'gain' },
            null,
            e.seat,
          );
        break;
      case 'raid': {
        const held = e.outcome === 'held';
        const text = held ? `Held (+${e.valour} valour)` : `Plundered (−${coinsText(e.lost)})`;
        push(
          e,
          { kind: 'raid', seat: e.seat, outcome: e.outcome, text },
          held ? 'raidHold' : 'raidHit',
          e.seat,
        );
        break;
      }
      case 'bounty':
        push(
          e,
          { kind: 'fly', from: e.from, to: e.to, text: `${coinsText(e.coins)} bounty` },
          'coin',
          e.to,
        );
        break;
      case 'greatWork':
        push(
          e,
          { kind: 'chip', seat: e.seat, text: label(e.greatWork), tone: 'note' },
          'reveal',
          e.seat,
        );
        break;
      case 'raidRevealed':
        push(
          e,
          { kind: 'notice', text: `Raid: ${label(e.raid)} (strength ${e.strength})` },
          'reveal',
          null,
        );
        break;
      case 'honour':
        if (e.leaders.length === 0) {
          push(e, { kind: 'notice', text: `${label(e.honour)}: no leader` }, null, null);
        } else {
          for (const seat of e.leaders)
            push(
              e,
              { kind: 'chip', seat, text: `Leads ${label(e.honour)}`, tone: 'note' },
              null,
              seat,
            );
        }
        break;
    }
  }
  return beats;
}
