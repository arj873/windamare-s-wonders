/**
 * Toasts (UX.md §11.4, port of catan's game/overlays.ts): short notices, bottom-centre above
 * the hand, `role=status`. Never for anything the player must act on.
 */
import './shell.css';

export type ToastKind = 'info' | 'error';

/** At most this many on screen; a new one pushes the oldest out. */
export const MAX_TOASTS = 3;
export const TOAST_MS = 4000;
/** Fade-out time after `ms` (matches `.ww-toast.is-leaving` in shell.css). */
const LEAVE_MS = 400;

let box: HTMLElement | null = null;

function toastBox(): HTMLElement {
  if (!box || !box.isConnected) {
    box = document.createElement('div');
    box.className = 'ww-toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  return box;
}

export function showToast(message: string, kind: ToastKind = 'info', ms = TOAST_MS): HTMLElement {
  const parent = toastBox();
  const el = document.createElement('div');
  el.className = `ww-toast is-${kind}`;
  el.textContent = message;
  parent.append(el);
  const live = [...parent.children].filter((c) => !c.classList.contains('is-leaving'));
  for (const old of live.slice(0, Math.max(0, live.length - MAX_TOASTS))) old.remove();
  setTimeout(() => el.classList.add('is-leaving'), ms);
  setTimeout(() => el.remove(), ms + LEAVE_MS);
  return el;
}
