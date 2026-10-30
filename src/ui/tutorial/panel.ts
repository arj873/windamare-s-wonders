/** The coach panel: one short lesson, Back / Next / Skip tutorial, collapsible to a small pill. */
import { append, h } from '../dom';
import type { PanelView } from './machine';

export interface PanelHandlers {
  next: () => void;
  back: () => void;
  skip: () => void;
  collapse: (collapsed: boolean) => void;
  /** The last lesson's "New game" button. */
  newGame: () => void;
}

export function renderPanel(el: HTMLElement, view: PanelView, on: PanelHandlers): void {
  el.classList.toggle('is-collapsed', view.collapsed);
  el.classList.toggle('is-idle', view.lesson === null);
  if (view.collapsed) {
    el.replaceChildren(
      h(
        'button',
        {
          class: 'tut-pill',
          title: 'Show the tutorial',
          attrs: { 'aria-expanded': 'false', 'data-k': 'tut-expand' },
          on: { click: () => on.collapse(false) },
        },
        h('span', { class: 'tut-pill-dot', attrs: { 'aria-hidden': 'true' } }, '?'),
        h('span', {}, view.lesson && view.live ? view.title : 'Tutorial'),
      ),
    );
    return;
  }
  const btn = (label: string, cls: string, k: string, fn: () => void, enabled = true) =>
    h(
      'button',
      { class: `btn btn-sm ${cls}`, disabled: !enabled, attrs: { 'data-k': k }, on: { click: fn } },
      label,
    );
  el.replaceChildren();
  append(el, [
    h(
      'div',
      { class: 'tut-head' },
      h('span', { class: 'tut-badge' }, view.recap ? 'Recap' : 'Learn to play'),
      !view.live && h('span', { class: 'tut-badge is-back' }, 'Earlier tip'),
      h(
        'button',
        {
          class: 'tut-min',
          title: 'Minimize',
          attrs: { 'aria-label': 'Minimize the tutorial', 'data-k': 'tut-min' },
          on: { click: () => on.collapse(true) },
        },
        '–',
      ),
    ),
    view.lesson && h('h2', { class: 'tut-title' }, view.title),
    h('p', { class: 'tut-text' }, view.text),
    view.todo && h('p', { class: 'tut-todo', attrs: { role: 'status' } }, view.todo),
    h(
      'div',
      { class: 'tut-actions' },
      !view.final &&
        h(
          'button',
          { class: 'tut-skip', attrs: { 'data-k': 'tut-skip' }, on: { click: on.skip } },
          'Skip tutorial',
        ),
      h('span', { class: 'tut-gap' }),
      btn('Back', 'btn-ghost', 'tut-back', on.back, view.canBack),
      view.final
        ? btn('New game', 'btn-ghost', 'tut-new', on.newGame)
        : btn('Next', 'btn-primary', 'tut-next', on.next, view.canNext),
      view.final && btn('Keep playing', 'btn-primary', 'tut-next', on.next),
    ),
  ]);
}
