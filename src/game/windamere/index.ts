/** Windamere's Wonders bound for the app: engine + presenter, ready for boot({ game }). */
import { SEASONS } from '../../content/windamere';
import type { WwSeat, WwTable } from '../../engine';
import { attachHelp, openCardList } from '../../ui/help';
import type { GameBinding } from '../play';
import { windamere } from './content';
import { windamereClock } from './clock';
import { windamereFx } from './fx';
import { windamerePresenter } from './present';

export { windamere } from './content';
export { windamerePresenter } from './present';

export function windamereBinding(): GameBinding<WwSeat, WwTable> {
  const { rules, engine } = windamere();
  return {
    engine,
    present: windamerePresenter(rules, engine),
    fx: windamereFx(rules),
    clock: windamereClock,
    // Tutorial lane (src/ui/help): tooltips, rules overlay, the card list on the current Season.
    help: {
      attach: (root) => attachHelp(root),
      openCards: (view) => {
        openCardList({ season: SEASONS[view.round] ?? 'spring' });
      },
    },
  };
}
