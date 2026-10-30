/**
 * Online chat (UX.md §7.6): message list, input, quick reactions. One instance lives for the whole
 * room visit and moves between the lobby and the table's chat dock. Text is always set as text,
 * never HTML (names and lines are other people's input).
 */
import type { ChatEntry, Reaction } from '../../net/protocol';
import { LIMITS, REACTIONS } from '../../net/protocol';
import { h } from '../dom';
import './online.css';

export const REACTION_FACE: Record<Reaction, string> = {
  thumbsUp: '👍',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
  clap: '👏',
  think: '🤔',
  gg: 'GG',
};

export const REACTION_LABEL: Record<Reaction, string> = {
  thumbsUp: 'Thumbs up',
  laugh: 'Laugh',
  wow: 'Wow',
  sad: 'Sad',
  clap: 'Clap',
  think: 'Thinking',
  gg: 'Good game',
};

export interface ChatPanelOptions {
  /** False when it could not be sent (offline). */
  send: (text: string) => boolean;
  react: (r: Reaction) => boolean;
  /** Seat colour of a chat line (null = no seat). */
  colorOf: (entry: ChatEntry) => string | null;
  /** A line from someone else arrived (unread dot, sound). */
  onIncoming?: (entry: ChatEntry) => void;
  /** The viewer's member id (their own lines are not "incoming"). */
  me?: () => string | null;
  /** Local time of a line; injectable so tests do not depend on the machine's time zone. */
  time?: (at: number) => string;
}

function localTime(at: number): string {
  const when = new Date(at);
  return Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export class ChatPanel {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly note: HTMLElement;
  private readonly reactBtns: HTMLButtonElement[];
  private lastId = -1;

  constructor(private readonly opts: ChatPanelOptions) {
    this.list = h('div', {
      class: 'ol-chat-list',
      attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat messages' },
    });
    this.input = h('input', {
      class: 'input ol-chat-input',
      placeholder: 'Say something…',
      maxLength: LIMITS.chat,
      attrs: { 'aria-label': 'Chat message', 'data-k': 'chat-input', autocomplete: 'off' },
      on: {
        keydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
          // Table shortcuts (1-9, B, S, Z, Esc) must not fire while typing.
          e.stopPropagation();
        },
      },
    });
    this.sendBtn = h(
      'button',
      {
        class: 'btn btn-sm ol-chat-send',
        attrs: { 'aria-label': 'Send message', 'data-k': 'chat-send' },
        on: { click: () => this.submit() },
      },
      'Send',
    );
    this.reactBtns = REACTIONS.map((r) =>
      h(
        'button',
        {
          class: `ol-react${r === 'gg' ? ' is-text' : ''}`,
          title: REACTION_LABEL[r],
          attrs: { 'aria-label': `React: ${REACTION_LABEL[r]}`, 'data-k': `react-${r}` },
          on: { click: () => this.opts.react(r) },
        },
        REACTION_FACE[r],
      ),
    );
    this.note = h('div', { class: 'ol-chat-note' });
    this.element = h(
      'div',
      { class: 'ol-chat' },
      this.list,
      h(
        'div',
        { class: 'ol-reacts', attrs: { role: 'group', 'aria-label': 'Reactions' } },
        ...this.reactBtns,
      ),
      h('div', { class: 'ol-chat-compose' }, this.input, this.sendBtn),
      this.note,
    );
    this.renderEmpty();
  }

  /** Replace the whole list (welcome, reconnect). */
  setEntries(entries: readonly ChatEntry[]): void {
    this.list.replaceChildren();
    this.lastId = -1;
    for (const e of entries) this.append(e, false);
    this.renderEmpty();
    this.list.scrollTop = this.list.scrollHeight;
  }

  add(entry: ChatEntry): void {
    if (entry.id <= this.lastId) return;
    this.list.querySelector('.ol-chat-empty')?.remove();
    this.append(entry, true);
    if (entry.from !== null && entry.from !== this.opts.me?.()) this.opts.onIncoming?.(entry);
  }

  /** Disable typing (no nickname yet, or offline) with a short reason. */
  setEnabled(enabled: boolean, reason = ''): void {
    this.input.disabled = !enabled;
    this.sendBtn.disabled = !enabled;
    this.note.textContent = enabled ? '' : reason;
  }

  /** Reactions need a connection, not a nickname. */
  setReactionsEnabled(enabled: boolean): void {
    for (const b of this.reactBtns) b.disabled = !enabled;
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (text === '') return;
    if (this.opts.send(text)) this.input.value = '';
  }

  private renderEmpty(): void {
    if (this.list.childElementCount === 0) {
      this.list.append(h('div', { class: 'ol-chat-empty muted' }, 'No messages yet. Say hi!'));
    }
  }

  private append(e: ChatEntry, scroll: boolean): void {
    this.lastId = Math.max(this.lastId, e.id);
    const atBottom = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 12;
    const color = this.opts.colorOf(e);
    const time = (this.opts.time ?? localTime)(e.at);
    this.list.append(
      e.from === null
        ? h('div', { class: 'ol-chat-row is-system', title: time }, e.text)
        : h(
            'div',
            { class: 'ol-chat-row', title: time },
            h(
              'b',
              { class: 'ol-chat-name', style: color ? { '--seat': color } : {} },
              e.name || 'Someone',
            ),
            ' ',
            h('span', { class: 'ol-chat-text' }, e.text),
          ),
    );
    if (scroll && atBottom) this.list.scrollTop = this.list.scrollHeight;
  }
}

/** Floating reaction bubbles (UX.md §7.6), over the lobby and the table. */
export class ReactionLayer {
  readonly element: HTMLElement;

  constructor(parent: HTMLElement) {
    this.element = h('div', { class: 'ol-reaction-layer', attrs: { 'aria-live': 'polite' } });
    parent.append(this.element);
  }

  show(name: string, color: string | null, reaction: Reaction): void {
    const bubble = h(
      'div',
      { class: 'ol-bubble', style: color ? { '--seat': color } : {} },
      h(
        'span',
        { class: `ol-bubble-face${reaction === 'gg' ? ' is-text' : ''}` },
        REACTION_FACE[reaction],
      ),
      h('span', { class: 'ol-bubble-name' }, name),
    );
    this.element.append(bubble);
    while (this.element.childElementCount > 6) this.element.firstElementChild?.remove();
    setTimeout(() => bubble.classList.add('is-leaving'), 2600);
    setTimeout(() => bubble.remove(), 3100);
  }

  destroy(): void {
    this.element.remove();
  }
}
