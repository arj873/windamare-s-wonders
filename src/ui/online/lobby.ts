/**
 * Online lobby (UX.md §6, port of Catan's LobbyScreen): invite link, nickname, seats in table
 * order (sit, move, stand up; the host adds and removes bot seats), the host's settings (clock
 * preset; read-only for guests), chat, and Start. Re-renders the seats on every room update; the
 * name field, the chat and the copy button persist.
 */
import {
  BOT_LEVELS,
  LIMITS,
  type BotLevel,
  type RoomConfig,
  type RoomInfo,
  type TimerPreset,
} from '../../net/protocol';
import { confirmDialog } from '../dialog';
import { append, h } from '../dom';
import {
  BOT_LEVEL_OPTIONS,
  botLevelLabel,
  COLOUR_SLOTS,
  lobbyView,
  seatColor,
  TIMER_OPTIONS,
  timerHint,
  withBotLevel,
  withColour,
  withConfig,
  withSeatCount,
  type LobbyView,
  type SeatRange,
  type SeatView,
} from './lobbyModel';
import '../shell.css';
import '../setup/setup.css';
import './online.css';

export interface LobbyActions {
  setName(name: string): void;
  takeSeat(seat: number): void;
  leaveSeat(): void;
  /** Host: new room settings. `false` = not sent (offline): the lobby keeps showing the old. */
  configure(config: RoomConfig): boolean;
  start(): void;
  leave(): void;
  /** Host: remove a member from the room (asked to confirm first). */
  kick(member: string): void;
}

export interface LobbyOptions {
  roomId: string;
  inviteUrl: string;
  range: SeatRange;
  actions: LobbyActions;
  /** The chat panel element (moved here while the lobby is shown). */
  chat: HTMLElement;
  /** Clipboard write; default navigator.clipboard with a select() fallback. */
  copy?: (text: string) => Promise<void>;
  /** "Are you sure?" before a kick; default ui's confirmDialog. */
  confirm?: (title: string, text: string, confirmLabel: string) => Promise<boolean>;
}

/** The `data-k` of the focused control inside `box`, so a re-render can put focus back. */
function focusedKey(box: HTMLElement): string | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && box.contains(el) ? el.getAttribute('data-k') : null;
}

function refocus(box: HTMLElement, key: string | null): void {
  if (key) box.querySelector<HTMLElement>(`[data-k="${key}"]`)?.focus();
}

async function defaultCopy(text: string, input: HTMLInputElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    input.select();
    document.execCommand('copy');
  }
}

export class LobbyScreen {
  readonly element: HTMLElement;
  private readonly seatsBox: HTMLElement;
  private readonly specBox: HTMLElement;
  private readonly roleBox: HTMLElement;
  private readonly watchBox: HTMLElement;
  private readonly inviteNote: HTMLElement;
  private readonly configBox: HTMLElement;
  private readonly configNote: HTMLElement;
  private readonly chatBox: HTMLElement;
  private readonly footerInfo: HTMLElement;
  private readonly footerActions: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly linkInput: HTMLInputElement;
  private readonly copyLabel: HTMLElement;
  private room: RoomInfo | null = null;
  private me: string | null = null;
  private view: LobbyView | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;
  /** Host: the seat whose colour swatches are open, if any. */
  private colourOpen: number | null = null;

  constructor(private readonly opts: LobbyOptions) {
    this.linkInput = h('input', {
      class: 'input ol-link',
      value: opts.inviteUrl,
      attrs: { readonly: '', 'aria-label': 'Invite link', 'data-k': 'invite' },
      on: { focus: (e) => (e.target as HTMLInputElement).select() },
    });
    this.copyLabel = h('span', { attrs: { 'aria-live': 'polite' } }, 'Copy link');
    const copyBtn = h(
      'button',
      {
        class: 'btn btn-primary ol-copy',
        attrs: { 'data-k': 'copy' },
        on: { click: () => void this.copy() },
      },
      this.copyLabel,
    );
    this.nameInput = h('input', {
      class: 'input ol-name',
      maxLength: LIMITS.name,
      placeholder: 'Your nickname',
      attrs: { 'aria-label': 'Nickname', 'data-k': 'nickname', autocomplete: 'nickname' },
      on: {
        keydown: (e) => {
          if (e.key === 'Enter') this.commitName();
        },
        change: () => this.commitName(),
      },
    });
    this.roleBox = h('span', { class: 'ol-role' });
    this.watchBox = h('div', {
      class: 'ol-watch',
      attrs: { role: 'status', 'data-k': 'watching' },
    });
    this.watchBox.hidden = true;
    this.inviteNote = h('p', { class: 'su-hint muted', attrs: { 'data-k': 'invite-note' } });
    this.seatsBox = h('ol', { class: 'ol-seats', attrs: { 'aria-label': 'Seats in table order' } });
    this.specBox = h('div', { class: 'ol-specs' });
    this.configBox = h('div', { class: 'ol-config' });
    this.configNote = h('p', { class: 'su-hint muted', attrs: { 'data-k': 'config-note' } });
    this.chatBox = h('div', { class: 'ol-chat-slot' });
    this.footerInfo = h('div', { class: 'su-summary ol-summary', attrs: { 'data-k': 'summary' } });
    this.footerActions = h('div', { class: 'ol-footer-actions' });

    const section = (title: string, id: string, ...body: Node[]) =>
      h(
        'section',
        { class: 'su-sec', attrs: { 'aria-labelledby': `ol-h-${id}` } },
        h('h2', { id: `ol-h-${id}` }, title),
        ...body,
      );

    this.element = h(
      'div',
      {
        class: 'ww-shell setup ol-lobby',
        attrs: { role: 'main', 'aria-label': 'Room lobby' },
      },
      h(
        'div',
        { class: 'su-scroll' },
        h(
          'div',
          { class: 'ol-inner' },
          h(
            'div',
            { class: 'ol-main' },
            h(
              'header',
              { class: 'su-head' },
              h(
                'div',
                {},
                h('h1', {}, 'Lobby'),
                h(
                  'p',
                  { class: 'muted' },
                  'Room ',
                  h('b', { class: 'ol-code', attrs: { 'data-k': 'room-code' } }, opts.roomId),
                ),
              ),
            ),
            this.watchBox,
            section(
              'Invite friends',
              'invite',
              h('div', { class: 'ol-row' }, this.linkInput, copyBtn),
              this.inviteNote,
            ),
            section(
              'You',
              'you',
              h(
                'div',
                { class: 'ol-row' },
                this.nameInput,
                h(
                  'button',
                  {
                    class: 'btn',
                    attrs: { 'data-k': 'save-name' },
                    on: { click: () => this.commitName() },
                  },
                  'Save',
                ),
                this.roleBox,
              ),
            ),
            section('Seats', 'seats', this.seatsBox, this.specBox),
            section('Game settings', 'config', this.configBox, this.configNote),
          ),
          h('aside', { class: 'ol-side' }, section('Chat', 'chat', this.chatBox)),
        ),
      ),
      h(
        'div',
        { class: 'su-footer' },
        h('div', { class: 'su-footer-in' }, this.footerInfo, this.footerActions),
      ),
    );
    this.chatBox.append(opts.chat);
  }

  /** Re-render from a room update. */
  update(room: RoomInfo, me: string | null): void {
    this.room = room;
    this.me = me;
    const v = lobbyView(room, me, this.opts.range);
    this.view = v;
    if (document.activeElement !== this.nameInput) this.nameInput.value = v.me?.name ?? '';
    this.roleBox.replaceChildren();
    append(this.roleBox, [
      v.isHost && h('span', { class: 'ol-tag is-host' }, 'Host'),
      h('span', { class: 'ol-tag' }, v.me?.seat != null ? 'Player' : 'Watching'),
    ]);
    this.inviteNote.textContent = v.inviteNote;
    this.renderWatching(v);
    this.renderSeats(v);
    this.renderConfig(room.config, v);
    this.renderFooter(v);
  }

  /** Put the chat panel back here (after a game). */
  attachChat(chat: HTMLElement): void {
    this.chatBox.append(chat);
  }

  destroy(): void {
    if (this.copiedTimer !== null) clearTimeout(this.copiedTimer);
    this.element.remove();
  }

  /**
   * Host edit: send it and show it now (`withConfig`), so the next edit builds on it even before
   * the server's room message comes back; that message then replaces the guess.
   */
  private configure(config: RoomConfig): void {
    const room = this.room;
    if (this.opts.actions.configure(config) === false || !room) return;
    this.update(withConfig(room, config), this.me);
  }

  private commitName(): void {
    const name = this.nameInput.value.trim();
    if (name === '' || name === this.view?.me?.name) return;
    this.opts.actions.setName(name);
  }

  private async copy(): Promise<void> {
    const text = this.opts.inviteUrl;
    await (this.opts.copy ? this.opts.copy(text) : defaultCopy(text, this.linkInput));
    this.copyLabel.textContent = 'Copied!';
    if (this.copiedTimer !== null) clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => (this.copyLabel.textContent = 'Copy link'), 1800);
  }

  private renderWatching(v: LobbyView): void {
    const w = v.watching;
    this.watchBox.hidden = w === null;
    if (!w) return;
    const seat = w.openSeat;
    const next = !w.named
      ? 'Enter a nickname below to take a seat.'
      : seat !== null
        ? 'Take an open seat:'
        : v.tableFull
          ? 'Every seat has a player; you can sit if one frees up.'
          : v.isHost
            ? 'Add a seat below to sit down.'
            : 'Ask the host to add a seat.';
    this.watchBox.replaceChildren();
    append(this.watchBox, [
      h('span', { class: 'ol-watch-text' }, h('b', {}, "You're watching."), ` ${next}`),
      w.named &&
        seat !== null &&
        h(
          'button',
          {
            class: 'btn btn-sm btn-primary',
            attrs: { 'data-k': 'watch-sit' },
            on: { click: () => this.opts.actions.takeSeat(seat) },
          },
          'Sit here',
        ),
    ]);
  }

  private renderSeats(v: LobbyView): void {
    const room = this.room;
    if (this.colourOpen !== null && !v.seats[this.colourOpen]?.canSetColour) this.colourOpen = null;
    const focus = focusedKey(this.seatsBox);
    this.seatsBox.replaceChildren(...v.seats.map((s) => this.seatCard(s, v)));
    if (v.canAddSeat && room) {
      this.seatsBox.append(
        h(
          'li',
          { class: 'ol-seat-add-row' },
          h(
            'button',
            {
              class: 'btn btn-ghost ol-seat-add',
              title: 'Add a seat; a bot plays it unless someone sits down',
              attrs: { 'data-k': 'add-bot' },
              on: {
                click: () => this.configure(withSeatCount(room.config, room.seats.length + 1)),
              },
            },
            '+ Add bot',
          ),
        ),
      );
    }
    this.specBox.replaceChildren();
    if (v.spectators.length > 0) {
      this.specBox.append(
        h(
          'p',
          { class: 'ol-spec-list' },
          h('span', { class: 'muted' }, 'Watching: '),
          ...v.spectators.map((m) =>
            h(
              'span',
              {
                class: `ol-spec${m.connected ? '' : ' is-away'}`,
                attrs: { 'data-k': `spec-${m.member}` },
              },
              m.name,
              m.isMe && h('span', { class: 'ol-tag' }, 'You'),
              m.isHost && h('span', { class: 'ol-tag is-host' }, 'Host'),
              m.canKick &&
                h(
                  'button',
                  {
                    class: 'ol-spec-kick',
                    title: `Remove ${m.name} from the room`,
                    attrs: {
                      'aria-label': `Remove ${m.name} from the room`,
                      'data-k': `kick-${m.member}`,
                    },
                    on: { click: () => void this.kick(m.member, m.name) },
                  },
                  '×',
                ),
            ),
          ),
        ),
      );
    }
    refocus(this.seatsBox, focus);
  }

  /** Host: remove a member, after "Are you sure?" (UX.md §11.5: destructive actions only). */
  private async kick(member: string, name: string): Promise<void> {
    const ask = this.opts.confirm ?? confirmDialog;
    const ok = await ask(
      `Remove ${name}?`,
      // Net drops the member and its token; the invite link still works for them (a new member).
      `${name} is taken out of the room and loses their seat. They can still come back with the invite link.`,
      'Remove',
    );
    if (ok) this.opts.actions.kick(member);
  }

  private seatCard(s: SeatView, v: LobbyView): HTMLElement {
    const a = this.opts.actions;
    const room = this.room;
    const meSeated = v.me?.seat != null;
    const name = s.name ?? 'Bot';
    const level = botLevelLabel(s.botLevel);
    const sub =
      s.name === null
        ? `Open seat · ${/^[aeiou]/i.test(level) ? 'an' : 'a'} ${level} bot plays it`
        : s.isAway
          ? 'Disconnected · seat kept for a minute'
          : 'Connected';
    const buttons: (HTMLElement | false)[] = [
      s.canSetLevel && !!room && this.levelSelect(s, room),
      s.canRemove &&
        !!room &&
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            title: 'Remove this seat',
            attrs: { 'data-k': 'remove-bot' },
            on: {
              click: () => this.configure(withSeatCount(room.config, room.seats.length - 1)),
            },
          },
          'Remove seat',
        ),
      s.canKick &&
        s.member !== null &&
        h(
          'button',
          {
            class: 'btn btn-sm btn-ghost',
            title: `Remove ${name} from the room`,
            attrs: { 'data-k': `kick-seat-${s.index}` },
            on: { click: () => s.member !== null && void this.kick(s.member, name) },
          },
          'Remove player',
        ),
      s.canStand &&
        h(
          'button',
          { class: 'btn btn-sm', attrs: { 'data-k': 'stand' }, on: { click: () => a.leaveSeat() } },
          'Stand up',
        ),
      s.canSit &&
        h(
          'button',
          {
            class: 'btn btn-sm btn-primary',
            attrs: { 'data-k': `sit-${s.index}` },
            on: { click: () => a.takeSeat(s.index) },
          },
          meSeated ? 'Move here' : 'Sit here',
        ),
    ];
    const open = this.colourOpen === s.index;
    const dot =
      s.canSetColour && room
        ? h('button', {
            class: 'ol-dot ol-dot-btn',
            title: `${s.colorLabel}: change colour`,
            attrs: {
              'aria-label': `Seat ${s.index + 1} colour: ${s.colorLabel}. Change`,
              'aria-expanded': String(open),
              'data-k': `colour-${s.index}`,
            },
            on: { click: () => this.toggleColours(s.index) },
          })
        : h('span', {
            class: 'ol-dot',
            title: s.colorLabel,
            attrs: { role: 'img', 'aria-label': s.colorLabel },
          });
    return h(
      'li',
      {
        class: `ol-seat${s.isMine ? ' is-mine' : ''}${s.name === null ? ' is-open' : ''}${s.isAway ? ' is-away' : ''}`,
        style: { '--seat': s.color },
        attrs: { 'data-seat': String(s.index), 'data-k': `seat-${s.index}` },
      },
      h('span', { class: 'ol-seat-no', attrs: { 'aria-hidden': 'true' } }, String(s.index + 1)),
      dot,
      h(
        'div',
        { class: 'ol-seat-main' },
        h(
          'div',
          { class: 'ol-seat-name' },
          h('span', { class: 'ol-seat-label', title: name }, name),
          s.isMine && h('span', { class: 'ol-tag' }, 'You'),
          s.isHostSeat && h('span', { class: 'ol-tag is-host' }, 'Host'),
          s.name === null && h('span', { class: 'ol-tag is-bot' }, 'bot'),
        ),
        h('div', { class: 'ol-seat-sub muted' }, sub),
      ),
      h('div', { class: 'ol-seat-actions' }, ...buttons),
      open && room && this.swatches(s, v, room),
    );
  }

  private toggleColours(seat: number): void {
    this.colourOpen = this.colourOpen === seat ? null : seat;
    if (this.view) this.renderSeats(this.view);
    const key =
      this.colourOpen === null
        ? `colour-${seat}`
        : `swatch-${seat}-${this.view?.seats[seat]?.colour ?? 0}`;
    this.seatsBox.querySelector<HTMLElement>(`[data-k="${key}"]`)?.focus();
  }

  /** Host: the palette for one seat. A colour another seat has is offered as a swap. */
  private swatches(s: SeatView, v: LobbyView, room: RoomInfo): HTMLElement {
    const holder = new Map(v.seats.map((x) => [x.colour, x]));
    return h(
      'div',
      {
        class: 'ol-swatches',
        attrs: { role: 'group', 'aria-label': `Colour for seat ${s.index + 1}` },
        on: { keydown: (e) => e.key === 'Escape' && this.toggleColours(s.index) },
      },
      ...COLOUR_SLOTS.map((slot) => {
        const look = seatColor(slot);
        const other = holder.get(slot);
        const mine = slot === s.colour;
        const label =
          mine || !other
            ? look.name
            : `${look.name}: swap with seat ${other.index + 1} (${other.name ?? 'bot'})`;
        return h(
          'button',
          {
            class: `ol-swatch${mine ? ' is-on' : ''}${other && !mine ? ' is-taken' : ''}`,
            style: { '--sw': look.color },
            title: label,
            attrs: {
              'aria-label': label,
              'aria-pressed': String(mine),
              'data-k': `swatch-${s.index}-${slot}`,
            },
            on: {
              click: () => {
                if (!mine) this.configure(withColour(room, s.index, slot));
                this.toggleColours(s.index); // closes; focus back on the seat's colour button
              },
            },
          },
          other && !mine
            ? h('span', { attrs: { 'aria-hidden': 'true' } }, String(other.index + 1))
            : '',
        );
      }),
    );
  }

  /** Host: the bot level for an open seat (UX.md §6 "[Normal ▾]"). */
  private levelSelect(s: SeatView, room: RoomInfo): HTMLElement {
    const select = h(
      'select',
      {
        class: 'input ol-level',
        attrs: { 'aria-label': `Bot level, seat ${s.index + 1}`, 'data-k': `level-${s.index}` },
        on: {
          change: (e) => {
            const level = (e.target as HTMLSelectElement).value as BotLevel;
            if (BOT_LEVELS.includes(level) && level !== s.botLevel) {
              this.configure(withBotLevel(room, s.index, level));
            }
          },
        },
      },
      ...BOT_LEVEL_OPTIONS.map((o) => {
        const opt = h('option', { title: o.hint }, o.label);
        opt.value = o.id;
        return opt;
      }),
    );
    select.value = s.botLevel;
    select.title = BOT_LEVEL_OPTIONS.find((o) => o.id === s.botLevel)?.hint ?? '';
    return select;
  }

  private renderConfig(config: RoomConfig, v: LobbyView): void {
    const pick = (timer: TimerPreset) => {
      if (timer !== config.timer) this.configure({ ...config, timer });
    };
    const focus = focusedKey(this.configBox);
    this.configBox.replaceChildren(
      h(
        'div',
        { class: 'su-field ol-field' },
        h('span', { class: 'ol-field-label' }, 'Pick clock'),
        h(
          'div',
          { class: 'seg', attrs: { role: 'group', 'aria-label': 'Pick clock' } },
          ...TIMER_OPTIONS.map((t) =>
            h(
              'button',
              {
                class: `seg-btn${t.id === config.timer ? ' is-on' : ''}`,
                disabled: !v.isHost,
                title: t.hint,
                attrs: { 'aria-pressed': String(t.id === config.timer), 'data-k': `timer-${t.id}` },
                on: { click: () => pick(t.id) },
              },
              t.label,
            ),
          ),
        ),
        h('small', { class: 'muted' }, `${timerHint(config.timer)}; shorter later in a Season.`),
      ),
    );
    refocus(this.configBox, focus);
    this.configNote.textContent = v.isHost
      ? 'You are the host: add bots or wait for friends, then start. Open seats are played by bots.'
      : v.hostAway
        ? `The host${v.hostName ? ` (${v.hostName})` : ''} is offline. If they are not back within a minute, another player here becomes the host.`
        : `Only the host${v.hostName ? ` (${v.hostName})` : ''} can change the settings.`;
  }

  private renderFooter(v: LobbyView): void {
    const a = this.opts.actions;
    this.footerInfo.replaceChildren(h('strong', {}, 'Online'), ` · ${v.summary}`);
    this.footerActions.replaceChildren(
      h(
        'button',
        { class: 'btn btn-ghost', attrs: { 'data-k': 'leave' }, on: { click: () => a.leave() } },
        'Leave',
      ),
      v.isHost
        ? h(
            'button',
            {
              class: 'btn btn-primary btn-lg',
              disabled: v.startBlocked !== null,
              title: v.startBlocked ?? 'Start the game; bots play the open seats',
              attrs: { 'data-k': 'lobby-start' },
              on: { click: () => a.start() },
            },
            'Start game',
          )
        : h(
            'span',
            { class: 'ol-waiting', attrs: { 'data-k': 'waiting-host' } },
            h('span', { class: 'ol-spin', attrs: { 'aria-hidden': 'true' } }),
            v.hostName ? `Waiting for ${v.hostName} to start…` : 'Waiting for the host to start…',
          ),
    );
  }
}
