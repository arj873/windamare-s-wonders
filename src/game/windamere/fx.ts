/**
 * Windamere's reveal and moments: the fx lane's animation and sound (src/ui/fx, src/audio)
 * played over the draft table through ui's RevealHook (src/game/fx.ts, UX.md §19). ui supplies
 * the anchors and who is who; fx decides what moves and what sounds. Input is never blocked
 * (UX.md P1): a click or key cancels the rest.
 *
 * Per action, in order: the reveal (fx F1), a tier burst for each Great Work tier completed
 * (F3 tierMoment), the Season banner when a new Season's Raid is revealed (F3 seasonTransition,
 * after ui's Season-end card closes). At game end, apart from that chain: the final scores count
 * up the moment their card shows (after the Winter Raid's card), then the gameEnd sound.
 */
import { sfx } from '../../audio';
import { latestEvents, SEASONS, type WwRules, type WwSeat, type WwTable } from '../../engine';
import {
  countUpScores,
  playCue,
  playRevealWithSound,
  seasonTransition,
  tierMoment,
  type CardLook,
  type TableFx,
} from '../../ui/fx';
import '../../ui/fx/fx.css';
import type { ResultModel } from '../../ui/table/model';
import type { Presenter } from '../../ui/table/present';
import type { RevealHook } from '../fx';

/**
 * fx F5: a card def's art and kind for the reveal sprites, from the presenter that draws the
 * card faces, so a flying card looks like the one in the hand. Null for anything not a card.
 */
export function cardLook(
  rules: WwRules,
  present: Presenter<WwSeat, WwTable>,
): (def: string) => CardLook | null {
  return (def) => {
    if (!rules.content.cards.some((c) => c.id === def)) return null;
    const f = present.card(def);
    return { kind: f.kind, ...(f.art ? { art: f.art } : {}) };
  };
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Resolves once `selector` is gone from `root` (ui's Season-end card), or after `maxMs`. */
function whenGone(root: HTMLElement, selector: string, maxMs = 12_000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (!root.querySelector(selector) || Date.now() - start > maxMs) resolve();
      else setTimeout(check, 200);
    };
    check();
  });
}

export interface WindamereFxOptions {
  /**
   * Whose actions are "local" (louder cues): 'humans' = every human at this table (hotseat,
   * the default); 'viewer' = only the player on this screen (online).
   */
  local?: 'humans' | 'viewer';
  /** fx F5: a card's art and kind for the reveal sprites, from the table's own card faces. */
  face?: (def: string) => CardLook | null;
}

export function windamereFx(
  rules: WwRules,
  opts: WindamereFxOptions = {},
): RevealHook<WwSeat, WwTable> {
  /** Bumped by skip/dispose and by every new action, so an older run stops at its next step. */
  let generation = 0;
  /** The final scores' count-up (R10 #1), started once per game end. */
  let finale: Finale = NO_FINALE;
  const label = (id: string): string => {
    const good = rules.content.goods.find((g) => g.id === id);
    if (good) return good.name;
    try {
      return rules.card(id).name;
    } catch {
      return id;
    }
  };
  return {
    attach(anchors) {
      anchors.root.classList.add('fx-motion');
    },
    onAction({ view, model, anchors, reducedMotion }) {
      const events = latestEvents(view).map((e) => e.event);
      const mine = ++generation;
      const live = () => mine === generation;
      const seat = (s: number) => model.seats[s];
      // Hotseat: every human at this table is local (louder); online only the viewer. Bots are
      // quietest.
      const who: TableFx = {
        isLocal: (s) => (opts.local === 'viewer' ? s === model.viewer : seat(s)?.bot === false),
        isBot: (s) => seat(s)?.bot ?? false,
      };
      const instant = reducedMotion;
      void (async () => {
        if (events.length > 0) {
          await playRevealWithSound(
            latestEvents(view),
            {
              layer: anchors.layer,
              town: (s) => anchors.town(s),
              hand: (s) =>
                s === model.viewer ? (anchors.stage() ?? anchors.hand()) : anchors.town(s),
              tier: (s) => anchors.monument(s) ?? anchors.town(s),
            },
            who,
            {
              label,
              instant,
              cancelled: () => !live(),
              ...(opts.face ? { face: opts.face } : {}),
            },
          );
        }
        // Great Work tiers completed this action (the reveal already sounded them).
        for (const e of events) {
          if (!live()) return;
          if (e.type === 'tier') {
            await tierMoment(anchors.layer, anchors.monument(e.seat) ?? anchors.town(e.seat), {
              instant,
            });
          }
        }
        // A new Season: its Raid was just revealed (also the first Spring after the choice).
        const raid = events.find((e) => e.type === 'raidRevealed');
        if (raid && view.phase.kind !== 'gameOver') {
          await whenGone(anchors.root, '.dt-season');
          if (!live()) return;
          const r = rules.raid(raid.raid);
          await seasonTransition(
            anchors.layer,
            {
              title: capitalize(SEASONS[view.round] ?? 'Season'),
              subtitle: `Raid: ${r.name}, strength ${r.strength}`,
            },
            { instant, onCue: () => playCue('season', null, who) },
          );
        }
        // Game over: totals count up, lowest first, then the gameEnd sound.
      })();
      // R10 #1: the final card counts up as soon as it shows (after the Winter Raid's card),
      // not after the Winter reveal behind it.
      if (view.phase.kind === 'gameOver' && model.result) {
        finale.stop();
        finale = countFinal(
          anchors.root,
          model.result,
          who,
          instant,
          () => anchors.scoreTotals(),
          model.actionKey,
        );
      }
    },
    skip() {
      generation += 1;
      finale.skip();
    },
    dispose() {
      generation += 1;
      finale.stop();
    },
  };
}

/** A stable id per table element, for keys that must differ between games on one page. */
const tableIds = new WeakMap<HTMLElement, number>();
let nextTableId = 1;
function tableId(root: HTMLElement): number {
  let id = tableIds.get(root);
  if (id === undefined) {
    id = nextTableId++;
    tableIds.set(root, id);
  }
  return id;
}

interface Finale {
  /** A tap: the totals land now (only once counting has begun; earlier taps close cards). */
  skip(): void;
  /** The table left: stop watching and counting. */
  stop(): void;
}
const NO_FINALE: Finale = { skip() {}, stop() {} };

/**
 * The final scores' moment (R10 #1). When `.dt-result` appears (a MutationObserver fires before
 * the browser paints, so the real totals never flash), every total shows 0, ranks and "X wins"
 * hide (`.is-counting`, table.css), and the totals count up lowest first; when the last lands the
 * ranks and the headline show and the gameEnd sound plays (only if this call counted). Reduced
 * motion or Animations Off: totals at once. fx's countUpScores does the counting.
 */
function countFinal(
  root: HTMLElement,
  result: ResultModel,
  who: TableFx,
  instant: boolean,
  totals: () => { seat: number; el: HTMLElement }[],
  key: string,
): Finale {
  const want = new Map(result.columns.map((c) => [c.seat, c.total]));
  // fx F6's `once`: a second call for this same game end (a reconnect, a repeated action) just
  // shows the totals. Not the seed: views hide it, so every game would share one key.
  const once = `${tableId(root)}:${key}:${result.columns.map((c) => c.total).join(',')}`;
  let observer: MutationObserver | null = null;
  let landNow: (() => void) | null = null;
  let stopped = false;
  const start = (card: HTMLElement) => {
    observer?.disconnect();
    observer = null;
    const rows = totals().map(({ seat, el }) => ({ el, total: want.get(seat) ?? 0 }));
    let cancelled = false;
    const settle = () => {
      card.classList.remove('is-counting');
      landNow = null;
    };
    if (!instant) card.classList.add('is-counting');
    // A tap: ranks show now; fx jumps every total to its end on the next frame.
    landNow = () => {
      cancelled = true;
      settle();
    };
    // fx sets every total to 0 before its first await, so the real totals never flash.
    void countUpScores(rows, {
      instant,
      once,
      cancelled: () => cancelled || stopped,
      onTick: () => playCue('scoreTick', null, who),
    }).then((ran) => {
      settle();
      if (ran && !stopped) sfx.play('gameEnd');
    });
  };
  const now = root.querySelector<HTMLElement>('.dt-result');
  if (now) start(now);
  else {
    observer = new MutationObserver(() => {
      const card = root.querySelector<HTMLElement>('.dt-result');
      if (card) start(card);
    });
    observer.observe(root, { childList: true, subtree: true });
  }
  return {
    skip: () => landNow?.(),
    stop: () => {
      stopped = true;
      observer?.disconnect();
      landNow = null;
    },
  };
}
