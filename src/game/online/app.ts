/**
 * One online room visit (UX.md §3, §4.1, §6; port of Catan's OnlineApp): check the room, ask for
 * a nickname on an invite link, open a RoomClient, then show the lobby or the table as the room
 * phase changes. Owns the chat panel (lobby column or the table's dock), reaction bubbles, the
 * reconnect banner and the fatal screens. The table itself is NetPlay.
 *
 * Hidden information: everything drawn comes from the RoomClient, which only stores what the
 * server sent this member (their own seat's view).
 */
import type { DraftEngine } from '../../engine';
import { RoomClient } from '../../net/client';
import type { ChatEntry, RoomInfo } from '../../net/protocol';
import { tokenKey, type Clock, type KeyStore } from '../../net/transport';
import type { ToastKind } from '../../ui';
import { ConnectionBanner } from '../../ui/online/banner';
import { ChatPanel, ReactionLayer } from '../../ui/online/chat';
import { JoinCard, noticeScreen } from '../../ui/online/join';
import { LobbyScreen } from '../../ui/online/lobby';
import { inviteUrl, seatColor, type SeatRange } from '../../ui/online/lobbyModel';
import { errorText, fatalText } from '../../ui/online/messages';
import { h } from '../../ui/dom';
import type { Presenter } from '../../ui/table/present';
import type { RevealHook } from '../fx';
import type { Backend } from './backend';
import { NetPlay } from './netPlay';

export interface OnlineEnv<S, T> {
  backend: Backend;
  /** Client-side engine + presenter, for the table model (the server has its own engine). */
  engine: DraftEngine<S, T>;
  present: Presenter<S, T>;
  /** Reconnect tokens (backend.ts tokenStoreFor). */
  tokens: KeyStore;
  clock: Clock;
  /** The remembered nickname, and where a new one is saved. */
  name(): string;
  saveName(name: string): void;
  /** This page's URL (invite links are built from it). */
  href: string;
  toast(message: string, kind?: ToastKind): void;
  /** Leave the room: back to the home screen. */
  goHome(): void;
  fx?: RevealHook<S, T>;
  /** Reconnect jitter (default Math.random); keep-alive ping (default the client's). */
  random?: () => number;
  pingMs?: number;
  /** Tests: the NetPlay timer. */
  every?: (fn: () => void, ms: number) => () => void;
}

export class OnlineApp<S, T> {
  /** The visit's root: put it on screen (`root.replaceChildren(app.element)`). */
  readonly element: HTMLElement;
  private readonly screenBox: HTMLElement;
  private screen: HTMLElement | null = null;
  private client: RoomClient<S, T> | null = null;
  private lobby: LobbyScreen | null = null;
  private play: NetPlay<S, T> | null = null;
  private chat: ChatPanel | null = null;
  private reactions: ReactionLayer | null = null;
  private banner: ConnectionBanner | null = null;
  private welcomed = false;
  private disposed = false;
  private readonly onOnline = () => this.client?.retryNow();

  constructor(
    private readonly env: OnlineEnv<S, T>,
    readonly roomId: string,
  ) {
    this.screenBox = h('div', { class: 'ol-screens' });
    this.element = h('div', { class: 'ol-app', attrs: { 'data-room': roomId } }, this.screenBox);
  }

  /** Create a room as its host and go straight in. Throws when the server cannot be reached. */
  static async create<S, T>(env: OnlineEnv<S, T>, name: string): Promise<OnlineApp<S, T>> {
    const { roomId, hostToken } = await env.backend.api.create();
    env.tokens.set(tokenKey(roomId), hostToken);
    env.saveName(name);
    const app = new OnlineApp(env, roomId);
    app.connect(name);
    return app;
  }

  get roomClient(): RoomClient<S, T> | null {
    return this.client;
  }
  get netPlay(): NetPlay<S, T> | null {
    return this.play;
  }
  get lobbyScreen(): LobbyScreen | null {
    return this.lobby;
  }

  /**
   * An invite link or a typed code: check the room, then straight in when this browser already
   * holds a token for it (reload, reconnect), else the join card. `name` given = joined from the
   * home screen with a nickname: no card.
   */
  async run(name?: string): Promise<void> {
    this.show(noticeScreen('Joining room…', '', [], { spinner: true }));
    let room: { phase: string } | null;
    try {
      room = await this.env.backend.api.check(this.roomId);
    } catch (e) {
      if (this.disposed) return;
      this.show(
        noticeScreen('Can’t reach the server', e instanceof Error ? e.message : String(e), [
          { label: 'Home', onClick: () => this.env.goHome() },
          { label: 'Try again', primary: true, onClick: () => void this.run(name) },
        ]),
      );
      return;
    }
    if (this.disposed) return;
    if (!room) {
      this.show(
        noticeScreen(
          'That room has closed',
          `There is no room “${this.roomId}”. It may have expired, or the link is incomplete.`,
          [{ label: 'Home', primary: true, onClick: () => this.env.goHome() }],
        ),
      );
      return;
    }
    if (this.env.tokens.get(tokenKey(this.roomId)) !== null) return this.connect(this.env.name());
    if (name) {
      this.env.saveName(name);
      return this.connect(name);
    }
    const card = new JoinCard({
      name: this.env.name(),
      invite: { roomId: this.roomId, playing: room.phase !== 'lobby' },
      onJoin: (nick) => {
        this.env.saveName(nick);
        this.connect(nick);
      },
      onWatch: () => this.connect(null),
      onHome: () => this.env.goHome(),
    });
    this.show(card.element);
  }

  /** Open the connection; `name` null = watch without a nickname. */
  connect(name: string | null): void {
    if (this.client || this.disposed) return;
    this.show(noticeScreen('Connecting…', '', [], { spinner: true }));
    const env = this.env;
    const client = new RoomClient<S, T>({
      roomId: this.roomId,
      connect: env.backend.connect(this.roomId),
      clock: env.clock,
      store: env.tokens,
      ...(name ? { name } : {}),
      random: env.random ?? Math.random,
      ...(env.pingMs !== undefined ? { pingMs: env.pingMs } : {}),
    });
    this.client = client;
    this.banner = new ConnectionBanner(this.element, () => client.retryNow());
    this.reactions = new ReactionLayer(this.element);
    this.chat = new ChatPanel({
      send: (text) => this.sendOrWarn(client.chatSend(text)),
      react: (r) => this.sendOrWarn(client.react(r)),
      colorOf: (e) => this.colorOf(e),
      me: () => client.you?.member ?? null,
      onIncoming: () => this.play?.noteUnread(),
    });
    client.on((e) => {
      switch (e.type) {
        case 'status':
          return this.onStatus();
        case 'room':
          return this.onRoom(e.room);
        case 'chat':
          this.chat?.add(e.entry);
          return this.onSystemLine(e.entry);
        case 'reaction': {
          const m = client.room?.members.find((x) => x.id === e.member);
          this.reactions?.show(
            m?.name || 'Someone',
            e.seat === null ? null : seatColor(e.seat).color,
            e.reaction,
          );
          return;
        }
        case 'error': {
          const text = errorText(e.code, e.message, e.ref);
          if (text && !client.fatal) env.toast(text, 'error');
          // A refused pick: redraw from the last view so the hand is as the server has it.
          this.play?.render();
          return;
        }
      }
    });
    addEventListener('online', this.onOnline);
    client.start();
  }

  /** Leave for good: forget the token (lobby, final scores) or keep the seat (mid-game). */
  leave(): void {
    const c = this.client;
    if (c?.room?.phase === 'playing') c.close();
    else c?.leave();
    this.env.goHome();
  }

  dispose(): void {
    this.disposed = true;
    removeEventListener('online', this.onOnline);
    this.client?.close();
    this.play?.dispose();
    this.play = null;
    this.lobby?.destroy();
    this.lobby = null;
    this.banner?.destroy();
    this.reactions?.destroy();
    this.element.remove();
  }

  // -------------------------------------------------------------------------

  private sendOrWarn(sent: boolean): boolean {
    if (!sent) this.env.toast('Not connected right now. Reconnecting…', 'error');
    return sent;
  }

  private colorOf(e: ChatEntry): string | null {
    const seat = this.client?.room?.members.find((m) => m.id === e.from)?.seat ?? null;
    return seat === null ? null : seatColor(seat).color;
  }

  /** The server says "<name> ran out of time" (R15.6): tell that player what happened. */
  private onSystemLine(e: ChatEntry): void {
    const me = this.client?.me?.name;
    if (e.from === null && me && e.text === `${me} ran out of time`) {
      this.env.toast('Time’s up: a card was picked for you', 'info');
    }
  }

  private onStatus(): void {
    const c = this.client;
    if (!c) return;
    if (c.status === 'open') {
      this.banner?.hide();
      this.welcomed = true;
      // Fresh chat history with every welcome (reconnects included).
      this.chat?.setEntries(c.chat);
      this.syncChatInput();
      return;
    }
    if (c.status === 'reconnecting') {
      if (!this.welcomed) {
        this.show(
          noticeScreen(
            'Can’t reach the room',
            'Still trying to connect…',
            [
              { label: 'Home', onClick: () => this.leave() },
              { label: 'Retry now', primary: true, onClick: () => c.retryNow() },
            ],
            { spinner: true },
          ),
        );
      } else {
        this.banner?.reconnecting(c.attempts);
      }
      this.syncChatInput();
      return;
    }
    if (c.status === 'closed' && c.fatal) {
      this.banner?.hide();
      this.play?.stop();
      const reload = c.fatal.code === 'version_mismatch' || c.fatal.code === 'replaced';
      this.show(
        noticeScreen('Disconnected', fatalText(c.fatal.code), [
          { label: 'Home', primary: !reload, onClick: () => this.env.goHome() },
          ...(reload
            ? [
                {
                  label: c.fatal.code === 'replaced' ? 'Play here instead' : 'Reload',
                  primary: true,
                  onClick: () => location.reload(),
                },
              ]
            : []),
        ]),
      );
    }
  }

  private range(): SeatRange {
    const r = this.env.engine.ruleset;
    return { min: r.minSeats, max: r.maxSeats };
  }

  private onRoom(room: RoomInfo): void {
    const c = this.client;
    if (!c || !this.chat) return;
    this.syncChatInput();
    const me = c.you?.member ?? null;
    if (room.phase === 'lobby') {
      if (this.play) {
        // Back in the lobby (rematch): the old table goes.
        this.play.dispose();
        this.play = null;
      }
      if (!this.lobby) {
        this.lobby = new LobbyScreen({
          roomId: this.roomId,
          inviteUrl: inviteUrl(this.env.href, this.roomId),
          range: this.range(),
          chat: this.chat.element,
          actions: {
            setName: (name) => {
              this.env.saveName(name);
              this.sendOrWarn(c.setName(name));
            },
            takeSeat: (seat) => this.sendOrWarn(c.takeSeat(seat)),
            leaveSeat: () => this.sendOrWarn(c.leaveSeat()),
            configure: (config) => this.sendOrWarn(c.configure(config)),
            start: () => this.sendOrWarn(c.startGame()),
            leave: () => this.leave(),
          },
        });
      } else {
        this.lobby.attachChat(this.chat.element);
      }
      this.lobby.update(room, me);
      this.show(this.lobby.element);
      return;
    }
    // playing / over
    if (!this.play) {
      this.play = new NetPlay({
        client: c,
        engine: this.env.engine,
        present: this.env.present,
        ...(this.env.fx ? { fx: this.env.fx } : {}),
        ...(this.env.every ? { every: this.env.every } : {}),
        onLeave: () => this.leave(),
        onSendFailed: () => this.sendOrWarn(false),
      });
      this.play.setChat(this.chat.element);
      this.play.start();
    }
    this.show(this.play.element);
  }

  private syncChatInput(): void {
    const c = this.client;
    if (!c || !this.chat) return;
    const open = c.status === 'open';
    const named = !!c.me?.name;
    this.chat.setEnabled(
      open && named,
      !open ? 'Not connected.' : named ? '' : 'Pick a nickname to chat.',
    );
    this.chat.setReactionsEnabled(open);
  }

  /** Swap the full-screen page. */
  private show(el: HTMLElement): void {
    if (this.screen === el) return;
    this.screen = el;
    this.screenBox.replaceChildren(el);
  }
}
