/**
 * The home screen (UX.md §4; port of catan's ui/online/home.ts): one card over art's title key
 * art: wordmark, nickname, Play vs bots. Play online, Join with code and Learn to play show only
 * when a handler is given (boot wires the online lane and the tutorial coach), so no button here
 * ever does nothing.
 */
import { h } from '../dom';
import { browserStorage, loadPref, savePref, type PrefStorage } from '../prefs';
import { NAME_MAX } from '../setup/model';
import '../shell.css';
import './home.css';

export const NAME_KEY = 'ww.name';

export interface HomeOptions {
  /** Play vs bots (opens the setup screen) with the nickname typed here. */
  onPlay(name: string): void;
  /** Create a room (absent hides the button). */
  onOnline?(name: string): void;
  /** Join a room by code or pasted invite link (absent hides the field). */
  onJoin?(code: string, name: string): void;
  onTutorial?(): void;
  /** Key art behind the card (public/art). */
  art?: string;
  storage?: PrefStorage | null;
}

/** A room code from a code or an invite link (`?room=CODE`); '' when there is none. */
export function parseRoomCode(text: string): string {
  const t = text.trim();
  const m = /[?&]room=([A-Za-z0-9]+)/.exec(t);
  const code = (m?.[1] ?? t).toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : '';
}

export class HomeScreen {
  readonly element: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly storage: PrefStorage | null;

  constructor(private readonly opts: HomeOptions) {
    this.storage = opts.storage === undefined ? browserStorage() : opts.storage;
    this.nameInput = h('input', {
      class: 'input hm-name',
      value: loadPref(this.storage, NAME_KEY) ?? '',
      maxLength: NAME_MAX,
      placeholder: 'Your nickname',
      attrs: { 'aria-label': 'Nickname', 'data-k': 'nickname', autocomplete: 'nickname' },
      on: { keydown: (e) => e.key === 'Enter' && this.play() },
    });
    this.codeInput = h('input', {
      class: 'input hm-code',
      placeholder: 'Code or link',
      attrs: { 'aria-label': 'Room code or invite link', 'data-k': 'code' },
      on: { keydown: (e) => e.key === 'Enter' && this.join() },
    });
    this.error = h('p', { class: 'hm-error', attrs: { role: 'alert' } });

    const button = (k: string, label: string, cls: string, run: () => void) =>
      h('button', { class: `btn ${cls}`, attrs: { 'data-k': k }, on: { click: run } }, label);

    this.element = h(
      'div',
      { class: 'ww-shell home', attrs: { role: 'main', 'aria-label': "Windamere's Wonders" } },
      opts.art &&
        h('img', { class: 'hm-art', attrs: { src: opts.art, alt: '', 'aria-hidden': 'true' } }),
      h(
        'div',
        { class: 'hm-card' },
        h('h1', { class: 'hm-title' }, "Windamere's Wonders"),
        h('p', { class: 'hm-tag' }, 'Draft cards. Grow a town. Raise a Great Work.'),
        this.nameInput,
        button('play', 'Play vs bots', 'btn-primary btn-lg hm-wide', () => this.play()),
        opts.onOnline &&
          button('online', 'Play online', 'btn-lg hm-wide', () => opts.onOnline?.(this.name())),
        opts.onJoin &&
          h(
            'div',
            { class: 'hm-join' },
            this.codeInput,
            button('join', 'Join', '', () => this.join()),
          ),
        opts.onTutorial && button('learn', 'Learn to play', 'btn-ghost', () => opts.onTutorial?.()),
        this.error,
      ),
    );
  }

  /** The nickname, remembered for next time. */
  name(): string {
    const n = this.nameInput.value.trim().slice(0, NAME_MAX);
    savePref(this.storage, NAME_KEY, n);
    return n;
  }

  private play(): void {
    this.opts.onPlay(this.name());
  }

  private join(): void {
    const code = parseRoomCode(this.codeInput.value);
    if (!code) {
      this.error.textContent = 'That is not a room code or invite link.';
      return;
    }
    this.error.textContent = '';
    this.opts.onJoin?.(code, this.name());
  }

  /** Put the cursor in the nickname field when the screen shows. */
  focus(): void {
    this.nameInput.focus();
  }
}
