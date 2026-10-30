/**
 * Windamere's reveal and moments: the fx lane's animation and sound (src/ui/fx, src/audio)
 * played over the draft table through ui's RevealHook (src/game/fx.ts, UX.md §19). ui supplies
 * the anchors and who is who; fx decides what moves and what sounds. Input is never blocked
 * (UX.md P1): a click or key cancels the rest.
 *
 * Per action, in order: the reveal (fx F1), a tier burst for each Great Work tier completed
 * (F3 tierMoment), the Season banner when a new Season's Raid is revealed (F3 seasonTransition,
 * after ui's Season-end card closes), and at the end the score count-up then the gameEnd sound.
 */
import { sfx } from '../../audio';
import { latestEvents, SEASONS, type WwRules, type WwSeat, type WwTable } from '../../engine';
import {
  countUpScores,
  playCue,
  playRevealWithSound,
  seasonTransition,
  tierMoment,
  type TableFx,
} from '../../ui/fx';
import '../../ui/fx/fx.css';
import type { RevealHook } from '../fx';

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

export function windamereFx(rules: WwRules): RevealHook<WwSeat, WwTable> {
  /** Bumped by skip/dispose and by every new action, so an older run stops at its next step. */
  let generation = 0;
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
      // Hotseat: every human at this table is local (louder); bots are quietest.
      const who: TableFx = {
        isLocal: (s) => seat(s)?.bot === false,
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
            { label, instant, cancelled: () => !live() },
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
        if (view.phase.kind === 'gameOver' && model.result) {
          const totals = new Map(model.result.columns.map((c) => [c.seat, c.total]));
          const rows = anchors
            .scoreTotals()
            .map(({ seat: s, el }) => ({ el, total: totals.get(s) ?? 0 }));
          await countUpScores(rows, { instant, onTick: () => playCue('scoreTick', null, who) });
          if (live()) sfx.play('gameEnd');
        }
      })();
    },
    skip() {
      generation += 1;
    },
    dispose() {
      generation += 1;
    },
  };
}
