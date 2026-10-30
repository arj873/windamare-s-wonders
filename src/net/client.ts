/**
 * RoomClient: the browser side of the room protocol (docs/MULTIPLAYER.md, UX.md §17), without any
 * DOM. Opens the transport, says hello with the stored token, keeps the latest room / game / chat,
 * reconnects with exponential backoff, pings to keep the socket alive, and stops for good on the
 * fatal close codes (4000-4004). The UI subscribes to its events and sends through it; it never
 * opens a socket or parses a message.
 *
 * The client only stores what the server sent: never another seat's hand or pick.
 */
import type { DraftAction, DraftView, Json, Pick } from '../engine';
import {
  FATAL_BY_CLOSE,
  FATAL_ERRORS,
  LIMITS,
  PING,
  PONG,
  PROTOCOL_VERSION,
  parseServerMessage,
  type ChatEntry,
  type ClientMessage,
  type ErrorCode,
  type MemberInfo,
  type Reaction,
  type RoomConfig,
  type RoomInfo,
  type ServerMessage,
  type TimerInfo,
} from './protocol';
import {
  tokenKey,
  type Clock,
  type Connect,
  type KeyStore,
  type TimerHandle,
  type Transport,
} from './transport';

/**
 * connecting: first attempt, nothing received yet. open: welcomed. reconnecting: lost the
 * connection, retrying. closed: stopped (we left, or a fatal error; see `fatal`).
 */
export type ClientStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface GameSnapshot<S = unknown, T = unknown> {
  /** The engine's seq. */
  seq: number;
  /** Own hand, own pending pick, `view.submitted[]`; other seats masked by the server. */
  view: DraftView<S, T>;
  /** Own legal actions ([] when watching). */
  legal: DraftAction[];
  /** Seats the game waits for now (picks or a prompt answer). */
  waiting: number[];
  timer: TimerInfo | null;
  /** clock.now() when the message arrived (the timer counts down from here). */
  receivedAt: number;
}

export type ClientEvent<S = unknown, T = unknown> =
  | { type: 'status'; status: ClientStatus }
  | { type: 'room'; room: RoomInfo }
  | { type: 'game'; game: GameSnapshot<S, T>; prev: GameSnapshot<S, T> | null }
  /** The view's `lastReveal` changed (once per turn); derived here, not sent by the server. */
  | { type: 'reveal'; reveal: NonNullable<DraftView<S, T>['lastReveal']> }
  | { type: 'chat'; entry: ChatEntry }
  | { type: 'reaction'; member: string; seat: number | null; reaction: Reaction }
  | { type: 'error'; code: ErrorCode; message: string; ref?: string }
  | { type: 'fatal'; code: ErrorCode; message: string };

export interface Backoff {
  baseMs: number;
  maxMs: number;
  factor: number;
}

export interface RoomClientOptions {
  roomId: string;
  connect: Connect;
  clock: Clock;
  /** Reconnect tokens (`windamere.mp.token.<roomId>`). null = remember nothing. */
  store?: KeyStore | null;
  /** Nickname sent in hello. */
  name?: string;
  backoff?: Partial<Backoff>;
  /** 0..1, spreads reconnects of many clients (default: no jitter). */
  random?: () => number;
  /** Keep-alive ping interval (0 = off). */
  pingMs?: number;
  /** Nothing received for this long while open: assume the socket is dead and reconnect. */
  deadMs?: number;
}

export const DEFAULT_BACKOFF: Backoff = { baseMs: 500, maxMs: 15_000, factor: 2 };
export const PING_MS = 25_000;
export const DEAD_MS = 60_000;

/** Delay before reconnect attempt `attempt` (1-based), without jitter. */
export function backoffDelay(attempt: number, b: Backoff = DEFAULT_BACKOFF): number {
  return Math.min(b.maxMs, b.baseMs * b.factor ** Math.max(0, attempt - 1));
}

type Body = ClientMessage extends infer M
  ? M extends ClientMessage
    ? Omit<M, 'v'>
    : never
  : never;

export class RoomClient<S = unknown, T = unknown> {
  readonly roomId: string;
  private readonly opts: RoomClientOptions;
  private readonly backoff: Backoff;
  private readonly listeners = new Set<(e: ClientEvent<S, T>) => void>();

  private transport: Transport | null = null;
  /** Bumped per transport so callbacks of an old socket are ignored. */
  private generation = 0;
  private statusValue: ClientStatus = 'connecting';
  private started = false;
  private attempt = 0;
  private retryTimer: TimerHandle | null = null;
  private pingTimer: TimerHandle | null = null;
  private lastFrameAt = 0;
  private name: string | undefined;

  private youValue: { member: string; token: string } | null = null;
  private roomValue: RoomInfo | null = null;
  private gameValue: GameSnapshot<S, T> | null = null;
  private chatValue: ChatEntry[] = [];
  private fatalValue: { code: ErrorCode; message: string } | null = null;
  private fatalEmitted = false;

  constructor(opts: RoomClientOptions) {
    this.opts = opts;
    this.roomId = opts.roomId;
    this.backoff = { ...DEFAULT_BACKOFF, ...opts.backoff };
    this.name = opts.name;
  }

  // ---- state ---------------------------------------------------------------

  get status(): ClientStatus {
    return this.statusValue;
  }
  /** Reconnect attempts since the last welcome (0 while connected). */
  get attempts(): number {
    return this.attempt;
  }
  /** Why the client stopped for good (kicked, replaced, room gone, version mismatch...). */
  get fatal(): { code: ErrorCode; message: string } | null {
    return this.fatalValue;
  }
  get you(): { member: string; token: string } | null {
    return this.youValue;
  }
  get room(): RoomInfo | null {
    return this.roomValue;
  }
  get me(): MemberInfo | null {
    const id = this.youValue?.member;
    return this.roomValue?.members.find((m) => m.id === id) ?? null;
  }
  /** null = watching. */
  get mySeat(): number | null {
    return this.me?.seat ?? null;
  }
  get isHost(): boolean {
    return this.youValue !== null && this.roomValue?.host === this.youValue.member;
  }
  get game(): GameSnapshot<S, T> | null {
    return this.gameValue;
  }
  get chat(): readonly ChatEntry[] {
    return this.chatValue;
  }

  /** Turn clock left at `now` (clock.now() by default), or null without a timer. */
  timerLeftMs(now = this.opts.clock.now()): number | null {
    const g = this.gameValue;
    if (!g?.timer) return null;
    return Math.max(0, g.timer.remainingMs - (now - g.receivedAt));
  }

  on(cb: (e: ClientEvent<S, T>) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- lifecycle -----------------------------------------------------------

  start(): void {
    if (this.started) return;
    this.started = true;
    this.open();
  }

  /** Disconnect for good (no reconnect); the token is kept, so the page can rejoin. */
  close(): void {
    this.cancelRetry();
    this.stopPing();
    const t = this.transport;
    this.transport = null;
    this.generation++;
    t?.close();
    this.setStatus('closed');
  }

  /** Like `close()`, and forget the token (Leave room). */
  leave(): void {
    try {
      this.opts.store?.remove?.(tokenKey(this.roomId));
    } catch {
      /* storage unavailable */
    }
    this.close();
  }

  /** Skip the backoff wait (the banner's "Retry now", the browser coming back online). */
  retryNow(): void {
    if (this.statusValue !== 'reconnecting' || this.transport) return;
    this.cancelRetry();
    this.open();
  }

  // ---- sending (false = could not be sent) ----------------------------------

  /** Send a message; false when not connected (the UI says so). */
  send(body: Body): boolean {
    if (this.statusValue !== 'open' || !this.transport) return false;
    this.transport.send(JSON.stringify({ v: PROTOCOL_VERSION, ...body }));
    return true;
  }

  pick(pick: Pick): boolean {
    return this.send({ type: 'pick', pick });
  }
  unpick(): boolean {
    return this.send({ type: 'unpick' });
  }
  answer(prompt: number, answer: Json): boolean {
    return this.send({ type: 'answer', prompt, answer });
  }
  setName(name: string): boolean {
    this.name = name;
    return this.send({ type: 'setName', name });
  }
  takeSeat(seat: number): boolean {
    return this.send({ type: 'takeSeat', seat });
  }
  leaveSeat(): boolean {
    return this.send({ type: 'leaveSeat' });
  }
  configure(config: RoomConfig): boolean {
    return this.send({ type: 'configure', config });
  }
  kick(member: string): boolean {
    return this.send({ type: 'kick', member });
  }
  startGame(): boolean {
    return this.send({ type: 'start' });
  }
  rematch(): boolean {
    return this.send({ type: 'rematch' });
  }
  chatSend(text: string): boolean {
    const t = text.trim();
    if (t === '') return false;
    return this.send({ type: 'chat', text: t.slice(0, LIMITS.chat * 2) });
  }
  react(reaction: Reaction): boolean {
    return this.send({ type: 'react', reaction });
  }
  /** Ask for a fresh `room` + `game` (after a long tab sleep). */
  sync(): boolean {
    return this.send({ type: 'sync' });
  }

  // ---- transport -----------------------------------------------------------

  private open(): void {
    const gen = ++this.generation;
    const live = () => gen === this.generation;
    this.transport = this.opts.connect({
      onOpen: () => {
        if (!live()) return;
        this.lastFrameAt = this.opts.clock.now();
        const hello: Body = { type: 'hello', token: this.loadToken() };
        if (this.name) hello.name = this.name;
        this.transport?.send(JSON.stringify({ v: PROTOCOL_VERSION, ...hello }));
        this.startPing();
      },
      onMessage: (text) => {
        if (!live()) return;
        this.lastFrameAt = this.opts.clock.now();
        if (text === PONG) return;
        let msg: ServerMessage;
        try {
          msg = parseServerMessage(text);
        } catch {
          // Wrong protocol version, or not ours at all: a stale tab. Reload fixes it.
          this.fail('version_mismatch', 'the game was updated: reload the page');
          return;
        }
        this.handle(msg);
      },
      onClose: (code, reason) => {
        if (!live()) return;
        this.transport = null;
        this.stopPing();
        const fatal = FATAL_BY_CLOSE.get(code);
        if (fatal) {
          this.fail(fatal, this.fatalValue?.message ?? reason);
          return;
        }
        if (this.fatalValue || this.statusValue === 'closed') return;
        this.scheduleRetry();
      },
    });
  }

  private scheduleRetry(): void {
    this.attempt++;
    const base = backoffDelay(this.attempt, this.backoff);
    const jitter = this.opts.random ? 0.5 + this.opts.random() * 0.5 : 1;
    this.setStatus('reconnecting');
    this.cancelRetry();
    this.retryTimer = this.opts.clock.setTimeout(
      () => {
        this.retryTimer = null;
        this.open();
      },
      Math.round(base * jitter),
    );
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) this.opts.clock.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private startPing(): void {
    this.stopPing();
    const every = this.opts.pingMs ?? PING_MS;
    if (every <= 0) return;
    const dead = this.opts.deadMs ?? DEAD_MS;
    const beat = () => {
      this.pingTimer = this.opts.clock.setTimeout(beat, every);
      if (this.opts.clock.now() - this.lastFrameAt >= dead) {
        // Half-open socket: the browser has not noticed yet. Drop it and reconnect.
        const t = this.transport;
        this.transport = null;
        this.generation++;
        this.stopPing();
        t?.close();
        this.scheduleRetry();
        return;
      }
      this.transport?.send(PING);
    };
    this.pingTimer = this.opts.clock.setTimeout(beat, every);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) this.opts.clock.clearTimeout(this.pingTimer);
    this.pingTimer = null;
  }

  private fail(code: ErrorCode, message: string): void {
    this.fatalValue ??= { code, message };
    this.cancelRetry();
    this.stopPing();
    const t = this.transport;
    this.transport = null;
    this.generation++;
    t?.close();
    this.setStatus('closed');
    if (!this.fatalEmitted) {
      this.fatalEmitted = true;
      this.emit({ type: 'fatal', code: this.fatalValue.code, message: this.fatalValue.message });
    }
  }

  // ---- messages ------------------------------------------------------------

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.youValue = msg.you;
        this.saveToken(msg.you.token);
        this.chatValue = msg.chat.slice(-LIMITS.chatHistory);
        this.attempt = 0;
        this.setRoom(msg.room);
        this.setStatus('open');
        return;
      case 'room':
        this.setRoom(msg.room);
        return;
      case 'game': {
        const prev = this.gameValue;
        const game: GameSnapshot<S, T> = {
          seq: msg.seq,
          view: msg.view as DraftView<S, T>,
          legal: msg.legal,
          waiting: msg.waiting,
          timer: msg.timer,
          receivedAt: this.opts.clock.now(),
        };
        this.gameValue = game;
        this.emit({ type: 'game', game, prev });
        const reveal = game.view.lastReveal;
        const before = prev?.view.lastReveal;
        if (reveal && (!before || before.round !== reveal.round || before.turn !== reveal.turn)) {
          this.emit({ type: 'reveal', reveal });
        }
        return;
      }
      case 'chat':
        this.chatValue = [...this.chatValue, msg.entry].slice(-LIMITS.chatHistory);
        this.emit({ type: 'chat', entry: msg.entry });
        return;
      case 'reaction':
        this.emit({ type: 'reaction', member: msg.member, seat: msg.seat, reaction: msg.reaction });
        return;
      case 'error':
        this.emit({
          type: 'error',
          code: msg.code,
          message: msg.message,
          ...(msg.ref ? { ref: msg.ref } : {}),
        });
        // The socket closes right after; remember why so the close handler does not retry.
        if (FATAL_ERRORS.includes(msg.code))
          this.fatalValue ??= { code: msg.code, message: msg.message };
        return;
    }
  }

  private setRoom(room: RoomInfo): void {
    this.roomValue = room;
    // Back in the lobby (rematch): the old game is gone.
    if (room.phase === 'lobby') this.gameValue = null;
    this.emit({ type: 'room', room });
  }

  private setStatus(s: ClientStatus): void {
    if (s === this.statusValue) return;
    this.statusValue = s;
    this.emit({ type: 'status', status: s });
  }

  private emit(e: ClientEvent<S, T>): void {
    for (const cb of [...this.listeners]) cb(e);
  }

  private loadToken(): string | null {
    try {
      return this.opts.store?.get(tokenKey(this.roomId)) ?? null;
    } catch {
      return null;
    }
  }

  private saveToken(token: string): void {
    try {
      this.opts.store?.set(tokenKey(this.roomId), token);
    } catch {
      /* private mode: no reconnect after a reload, the session still works */
    }
  }
}
