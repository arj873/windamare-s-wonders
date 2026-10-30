/**
 * The online draft table (UX.md §7, §8 online): renders the RoomClient's game snapshot with the
 * same `tableModel` + `DraftTable` as the hotseat game, so online and offline look the same. The
 * server owns the state: this only draws the member's own view (`client.game.view`, already
 * redacted by the server), turns clicks into `pick` / `unpick` / `answer`, and counts the
 * server's stage clock down between messages. It never holds another seat's hand or pick.
 *
 * Around the table: a presence strip (who the game waits on, who is offline or played by a bot)
 * and a chat dock (the room's ChatPanel, moved here from the lobby).
 */
import type { DraftEngine, SeatId } from '../../engine';
import type { GameSnapshot, RoomClient } from '../../net/client';
import type { RoomInfo } from '../../net/protocol';
import { confirmDialog, h, motionOn } from '../../ui';
import { seatHex } from '../../ui/online/lobbyModel';
import { listNames, tableModel, type SeatLook, type TableModel } from '../../ui/table/model';
import type { Presenter } from '../../ui/table/present';
import { DraftTable } from '../../ui/table/table';
import type { RevealHook } from '../fx';
import '../../ui/online/online.css';

/** Timer ring refresh between messages, ms (as the hotseat TICK_MS). */
export const NET_TICK_MS = 250;

export interface NetPlayOptions<S, T> {
  client: RoomClient<S, T>;
  /** Client-side engine: the table model asks it for legal uses of the viewer's own view. */
  engine: DraftEngine<S, T>;
  present: Presenter<S, T>;
  /**
   * The reveal animation and sound: the binding's hook (src/game/windamere/fx.ts, the same path
   * as play.ts offline). Absent = no reveal animation.
   */
  fx?: RevealHook<S, T>;
  /** Final scores: "New game" = leave the room. */
  onLeave(): void;
  /** A pick / answer could not be sent (not connected). */
  onSendFailed?(): void;
  /** Repeating timer (tests inject a fake); returns a stop function. */
  every?: (fn: () => void, ms: number) => () => void;
}

const realEvery = (fn: () => void, ms: number): (() => void) => {
  const t = setInterval(fn, ms);
  return () => clearInterval(t);
};

/** Each seat's colour (the room's palette slot) and whether a bot plays it now. */
export function roomLooks(room: RoomInfo | null, seats: number): SeatLook[] {
  return Array.from({ length: seats }, (_, i) => {
    const s = room?.seats[i];
    return { color: seatHex(room, i), bot: !s || s.occupant === null || s.status === 'bot' };
  });
}

export interface PresenceSeat {
  seat: SeatId;
  name: string;
  you: boolean;
  /** The owner is disconnected (within the grace period). */
  away: boolean;
  /** A bot plays the seat: an open seat, or its owner was gone past the grace period. */
  bot: boolean;
  /** The game waits on this seat now. */
  waiting: boolean;
}

export interface Presence {
  /** "Waiting on 2 towns: Ana and Cy", "Your pick", "" when nobody is owed anything. */
  line: string;
  seats: PresenceSeat[];
  /** Seats whose human is offline or replaced by a bot (shown with a mark). */
  absent: PresenceSeat[];
  /** The viewer has no seat. */
  watching: boolean;
  /** Connected members without a seat (the viewer included), by nickname. */
  watchers: string[];
}

/**
 * What the presence strip says (pure; UX.md §7.1 "who has not picked yet", §8.5 away seats,
 * §6 "Back to lobby is the rematch path"). `me` is the viewer's member id (host check).
 */
export function presence<S, T>(
  game: GameSnapshot<S, T>,
  room: RoomInfo | null,
  mySeat: SeatId | null,
  me: string | null = null,
): Presence {
  const view = game.view;
  const connected = new Map((room?.members ?? []).map((m) => [m.id, m.connected]));
  const waiting = new Set(game.waiting);
  const seats: PresenceSeat[] = view.seats.map((s) => {
    const info = room?.seats[s.id];
    const human = info !== undefined && info.occupant !== null;
    return {
      seat: s.id,
      name: s.name,
      you: s.id === mySeat,
      away:
        human &&
        (info.status === 'away' ||
          (info.status === 'human' && connected.get(info.occupant ?? '') === false)),
      bot: !human || info.status === 'bot',
      waiting: waiting.has(s.id),
    };
  });
  const absent = seats.filter((s) => {
    const info = room?.seats[s.seat];
    return s.away || (info?.occupant != null && info.status === 'bot');
  });
  let line = '';
  if (view.phase.kind === 'gameOver') {
    const host = room?.members.find((m) => m.id === room.host);
    line =
      me !== null && room?.host === me
        ? 'Game over. Rematch takes everyone back to the lobby.'
        : `Game over. Waiting for ${host?.name ?? 'the host'} to open a rematch.`;
  } else if (waiting.size > 0) {
    const others = seats.filter((s) => s.waiting && !s.you);
    const mine = mySeat !== null && waiting.has(mySeat);
    const verb = view.phase.kind === 'prompt' ? 'answer' : 'pick';
    if (mine && others.length === 0) line = `Your ${verb}: everyone else is ready`;
    else if (others.length > 0) {
      const n = others.length;
      line = `Waiting on ${n} town${n === 1 ? '' : 's'}: ${listNames(others.map((s) => s.name))}`;
    }
  }
  const watchers = (room?.members ?? [])
    .filter((m) => m.seat === null && m.connected)
    .map((m) => m.name ?? 'Someone');
  return { line, seats, absent, watching: mySeat === null, watchers };
}

export class NetPlay<S, T> {
  readonly element: HTMLElement;
  readonly table: DraftTable;
  private readonly presenceEl: HTMLElement;
  private readonly dock: HTMLElement;
  private readonly dockPanel: HTMLElement;
  private readonly dockToggle: HTMLButtonElement;
  private unsub: (() => void) | null = null;
  private stopTick: (() => void) | null = null;
  private model: TableModel | null = null;
  /** The last action handed to the fx hook (null until the first render). */
  private fxKey: string | null = null;
  private locked = false;

  constructor(private readonly opts: NetPlayOptions<S, T>) {
    const client = opts.client;
    const handlers = {
      pick: (pick: Parameters<RoomClient<S, T>['pick']>[0]) => this.sent(client.pick(pick)),
      unpick: () => this.sent(client.unpick()),
      answer: (prompt: number, answer: Parameters<RoomClient<S, T>['answer']>[1]) =>
        this.sent(client.answer(prompt, answer)),
      newGame: () => opts.onLeave(),
      skip: () => opts.fx?.skip?.(),
      // Read at every render: only the host gets "Rematch" (it takes the room back to the lobby).
      get rematch() {
        return client.isHost ? () => void client.rematch() : undefined;
      },
    };
    this.table = new DraftTable(handlers);
    this.presenceEl = h('div', {
      class: 'ol-presence',
      attrs: { role: 'status', 'aria-live': 'polite', 'data-k': 'presence' },
    });
    this.dockPanel = h('div', { class: 'ol-dock-panel', attrs: { 'data-k': 'chat-dock' } });
    this.dockPanel.hidden = true;
    this.dockToggle = h(
      'button',
      {
        class: 'btn ol-dock-toggle',
        attrs: { 'aria-expanded': 'false', 'data-k': 'chat-toggle' },
        on: { click: () => this.toggleChat() },
      },
      'Chat',
    );
    const leave = h(
      'button',
      {
        // Solid, not ghost: the dock floats over the log text.
        class: 'btn',
        attrs: { 'data-k': 'leave-room' },
        on: {
          click: () => {
            // Watching, or the game is over: nothing is lost by leaving.
            const g = client.game;
            if (client.mySeat === null || g?.view.phase.kind === 'gameOver') return opts.onLeave();
            void confirmDialog(
              'Leave the room?',
              'A bot plays your town. Open the invite link again in this browser to take it back.',
              'Leave',
            ).then((yes) => yes && opts.onLeave());
          },
        },
      },
      'Leave',
    );
    // Bottom right, over the log column: never over the hand or the towns.
    this.dock = h(
      'div',
      { class: 'ww-shell ol-dock' },
      this.dockPanel,
      this.presenceEl,
      h('div', { class: 'ol-row' }, leave, this.dockToggle),
    );
    this.element = h(
      'div',
      { class: 'ol-play', attrs: { 'data-k': 'online-table' } },
      this.table.element,
      this.dock,
    );
  }

  /** Follow the client: render now and on every game / room change; tick the clock. */
  start(): void {
    if (this.unsub) return;
    this.unsub = this.opts.client.on((e) => {
      if (e.type === 'game' || e.type === 'room') this.render();
    });
    this.stopTick = (this.opts.every ?? realEvery)(() => this.tick(), NET_TICK_MS);
    this.render();
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
    this.stopTick?.();
    this.stopTick = null;
  }

  dispose(): void {
    this.stop();
    this.opts.fx?.dispose?.();
    this.table.destroy();
    this.element.remove();
  }

  /** Move the room's chat panel into the dock (null = no chat). */
  setChat(chat: HTMLElement | null): void {
    this.dockPanel.replaceChildren(...(chat ? [chat] : []));
    this.dock.hidden = chat === null;
  }

  /** A chat line from someone else while the dock is closed: unread dot. */
  noteUnread(): void {
    if (this.dockPanel.hidden) this.dockToggle.classList.add('has-unread');
  }

  get current(): TableModel | null {
    return this.model;
  }

  render(): void {
    const { client, engine, present } = this.opts;
    const game = client.game;
    if (!game) return;
    const view = game.view;
    const viewer = view.view.viewer;
    const looks = roomLooks(client.room, view.seats.length);
    const model = tableModel({ view, engine, present, looks });
    this.locked =
      viewer !== null &&
      (view.phase.kind === 'prompt'
        ? model.prompt?.answered === true
        : view.view.submitted[viewer] === true);
    this.model = model;
    this.table.update(model);
    // The fx lane animates each new action once the table shows it (never the first render),
    // as play.ts does offline.
    if (this.fxKey !== null && model.actionKey !== this.fxKey) {
      this.opts.fx?.onAction({
        key: model.actionKey,
        view,
        model,
        anchors: this.table.anchors,
        reducedMotion: !motionOn(),
      });
    }
    this.fxKey = model.actionKey;
    this.renderPresence(game);
    this.tick();
  }

  private tick(): void {
    const g = this.opts.client.game;
    const left = this.opts.client.timerLeftMs();
    this.table.setTimer(
      g?.timer && left !== null
        ? { remainingMs: left, totalMs: g.timer.totalMs, locked: this.locked }
        : null,
    );
  }

  private renderPresence(game: GameSnapshot<S, T>): void {
    const c = this.opts.client;
    const p = presence(game, c.room, c.mySeat, c.you?.member ?? null);
    this.element.classList.toggle('is-over', game.view.phase.kind === 'gameOver');
    const parts: Node[] = [];
    if (p.watching) {
      parts.push(
        h(
          'span',
          { class: 'ol-presence-watch', attrs: { 'data-k': 'you-watch' } },
          "You're watching: no hand is shown. You can play in the next game.",
        ),
      );
    }
    if (p.line) parts.push(h('span', { attrs: { 'data-k': 'waiting-line' } }, p.line));
    for (const s of p.absent) {
      parts.push(
        h(
          'span',
          {
            class: `ol-presence-seat${s.away ? ' is-away' : ''}`,
            style: { '--seat': seatHex(c.room, s.seat) },
            attrs: { 'data-seat': String(s.seat), 'data-k': `absent-${s.seat}` },
          },
          h('span', { class: 'ol-dot', attrs: { 'aria-hidden': 'true' } }),
          s.away ? `${s.name} is offline` : `${s.name} is away: a bot plays`,
        ),
      );
    }
    if (p.watchers.length > 0) {
      const n = p.watchers.length;
      parts.push(
        h(
          'span',
          { class: 'muted', title: p.watchers.join(', '), attrs: { 'data-k': 'watchers' } },
          `${n} watching`,
        ),
      );
    }
    this.presenceEl.replaceChildren(...parts);
  }

  private toggleChat(): void {
    const open = this.dockPanel.hidden;
    this.dockPanel.hidden = !open;
    this.dockToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      this.dockToggle.classList.remove('has-unread');
      this.dockPanel.querySelector<HTMLInputElement>('input')?.focus();
    }
  }

  /** A send failed (offline): say so; the hand stays as the last view drew it. */
  private sent(ok: boolean): void {
    if (!ok) this.opts.onSendFailed?.();
  }
}
