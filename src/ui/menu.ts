/**
 * The ☰ menu (UX.md §11.1; port of catan's `.hud-menu`): a button top-left and a panel of
 * actions (New game, Learn to play, Rules …) and segmented choices (Bot speed, Animations …).
 * The owner supplies the items; `setItems` swaps them (hotseat vs online session actions).
 * Closes on Esc, a click outside, or after an action.
 */
import { h } from './dom';
import './shell.css';

export interface MenuAction {
  kind: 'action';
  label: string;
  onClick: () => void;
  /** Shown under the label, e.g. "New here? Start with this". */
  hint?: string;
}

export interface MenuChoice<T extends string = string> {
  kind: 'choice';
  label: string;
  options: readonly { id: T; label: string }[];
  /** The current pick; the menu updates it in place when the player picks another. */
  value: T;
  // Method syntax on purpose: a MenuChoice<'a' | 'b'> must fit in a MenuItem[].
  onChange(id: T): void;
}

export type MenuItem = MenuAction | MenuChoice;

const MENU_GLYPH = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

export class Menu {
  readonly element: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private items: MenuItem[];
  private open = false;

  constructor(items: MenuItem[]) {
    this.items = items;
    this.toggle = h('button', {
      class: 'ww-menu-btn',
      title: 'Menu',
      attrs: { 'aria-label': 'Menu', 'aria-expanded': 'false', 'aria-haspopup': 'menu' },
      on: { click: () => this.setOpen(!this.open) },
    });
    this.toggle.innerHTML = MENU_GLYPH; // static markup
    this.panel = h('div', {
      class: 'ww-menu-panel',
      attrs: { role: 'menu', 'aria-label': 'Menu' },
    });
    this.panel.hidden = true;
    this.element = h('div', { class: 'ww-menu' }, this.toggle, this.panel);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setItems(items: MenuItem[]): void {
    this.items = items;
    if (this.open) this.renderPanel();
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.toggle.setAttribute('aria-expanded', String(open));
    this.toggle.classList.toggle('is-open', open);
    this.panel.hidden = !open;
    if (open) {
      this.renderPanel();
      document.addEventListener('pointerdown', this.onOutside, true);
      document.addEventListener('keydown', this.onKey, true);
      this.focusables()[0]?.focus();
    } else {
      this.panel.replaceChildren();
      document.removeEventListener('pointerdown', this.onOutside, true);
      document.removeEventListener('keydown', this.onKey, true);
    }
  }

  private readonly onOutside = (e: Event): void => {
    if (e.target instanceof Node && !this.element.contains(e.target)) this.setOpen(false);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.setOpen(false);
      this.toggle.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = this.focusables();
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  };

  private focusables(): HTMLElement[] {
    return [...this.panel.querySelectorAll<HTMLElement>('button')];
  }

  /** Rebuild the panel; focus goes to `focusKey`, else to whatever had it before. */
  private renderPanel(focusKey = document.activeElement?.getAttribute('data-k')): void {
    this.panel.replaceChildren(...this.items.map((item, i) => this.renderItem(item, i)));
    if (focusKey) this.panel.querySelector<HTMLElement>(`[data-k="${focusKey}"]`)?.focus();
  }

  private renderItem(item: MenuItem, index: number): HTMLElement {
    if (item.kind === 'action') {
      return h(
        'button',
        {
          class: 'ww-menu-item',
          attrs: { role: 'menuitem', 'data-k': `item-${index}` },
          on: {
            click: () => {
              this.setOpen(false);
              item.onClick();
            },
          },
        },
        item.label,
        item.hint ? h('small', {}, item.hint) : null,
      );
    }
    return h(
      'div',
      { class: 'ww-menu-sec' },
      h('div', { class: 'ww-menu-label', attrs: { id: `ww-menu-${index}` } }, item.label),
      h(
        'div',
        { class: 'seg', attrs: { role: 'group', 'aria-labelledby': `ww-menu-${index}` } },
        ...item.options.map((o) =>
          h(
            'button',
            {
              class: `seg-btn${o.id === item.value ? ' is-on' : ''}`,
              attrs: {
                'aria-pressed': String(o.id === item.value),
                'data-k': `choice-${index}-${o.id}`,
              },
              on: {
                click: () => {
                  item.value = o.id;
                  item.onChange(o.id);
                  // Keep focus on the picked option (a click does not focus a button in Safari).
                  this.renderPanel(`choice-${index}-${o.id}`);
                },
              },
            },
            o.label,
          ),
        ),
      ),
    );
  }
}
