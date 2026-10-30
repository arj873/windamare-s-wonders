/** Windamere's Wonders bound for the app: engine + presenter, ready for boot({ game }). */
import type { WwSeat, WwTable } from '../../engine';
import type { GameBinding } from '../play';
import { windamere } from './content';
import { windamerePresenter } from './present';

export { windamere } from './content';
export { windamerePresenter } from './present';

export function windamereBinding(): GameBinding<WwSeat, WwTable> {
  const { rules, engine } = windamere();
  return { engine, present: windamerePresenter(rules, engine) };
}
