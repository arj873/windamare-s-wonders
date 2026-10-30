/** "Reconnecting…" strip at the top of the screen (lobby and table), UX.md §11.5. */
import { h } from '../dom';
import './online.css';

export class ConnectionBanner {
  readonly element: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly onRetry: () => void,
  ) {
    this.element = h('div', {
      class: 'ol-banner',
      attrs: { role: 'status', 'aria-live': 'polite', 'data-k': 'conn-banner' },
    });
    this.element.hidden = true;
    parent.append(this.element);
  }

  get shown(): boolean {
    return !this.element.hidden;
  }

  /** `attempt`: failed attempts so far (0 = the first retry is still running). */
  reconnecting(attempt: number): void {
    this.element.hidden = false;
    this.element.replaceChildren(
      h('span', { class: 'ol-spin', attrs: { 'aria-hidden': 'true' } }),
      h(
        'span',
        {},
        attempt > 1
          ? `Connection lost. Reconnecting… (attempt ${attempt})`
          : 'Connection lost. Reconnecting…',
      ),
      h(
        'button',
        { class: 'btn btn-sm', attrs: { 'data-k': 'retry' }, on: { click: () => this.onRetry() } },
        'Retry now',
      ),
    );
  }

  hide(): void {
    this.element.hidden = true;
    this.element.replaceChildren();
  }

  destroy(): void {
    this.element.remove();
  }
}
