/**
 * In-game help (T2). ui calls `attachHelp(root)` once on the table's root element:
 *
 *   const help = attachHelp(tableRoot);   // tooltips for every [data-term] under root
 *   menu item "How to play"  -> help.openRules()
 *   menu item "All cards"    -> help.openCards()
 *   help.destroy() when the table goes away.
 *
 * ui marks icons/words with `data-term="guard"` (ids in terms.ts) or builds them with `helpTerm`.
 * Pressing "?" (outside a text field) opens the rules overlay.
 */
import type { DialogHandle } from '../dialog';
import { openCardList } from './cards';
import { openRulesOverlay } from './rules';
import { attachTooltips } from './tooltips';

export { helpTerm } from './tooltips';
export { TERMS, termById, type Term } from './terms';
export { openRulesOverlay } from './rules';
export { openCardList } from './cards';

export interface HelpHandle {
  openRules(): DialogHandle;
  openCards(): DialogHandle;
  destroy(): void;
}

export function attachHelp(root: HTMLElement): HelpHandle {
  const tips = attachTooltips(root);
  let open: DialogHandle | null = null;
  const track = (d: DialogHandle): DialogHandle => {
    open = d;
    return d;
  };
  const guarded = (make: (onClose: () => void) => DialogHandle): DialogHandle => {
    if (open?.element.isConnected) return open;
    return track(make(() => (open = null)));
  };
  const openRules = (): DialogHandle => guarded((onClose) => openRulesOverlay({ onClose }));
  const openCards = (): DialogHandle => guarded((onClose) => openCardList({ onClose }));

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    openRules();
  };
  document.addEventListener('keydown', onKey);

  return {
    openRules,
    openCards,
    destroy() {
      document.removeEventListener('keydown', onKey);
      tips.destroy();
      open?.close();
    },
  };
}
