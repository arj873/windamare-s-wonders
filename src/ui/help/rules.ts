/** The "How to play" overlay: docs/HOWTOPLAY.md rendered inside a dialog. */
import howToPlay from '../../../docs/HOWTOPLAY.md?raw';
import { h } from '../dom';
import { openDialog, type DialogHandle } from '../dialog';
import { renderMarkdown } from './markdown';
import './help.css';

/** The player-facing part of the file: from "The goal" on, without the title and owner note. */
export function howToPlayBody(md: string = howToPlay): string {
  const at = md.indexOf('**The goal:**');
  return at >= 0 ? md.slice(at) : md;
}

export function openRulesOverlay(opts: { onClose?: () => void } = {}): DialogHandle {
  return openDialog({
    title: 'How to play',
    className: 'is-wide',
    body: [h('div', { class: 'ww-help-doc' }, ...renderMarkdown(howToPlayBody()))],
    actions: [{ label: 'Close', primary: true }],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
}
