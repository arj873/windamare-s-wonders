/** Windamere's Wonders bound for the app: engine + presenter, ready for boot({ game }). */
import { SEASONS } from '../../content/windamere';
import { FIRST_GAME_OPTION, type WwSeat, type WwTable } from '../../engine';
import { attachHelp, openCardList } from '../../ui/help';
import {
  defaultTutorialStorage,
  offerTutorial,
  TUTORIAL_OPTIONS,
  TutorialCoach,
} from '../../ui/tutorial';
import type { GameBinding } from '../play';
import { windamere } from './content';
import { windamereClock } from './clock';
import { windamereFx } from './fx';
import { windamerePresenter } from './present';

export { windamere } from './content';
export { windamerePresenter } from './present';

/**
 * `online`: the binding for the online table (only the viewer's actions sound "local"; the
 * hotseat default treats every human at the table as local).
 */
export function windamereBinding(
  mode: 'hotseat' | 'online' = 'hotseat',
): GameBinding<WwSeat, WwTable> {
  const { rules, engine } = windamere();
  return {
    engine,
    present: windamerePresenter(rules, engine),
    fx: windamereFx(rules, { local: mode === 'online' ? 'viewer' : 'humans' }),
    clock: windamereClock,
    // RULES.md R19 / ENGINE.md §15.5: the engine skips the Great Work choice and the Honours.
    firstGame: {
      options: { [FIRST_GAME_OPTION]: true },
      hint: 'For someone new: no Honours, one Great Work dealt to each town (no choice), no upgrades, and a Relaxed clock.',
    },
    // Tutorial lane (src/ui/tutorial): the coach over a seeded First game against 3 Easy bots.
    tutorial: {
      options: TUTORIAL_OPTIONS,
      create: (root, host) => {
        const store = defaultTutorialStorage();
        const coach = new TutorialCoach(root, host, store);
        return {
          panel: coach.panel,
          begin: () => coach.begin(),
          update: () => coach.update(),
          hide: () => coach.hide(),
          offer: (parent, returning, onLearn) => {
            offerTutorial(parent, store, returning, onLearn);
          },
        };
      },
    },
    // Tutorial lane (src/ui/help): tooltips, rules overlay, the card list on the current Season.
    help: {
      attach: (root) => attachHelp(root),
      openCards: (view) => {
        openCardList({ season: SEASONS[view.round] ?? 'spring' });
      },
    },
  };
}
