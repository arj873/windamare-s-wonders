/**
 * Windamere's reveal: the fx lane's animation and sound (src/ui/fx, src/audio) played over the
 * draft table through ui's RevealHook (src/game/fx.ts, UX.md §19). ui supplies the anchors and
 * who is who; fx decides what moves and what sounds. Input is never blocked (UX.md P1): a click
 * or key cancels the rest of the reveal.
 */
import { latestEvents, type WwRules, type WwSeat, type WwTable } from '../../engine';
import { playRevealWithSound } from '../../ui/fx';
import type { RevealHook } from '../fx';

export function windamereFx(rules: WwRules): RevealHook<WwSeat, WwTable> {
  /** Bumped by skip/dispose and by every new action, so an older reveal stops at its next beat. */
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
    onAction({ view, model, anchors, reducedMotion }) {
      const events = latestEvents(view);
      const mine = ++generation;
      if (events.length === 0) return;
      const seat = (s: number) => model.seats[s];
      void playRevealWithSound(
        events,
        {
          layer: anchors.layer,
          town: (s) => anchors.town(s),
          hand: (s) => (s === model.viewer ? (anchors.stage() ?? anchors.hand()) : anchors.town(s)),
          tier: (s) => anchors.monument(s) ?? anchors.town(s),
        },
        // Hotseat: every human at this table is local (louder); bots are quietest.
        { isLocal: (s) => seat(s)?.bot === false, isBot: (s) => seat(s)?.bot ?? false },
        { label, instant: reducedMotion, cancelled: () => mine !== generation },
      );
    },
    skip() {
      generation += 1;
    },
    dispose() {
      generation += 1;
    },
  };
}
