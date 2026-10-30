/**
 * Dialogs (UX.md §11.5): a centred card on a scrim. Used only where the player must decide
 * something (confirm a destructive action, resume a save); everything else is a toast.
 * Port of catan's `.scrim` / `.dialog` markup and `showResumePrompt` (game/overlays.ts), plus
 * the keyboard handling catan's HUD did inline: Esc closes, Tab stays inside, focus returns.
 */
import { h, type Child } from './dom';
import './shell.css';

export interface DialogAction {
  label: string;
  /** Primary = the default choice (focused first, saffron button). */
  primary?: boolean;
  /** Runs, then the dialog closes, unless it returns `'keep-open'`. */
  onClick?: () => 'keep-open' | undefined;
}

export interface DialogOptions {
  title: string;
  body?: Child[];
  actions: DialogAction[];
  /** Esc and a click on the scrim close it (default true). */
  dismissible?: boolean;
  /** Called once when the dialog closes, however it closed. */
  onClose?: () => void;
  /** Where it mounts (default document.body). */
  parent?: HTMLElement;
  /** Extra class on the card, e.g. 'is-wide'. */
  className?: string;
}

export interface DialogHandle {
  readonly element: HTMLElement;
  close(): void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let nextId = 0;

export function openDialog(opts: DialogOptions): DialogHandle {
  const dismissible = opts.dismissible ?? true;
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = `ww-dlg-${++nextId}`;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    opts.onClose?.();
    if (before?.isConnected) before.focus();
  };

  const buttons = opts.actions.map((a) =>
    h(
      'button',
      {
        class: `btn${a.primary ? ' btn-primary' : ' btn-ghost'}`,
        on: {
          click: () => {
            if (a.onClick?.() === 'keep-open') return;
            close();
          },
        },
      },
      a.label,
    ),
  );
  const card = h(
    'div',
    {
      class: `ww-dialog enter${opts.className ? ` ${opts.className}` : ''}`,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    },
    h('h2', { id: titleId }, opts.title),
    ...(opts.body ?? []),
    h('div', { class: 'ww-dialog-actions' }, ...buttons),
  );
  const scrim = h(
    'div',
    {
      class: 'ww-scrim',
      on: {
        click: (e) => {
          if (dismissible && e.target === scrim) close();
        },
      },
    },
    card,
  );

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && dismissible) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !card.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || !card.contains(at))) {
      e.preventDefault();
      first.focus();
    }
  }

  (opts.parent ?? document.body).append(scrim);
  document.addEventListener('keydown', onKey, true);
  const primary = opts.actions.findIndex((a) => a.primary);
  (buttons[primary >= 0 ? primary : 0] ?? card).focus();
  return { element: scrim, close };
}

/** "Are you sure?" for destructive actions only (UX.md §11.5). Resolves false on Esc / Cancel. */
export function confirmDialog(
  title: string,
  text: string,
  confirmLabel: string,
  cancelLabel = 'Cancel',
): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    openDialog({
      title,
      body: [h('p', { class: 'ww-dialog-text' }, text)],
      actions: [
        { label: cancelLabel },
        {
          label: confirmLabel,
          primary: true,
          onClick: () => {
            answer = true;
            return undefined;
          },
        },
      ],
      onClose: () => resolve(answer),
    });
  });
}

/**
 * Full-screen "Welcome back" prompt on load when an unfinished hotseat save exists (UX.md §4.2).
 * `info` is one line, e.g. "4 players · era 2, pick 3".
 */
export function showResumePrompt(
  info: string,
  onResume: () => void,
  onNew: () => void,
  title = 'Welcome back',
): HTMLElement {
  const pick = (then: () => void) => () => {
    screen.remove();
    then();
  };
  const resume = h(
    'button',
    { class: 'btn btn-primary btn-lg', on: { click: pick(onResume) } },
    'Resume',
  );
  const screen = h(
    'div',
    { class: 'ww-shell ww-resume', attrs: { role: 'dialog', 'aria-label': title } },
    h(
      'div',
      { class: 'ww-resume-card' },
      h('h1', {}, title),
      h('p', {}, info),
      h(
        'div',
        { class: 'ww-resume-actions' },
        h('button', { class: 'btn btn-ghost btn-lg', on: { click: pick(onNew) } }, 'New game'),
        resume,
      ),
    ),
  );
  document.body.append(screen);
  resume.focus();
  return screen;
}
