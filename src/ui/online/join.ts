/**
 * Full-screen cards of a room visit (UX.md §4.1): the invite landing card ("Join room K7QF",
 * nickname, Join / Watch), the start card of the online dev page (create a room or enter a code),
 * and notice screens (connecting, room not found, disconnected).
 */
import { LIMITS } from '../../net/protocol';
import { parseRoomCode } from '../../net/transport';
import { append, h } from '../dom';
import '../shell.css';
import './online.css';

export interface NoticeAction {
  label: string;
  primary?: boolean;
  key?: string;
  onClick: () => void;
}

/** A centred card with a title, a line of text and buttons. */
export function noticeScreen(
  title: string,
  text: string,
  actions: readonly NoticeAction[] = [],
  opts: { spinner?: boolean } = {},
): HTMLElement {
  const card = h(
    'div',
    { class: 'ol-card', attrs: { role: 'alertdialog', 'aria-labelledby': 'ol-notice-title' } },
    h(
      'h1',
      { id: 'ol-notice-title' },
      opts.spinner && h('span', { class: 'ol-spin', attrs: { 'aria-hidden': 'true' } }),
      title,
    ),
  );
  append(card, [
    text && h('p', { class: 'muted', attrs: { 'data-k': 'notice-text' } }, text),
    actions.length > 0 &&
      h(
        'div',
        { class: 'ol-card-actions' },
        ...actions.map((a) =>
          h(
            'button',
            {
              class: `btn${a.primary ? ' btn-primary' : ''}`,
              attrs: { 'data-k': a.key ?? `notice-${a.label.toLowerCase().replace(/\W+/g, '-')}` },
              on: { click: a.onClick },
            },
            a.label,
          ),
        ),
      ),
  ]);
  return h('div', { class: 'ww-shell ol-screen', attrs: { 'data-k': 'notice' } }, card);
}

export interface JoinCardOptions {
  /** The remembered nickname. */
  name: string;
  /** Invite landing: the room is known. Absent: the start card (create, or enter a code). */
  invite?: { roomId: string; playing: boolean };
  /** Join (with a nickname: you take a free seat, or watch when the game is on). */
  onJoin(name: string, roomId: string): void;
  /** Watch without a seat (invite only). */
  onWatch?(roomId: string): void;
  /** Start card: create a room as host. */
  onCreate?(name: string): void;
  /** Back to the home screen. */
  onHome?(): void;
}

export class JoinCard {
  readonly element: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement | null;
  private readonly error: HTMLElement;

  constructor(private readonly opts: JoinCardOptions) {
    const invite = opts.invite;
    this.nameInput = h('input', {
      class: 'input ol-name',
      value: opts.name,
      maxLength: LIMITS.name,
      placeholder: 'Your nickname',
      attrs: { 'aria-label': 'Nickname', 'data-k': 'join-name', autocomplete: 'nickname' },
      on: { keydown: (e) => e.key === 'Enter' && this.join() },
    });
    this.codeInput = invite
      ? null
      : h('input', {
          class: 'input ol-code-input',
          placeholder: 'Room code or link',
          attrs: { 'aria-label': 'Room code or invite link', 'data-k': 'join-code' },
          on: { keydown: (e) => e.key === 'Enter' && this.join() },
        });
    this.error = h('p', { class: 'ol-error', attrs: { role: 'alert', 'data-k': 'join-error' } });
    const button = (label: string, key: string, onClick: () => void, primary = false) =>
      h(
        'button',
        {
          class: `btn${primary ? ' btn-primary' : ''}`,
          attrs: { 'data-k': key },
          on: { click: onClick },
        },
        label,
      );
    const card = h(
      'div',
      { class: 'ol-card', attrs: { role: 'main', 'aria-labelledby': 'ol-join-title' } },
      h('h1', { id: 'ol-join-title' }, invite ? `Join room ${invite.roomId}` : 'Play online'),
      h(
        'p',
        { class: 'muted' },
        invite
          ? invite.playing
            ? 'A game is on at this table: you can watch, and play in the next one.'
            : 'Pick a nickname: you take a free seat at the table.'
          : 'Create a room and send the link to friends, or join one with its code.',
      ),
      h('label', { class: 'ol-label' }, 'Nickname', this.nameInput),
    );
    if (invite) {
      append(card, [
        h(
          'div',
          { class: 'ol-card-actions' },
          opts.onWatch && button('Watch', 'join-watch', () => opts.onWatch?.(invite.roomId)),
          button(invite.playing ? 'Join and watch' : 'Join', 'join', () => this.join(), true),
        ),
      ]);
    } else {
      append(card, [
        h(
          'div',
          { class: 'ol-card-actions' },
          opts.onCreate && button('Create a room', 'create', () => this.create(), true),
        ),
        h(
          'div',
          { class: 'ol-row' },
          this.codeInput,
          button('Join', 'join', () => this.join()),
        ),
      ]);
    }
    append(card, [
      this.error,
      opts.onHome &&
        h(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            attrs: { 'data-k': 'home' },
            on: { click: () => opts.onHome?.() },
          },
          'Back',
        ),
    ]);
    this.element = h(
      'div',
      { class: 'ww-shell ol-screen', attrs: { 'data-k': 'join-card' } },
      card,
    );
  }

  /** Show a problem under the buttons (bad code, room gone). */
  setError(text: string): void {
    this.error.textContent = text;
  }

  private name(): string | null {
    const name = this.nameInput.value.trim();
    if (name === '') {
      this.setError('Pick a nickname first.');
      this.nameInput.focus();
      return null;
    }
    return name;
  }

  private create(): void {
    const name = this.name();
    if (name !== null) this.opts.onCreate?.(name);
  }

  private join(): void {
    const name = this.name();
    if (name === null) return;
    const invite = this.opts.invite;
    if (invite) return this.opts.onJoin(name, invite.roomId);
    const code = parseRoomCode(this.codeInput?.value ?? '');
    if (code === null) {
      this.setError('That is not a room code (6 letters and digits, or an invite link).');
      this.codeInput?.focus();
      return;
    }
    this.opts.onJoin(name, code);
  }
}
