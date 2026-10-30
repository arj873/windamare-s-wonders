/**
 * Hover, focus and tap tooltips for every term and icon (T2). Any element with `data-term="<id>"`
 * (an id from terms.ts) gets one: hover or keyboard focus on desktop, tap on touch (tap again or
 * tap elsewhere to close). The listeners are delegated from one root, so re-rendered DOM needs
 * nothing. `helpTerm` builds a ready-made focusable element.
 */
import { h, type Child } from '../dom';
import { termById } from './terms';
import './help.css';

/** A focusable inline element that carries a tooltip: `helpTerm('guard', 'Guard 3')`. */
export function helpTerm(id: string, ...children: Child[]): HTMLElement {
  return h('span', { class: 'ww-term', attrs: { 'data-term': id, tabindex: '0' } }, ...children);
}

export interface TooltipHandle {
  hide(): void;
  destroy(): void;
}

export function attachTooltips(root: HTMLElement): TooltipHandle {
  const tip = h('div', { class: 'ww-tip', attrs: { role: 'tooltip', hidden: '' } });
  document.body.append(tip);
  let current: HTMLElement | null = null;

  const hide = (): void => {
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    tip.hidden = true;
  };

  const show = (el: HTMLElement): void => {
    const term = termById(el.dataset.term ?? '');
    if (!term) return;
    if (current && current !== el) current.removeAttribute('aria-describedby');
    current = el;
    tip.id = 'ww-tip';
    el.setAttribute('aria-describedby', tip.id);
    tip.replaceChildren(
      h('strong', {}, term.label),
      h('span', {}, term.text),
      h('em', {}, `Rule ${term.rule}`),
    );
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 6 + tip.offsetHeight <= window.innerHeight;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - tip.offsetHeight)}px`;
  };

  const target = (e: Event): HTMLElement | null =>
    (e.target as Element | null)?.closest?.<HTMLElement>('[data-term]') ?? null;

  const onOver = (e: Event): void => {
    const el = target(e);
    if (el && root.contains(el)) show(el);
  };
  const onOut = (e: Event): void => {
    if (target(e)) hide();
  };
  const onClick = (e: Event): void => {
    const el = target(e);
    if (!el) return hide();
    if (current === el && !tip.hidden) hide();
    else show(el);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') hide();
  };

  root.addEventListener('mouseover', onOver);
  root.addEventListener('mouseout', onOut);
  root.addEventListener('focusin', onOver);
  root.addEventListener('focusout', onOut);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey);

  return {
    hide,
    destroy() {
      hide();
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseout', onOut);
      root.removeEventListener('focusin', onOver);
      root.removeEventListener('focusout', onOut);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
      tip.remove();
    },
  };
}
