/**
 * One room, transport-agnostic (docs/MULTIPLAYER.md). Sockets, storage and alarms belong to the
 * Durable Object adapter; this class takes events plus `now` and returns `Outbound[]`.
 *
 * Game-agnostic: the engine comes in through `DraftEngine`. Time only enters through `now`.
 * Hidden information: the full state, pending picks and tokens never leave this class except
 * through `engine.viewFor`, the owner's own `myPick`, and the owner's own `welcome`.
 */
import type { DraftEngine } from './engineApi';
import { Invalid } from './guard';
import {
  CLOSE,
  DEFAULT_ROOM_CONFIG,
  LIMITS,
  PROTOCOL_VERSION,
  RATE_LIMITS,
  cleanText,
  parseClientMessage,
  type ChatEntry,
  type ClientMessage,
  type ErrorCode,
  type MemberInfo,
  type RateKind,
  type RoomConfig,
  type RoomInfo,
  type RoomPhase,
  type SeatInfo,
  type ServerMessage,
  type TimerInfo,
} from './protocol';

export type ConnId = string;
export type Outbound =
  | { kind: 'send'; conn: ConnId; msg: ServerMessage }
  | { kind: 'close'; conn: ConnId; code: number; reason: string };

export interface SessionDeps {
  /** Unguessable, matching [A-Za-z0-9_-]{16,128}. */
  token(): string;
  seed(): string;
}
export interface SessionOptions {
  /** A disconnected seat keeps its place (and its clock) this long, then a bot plays it. */
  graceMs: number;
  /** Bots submit this long after a round opens. */
  botDelayMs: number;
  /** An empty room (nobody connected) expires after this long. */
  idleExpiryMs: number;
  /** Resolve as soon as every connected human and bot has picked; away seats get a default pick. */
  autoPickAway: boolean;
}
export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  graceMs: 60_000,
  botDelayMs: 900,
  idleExpiryMs: 24 * 3_600_000,
  autoPickAway: true,
};

interface Member {
  id: string;
  token: string;
  name: string | null;
  seat: number | null;
  conn: ConnId | null;
  joinedAt: number;
  lastSeen: number;
}
interface Seat {
  occupant: string | null;
  away: boolean;
  awayAt: number;
  /** Grace over: a bot plays until the owner returns. */
  bot: boolean;
}

export interface SessionSnapshot<S, P> {
  version: 1;
  roomId: string;
  phase: RoomPhase;
  config: RoomConfig;
  host: string;
  nextMember: number;
  nextChat: number;
  seq: number;
  members: Member[];
  seats: Seat[];
  chat: ChatEntry[];
  game: {
    state: S;
    pending: (P | null)[];
    roundStartedAt: number;
    deadline: number | null;
    pausedAt: number | null;
    timedOut: boolean[];
  } | null;
  emptySince: number | null;
}

class Bucket {
  constructor(
    private tokens: number,
    private at: number,
  ) {}
  take(kind: RateKind, now: number): boolean {
    const { burst, perSec } = RATE_LIMITS[kind];
    this.tokens = Math.min(burst, this.tokens + ((now - this.at) / 1000) * perSec);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class GameSession<S, V, P> {
  private phase: RoomPhase = 'lobby';
  private config: RoomConfig = { ...DEFAULT_ROOM_CONFIG };
  private host = '';
  private nextMember = 1;
  private nextChat = 1;
  private seq = 0;
  private members: Member[] = [];
  private seats: Seat[] = [];
  private chat: ChatEntry[] = [];
  private emptySince: number | null;

  // Game (phase playing/over). `pending` is SECRET.
  private state: S | null = null;
  private pending: (P | null)[] = [];
  private roundStartedAt = 0;
  private deadline: number | null = null;
  private pausedAt: number | null = null;
  private timedOut: boolean[] = [];

  // Not persisted.
  private conns = new Map<ConnId, string | null>();
  private buckets = new Map<string, Bucket>();
  private out: Outbound[] = [];
  private roomDirty = false;
  private gameDirty = false;

  private constructor(
    readonly roomId: string,
    private readonly engine: DraftEngine<S, V, P>,
    private readonly deps: SessionDeps,
    private readonly opts: SessionOptions,
    now: number,
  ) {
    this.emptySince = now;
    this.resizeSeats();
  }

  static create<S, V, P>(
    roomId: string,
    now: number,
    engine: DraftEngine<S, V, P>,
    deps: SessionDeps,
    opts: Partial<SessionOptions> = {},
  ): { session: GameSession<S, V, P>; hostToken: string } {
    const s = new GameSession(roomId, engine, deps, { ...DEFAULT_SESSION_OPTIONS, ...opts }, now);
    const host = s.addMember(now);
    s.host = host.id;
    return { session: s, hostToken: host.token };
  }

  static restore<S, V, P>(
    snap: SessionSnapshot<S, P>,
    engine: DraftEngine<S, V, P>,
    deps: SessionDeps,
    opts: Partial<SessionOptions> = {},
  ): GameSession<S, V, P> {
    if (snap.version !== 1) throw new Error(`unknown snapshot version ${String(snap.version)}`);
    const s = new GameSession(
      snap.roomId,
      engine,
      deps,
      { ...DEFAULT_SESSION_OPTIONS, ...opts },
      0,
    );
    s.phase = snap.phase;
    s.config = snap.config;
    s.host = snap.host;
    s.nextMember = snap.nextMember;
    s.nextChat = snap.nextChat;
    s.seq = snap.seq;
    s.members = snap.members.map((m) => ({ ...m, conn: null }));
    s.seats = snap.seats;
    s.chat = snap.chat;
    s.emptySince = snap.emptySince;
    if (snap.game) {
      s.state = snap.game.state;
      s.pending = snap.game.pending;
      s.roundStartedAt = snap.game.roundStartedAt;
      s.deadline = snap.game.deadline;
      s.pausedAt = snap.game.pausedAt;
      s.timedOut = snap.game.timedOut;
    }
    return s;
  }

  snapshot(): SessionSnapshot<S, P> {
    return structuredClone({
      version: 1 as const,
      roomId: this.roomId,
      phase: this.phase,
      config: this.config,
      host: this.host,
      nextMember: this.nextMember,
      nextChat: this.nextChat,
      seq: this.seq,
      members: this.members.map((m) => ({ ...m, conn: null })),
      seats: this.seats,
      chat: this.chat,
      game:
        this.state === null
          ? null
          : {
              state: this.state,
              pending: this.pending,
              roundStartedAt: this.roundStartedAt,
              deadline: this.deadline,
              pausedAt: this.pausedAt,
              timedOut: this.timedOut,
            },
      emptySince: this.emptySince,
    });
  }

  // ---- read-only (logs, tests) ---------------------------------------------

  get currentPhase(): RoomPhase {
    return this.phase;
  }
  get currentSeq(): number {
    return this.seq;
  }
  /** SECRET. Tests only. */
  get fullState(): S | null {
    return this.state;
  }

  // ---- events --------------------------------------------------------------

  open(conn: ConnId, _now: number): Outbound[] {
    this.conns.set(conn, null);
    return [];
  }

  close(conn: ConnId, now: number): Outbound[] {
    return this.run(now, () => this.detach(conn, now));
  }

  receive(conn: ConnId, raw: unknown, now: number): Outbound[] {
    return this.run(now, () => this.handle(conn, raw, now));
  }

  tick(now: number): Outbound[] {
    return this.run(now, () => undefined);
  }

  /** After a restore: forget members whose socket the runtime no longer has. */
  reconcile(live: readonly ConnId[], now: number): Outbound[] {
    return this.run(now, () => {
      const alive = new Set(live);
      for (const [c, mid] of this.conns) if (!alive.has(c) && mid) this.detach(c, now);
      for (const m of this.members) {
        if (m.conn === null) this.markAway(m, now);
      }
      if (this.connectedCount() === 0 && this.emptySince === null) this.emptySince = now;
    });
  }

  isExpired(now: number): boolean {
    return this.emptySince !== null && now - this.emptySince >= this.opts.idleExpiryMs;
  }

  /** Absolute ms of the next due tick, or null (storage.setAlarm / deleteAlarm). */
  nextWakeAt(): number | null {
    if (this.connectedCount() === 0) {
      return this.emptySince === null ? null : this.emptySince + this.opts.idleExpiryMs;
    }
    const due: number[] = [];
    if (this.phase === 'over') return null;
    if (this.phase === 'playing' && this.deadline !== null) due.push(this.deadline);
    if (
      this.phase === 'playing' &&
      this.seats.some((s, i) => this.isBot(s) && this.pending[i] === null)
    ) {
      due.push(this.roundStartedAt + this.opts.botDelayMs);
    }
    for (const s of this.seats) if (s.away && !s.bot) due.push(s.awayAt + this.opts.graceMs);
    return due.length ? Math.min(...due) : null;
  }

  // ---- plumbing ------------------------------------------------------------

  private run(now: number, fn: () => void): Outbound[] {
    this.out = [];
    this.roomDirty = false;
    this.gameDirty = false;
    fn();
    this.work(now);
    if (this.roomDirty) this.broadcastRoom();
    if (this.gameDirty) this.broadcastGame(now);
    const o = this.out;
    this.out = [];
    return o;
  }

  private send(conn: ConnId, msg: ServerMessage): void {
    this.out.push({ kind: 'send', conn, msg });
  }
  private error(conn: ConnId, code: ErrorCode, message: string, ref?: ClientMessage['type']): void {
    this.send(conn, { v: PROTOCOL_VERSION, type: 'error', code, message, ...(ref ? { ref } : {}) });
  }
  private connected(): Member[] {
    return this.members.filter((m) => m.conn !== null);
  }
  private connectedCount(): number {
    return this.connected().length;
  }
  private memberOf(conn: ConnId): Member | null {
    const id = this.conns.get(conn);
    return (id && this.members.find((m) => m.id === id)) || null;
  }
  private isBot(s: Seat): boolean {
    return s.occupant === null || s.bot;
  }

  private addMember(now: number): Member {
    const m: Member = {
      id: `m${this.nextMember++}`,
      token: this.deps.token(),
      name: null,
      seat: null,
      conn: null,
      joinedAt: now,
      lastSeen: now,
    };
    this.members.push(m);
    return m;
  }

  private resizeSeats(): void {
    while (this.seats.length < this.config.seatCount) {
      this.seats.push({ occupant: null, away: false, awayAt: 0, bot: false });
    }
    for (const s of this.seats.splice(this.config.seatCount)) {
      const m = this.members.find((x) => x.id === s.occupant);
      if (m) m.seat = null;
    }
  }

  private sys(text: string, now: number): void {
    this.pushChat({ id: this.nextChat++, at: now, from: null, name: '', text });
  }
  private pushChat(entry: ChatEntry): void {
    this.chat.push(entry);
    if (this.chat.length > LIMITS.chatHistory) this.chat.shift();
    for (const m of this.connected()) {
      this.send(m.conn as string, { v: PROTOCOL_VERSION, type: 'chat', entry });
    }
  }

  // ---- message handling ----------------------------------------------------

  private handle(conn: ConnId, raw: unknown, now: number): void {
    if (!this.conns.has(conn)) this.conns.set(conn, null);
    let msg: ClientMessage;
    try {
      if (typeof raw === 'string') {
        if (raw.length > LIMITS.messageChars) throw new Invalid('frame', 'too long');
        msg = parseClientMessage(JSON.parse(raw));
      } else {
        msg = parseClientMessage(raw);
      }
    } catch (e) {
      const mismatch = e instanceof Invalid && e.why === 'version_mismatch';
      if (mismatch) {
        this.error(conn, 'version_mismatch', 'reload the page');
        this.out.push({ kind: 'close', conn, code: CLOSE.versionMismatch, reason: 'version' });
      } else {
        this.error(conn, 'bad_message', e instanceof Invalid ? e.message : 'not JSON');
      }
      return;
    }
    if (msg.type === 'hello') return this.hello(conn, msg, now);
    const m = this.memberOf(conn);
    if (!m) return this.error(conn, 'not_joined', 'send hello first', msg.type);
    m.lastSeen = now;
    const kind: RateKind =
      msg.type === 'chat'
        ? 'chat'
        : msg.type === 'react'
          ? 'react'
          : msg.type === 'submit' || msg.type === 'withdraw'
            ? 'submit'
            : 'lobby';
    let b = this.buckets.get(`${m.id}:${kind}`);
    if (!b) {
      b = new Bucket(RATE_LIMITS[kind].burst, now);
      this.buckets.set(`${m.id}:${kind}`, b);
    }
    if (!b.take(kind, now)) return this.error(conn, 'rate_limited', 'slow down', msg.type);

    const need = (ok: boolean, code: ErrorCode, why: string) => {
      if (!ok) this.error(conn, code, why, msg.type);
      return ok;
    };
    switch (msg.type) {
      case 'setName':
        return this.setName(m, msg.name, now);
      case 'takeSeat': {
        if (!need(this.phase === 'lobby', 'wrong_phase', 'seats change in the lobby')) return;
        if (!need(m.name !== null, 'name_required', 'set a nickname first')) return;
        const s = this.seats[msg.seat];
        if (!need(s !== undefined, 'bad_seat', 'no such seat')) return;
        if (!need(s?.occupant === null || s?.occupant === m.id, 'seat_taken', 'seat is taken')) {
          return;
        }
        this.unseat(m);
        (s as Seat).occupant = m.id;
        m.seat = msg.seat;
        this.roomDirty = true;
        return;
      }
      case 'leaveSeat':
        if (!need(this.phase === 'lobby', 'wrong_phase', 'seats change in the lobby')) return;
        if (!need(m.seat !== null, 'not_seated', 'you have no seat')) return;
        this.unseat(m);
        this.roomDirty = true;
        return;
      case 'configure':
        if (!need(m.id === this.host, 'not_host', 'host only')) return;
        if (!need(this.phase === 'lobby', 'wrong_phase', 'configure in the lobby')) return;
        this.config = msg.config;
        this.resizeSeats();
        this.roomDirty = true;
        return;
      case 'kick': {
        if (!need(m.id === this.host, 'not_host', 'host only')) return;
        const t = this.members.find((x) => x.id === msg.member);
        if (!need(t !== undefined && t.id !== m.id, 'bad_message', 'no such member')) return;
        return this.kick(t as Member, now);
      }
      case 'start':
        if (!need(m.id === this.host, 'not_host', 'host only')) return;
        if (!need(this.phase === 'lobby', 'wrong_phase', 'already started')) return;
        if (
          !need(
            this.seats.some((s) => s.occupant !== null),
            'not_seated',
            'nobody is seated',
          )
        ) {
          return;
        }
        return this.start(now);
      case 'rematch':
        if (!need(m.id === this.host, 'not_host', 'host only')) return;
        if (!need(this.phase === 'over', 'wrong_phase', 'game is not over')) return;
        return this.rematch(now);
      case 'submit':
        return this.submit(conn, m, msg.round, msg.pick, now);
      case 'withdraw': {
        if (!need(this.phase === 'playing', 'wrong_phase', 'no round open')) return;
        if (!need(m.seat !== null, 'not_seated', 'you have no seat')) return;
        if (!need(msg.round === this.round(), 'stale_round', 'that round is over')) return;
        const i = m.seat as number;
        if (this.pending[i] !== null) {
          this.pending[i] = null;
          this.touch();
        }
        this.send(conn, { v: PROTOCOL_VERSION, type: 'ack', ref: 'withdraw', round: msg.round });
        return;
      }
      case 'chat': {
        if (!need(m.name !== null, 'name_required', 'set a nickname first')) return;
        const text = cleanText(msg.text, LIMITS.chat);
        if (text) {
          this.pushChat({ id: this.nextChat++, at: now, from: m.id, name: m.name as string, text });
        }
        return;
      }
      case 'react':
        for (const o of this.connected()) {
          this.send(o.conn as string, {
            v: PROTOCOL_VERSION,
            type: 'reaction',
            member: m.id,
            seat: m.seat,
            reaction: msg.reaction,
          });
        }
        return;
      case 'sync':
        this.roomDirty = true;
        this.gameDirty = true;
        return;
    }
  }

  private hello(conn: ConnId, msg: Extract<ClientMessage, { type: 'hello' }>, now: number): void {
    if (this.isExpired(now)) {
      this.error(conn, 'room_expired', 'this room is gone', 'hello');
      this.out.push({ kind: 'close', conn, code: CLOSE.expired, reason: 'expired' });
      return;
    }
    let m = msg.token ? this.members.find((x) => x.token === msg.token) : undefined;
    let fresh = false;
    if (!m) {
      if (this.members.length >= LIMITS.members) {
        // Forget the longest-gone member without a seat to make room.
        const gone = this.members
          .filter((x) => x.conn === null && x.seat === null && x.id !== this.host)
          .sort((a, b) => a.lastSeen - b.lastSeen)[0];
        if (!gone) {
          this.error(conn, 'room_full', 'room is full', 'hello');
          this.out.push({ kind: 'close', conn, code: CLOSE.roomFull, reason: 'full' });
          return;
        }
        this.members.splice(this.members.indexOf(gone), 1);
      }
      m = this.addMember(now);
      fresh = true;
    }
    if (m.conn !== null && m.conn !== conn) {
      this.error(m.conn, 'replaced', 'opened in another tab');
      this.out.push({ kind: 'close', conn: m.conn, code: CLOSE.replaced, reason: 'replaced' });
      this.conns.delete(m.conn);
    }
    this.conns.set(conn, m.id);
    m.conn = conn;
    m.lastSeen = now;
    this.emptySince = null;
    if (this.pausedAt !== null) {
      // Nobody was here: the round clock stood still.
      const d = now - this.pausedAt;
      this.roundStartedAt += d;
      if (this.deadline !== null) this.deadline += d;
      this.pausedAt = null;
    }
    const name = msg.name === undefined ? null : cleanText(msg.name, LIMITS.name);
    if (name && m.name === null) this.setName(m, name, now);
    const seat = m.seat === null ? undefined : this.seats[m.seat];
    if (seat?.occupant === m.id && (seat.away || seat.bot)) {
      if (seat.bot) this.sys(`${m.name ?? 'Someone'} is back and took over their seat`, now);
      seat.away = false;
      seat.bot = false;
      this.touch();
    }
    if (fresh && m.name) this.sys(`${m.name} joined`, now);
    this.send(conn, {
      v: PROTOCOL_VERSION,
      type: 'welcome',
      you: { member: m.id, token: m.token },
      room: this.roomInfo(),
      chat: this.chat,
    });
    this.roomDirty = true;
    this.gameDirty = true;
  }

  private setName(m: Member, raw: string, now: number): void {
    const base = cleanText(raw, LIMITS.name);
    if (!base) return this.error(m.conn as string, 'name_required', 'empty name', 'setName');
    let name = base;
    for (
      let n = 2;
      this.members.some((x) => x !== m && x.name?.toLowerCase() === name.toLowerCase());
      n++
    ) {
      name = `${[...base].slice(0, LIMITS.name - 2).join('')} ${n}`;
    }
    const first = m.name === null;
    m.name = name;
    this.roomDirty = true;
    if (first && this.phase === 'lobby' && m.seat === null) {
      // Auto-seat in the first open seat so the host lands in seat 1.
      const i = this.seats.findIndex((s) => s.occupant === null);
      if (i >= 0) {
        (this.seats[i] as Seat).occupant = m.id;
        m.seat = i;
      }
    }
    void now;
  }

  private unseat(m: Member): void {
    if (m.seat === null) return;
    const s = this.seats[m.seat];
    if (s && s.occupant === m.id) {
      s.occupant = null;
      s.away = false;
      s.bot = false;
    }
    m.seat = null;
  }

  private kick(t: Member, now: number): void {
    if (t.conn) {
      this.error(t.conn, 'kicked', 'removed by the host');
      this.out.push({ kind: 'close', conn: t.conn, code: CLOSE.kicked, reason: 'kicked' });
      this.conns.delete(t.conn);
      t.conn = null;
    }
    const s = t.seat === null ? undefined : this.seats[t.seat];
    if (this.phase === 'lobby') this.unseat(t);
    else if (s) {
      s.bot = true; // their seat goes to a bot for good
      s.away = false;
    }
    this.members.splice(this.members.indexOf(t), 1);
    this.sys(`${t.name ?? t.id} was removed`, now);
    this.roomDirty = true;
    this.touch();
  }

  private detach(conn: ConnId, now: number): void {
    const m = this.memberOf(conn);
    this.conns.delete(conn);
    if (!m || m.conn !== conn) return;
    m.conn = null;
    m.lastSeen = now;
    this.markAway(m, now);
    if (this.connectedCount() === 0) {
      this.emptySince = now;
      if (this.phase === 'playing') this.pausedAt = now;
    }
    this.roomDirty = true;
  }

  private markAway(m: Member, now: number): void {
    if (m.seat === null) return;
    const s = this.seats[m.seat];
    if (!s || s.occupant !== m.id) return;
    if (!s.away && !s.bot) {
      s.away = true;
      s.awayAt = now;
      this.touch();
    }
  }

  // ---- game ----------------------------------------------------------------

  private round(): number {
    return this.state === null ? 0 : this.engine.round(this.state);
  }
  private touch(): void {
    this.seq++;
    this.gameDirty = true;
    this.roomDirty = true;
  }

  private start(now: number): void {
    const names = this.seats.map((s, i) => {
      const m = this.members.find((x) => x.id === s.occupant);
      return m?.name ?? `Bot ${i + 1}`;
    });
    this.state = this.engine.create(names, this.deps.seed());
    for (const s of this.seats) {
      s.away = false;
      s.bot = false;
    }
    this.phase = 'playing';
    this.beginRound(now);
    this.sys('The game has started', now);
    this.touch();
  }

  private beginRound(now: number): void {
    this.pending = this.seats.map(() => null);
    this.timedOut = this.seats.map(() => false);
    this.roundStartedAt = now;
    this.deadline =
      this.config.roundTimerSec === null ? null : now + this.config.roundTimerSec * 1000;
    this.pausedAt = this.connectedCount() === 0 ? now : null;
  }

  private rematch(now: number): void {
    this.phase = 'lobby';
    this.state = null;
    this.pending = [];
    for (const m of this.members) {
      // Members gone past the grace period lose their seat.
      if (m.conn === null && m.seat !== null && now - m.lastSeen >= this.opts.graceMs)
        this.unseat(m);
    }
    for (const s of this.seats) {
      s.away = false;
      s.bot = false;
    }
    this.sys('Back to the lobby', now);
    this.touch();
  }

  private submit(conn: ConnId, m: Member, round: number, raw: unknown, _now: number): void {
    const fail = (code: ErrorCode, why: string) => this.error(conn, code, why, 'submit');
    if (this.phase !== 'playing' || this.state === null)
      return fail('wrong_phase', 'no round open');
    if (m.seat === null) return fail('not_seated', 'you have no seat');
    if (round !== this.round()) return fail('stale_round', 'that round is over');
    let pick: P;
    try {
      pick = this.engine.parsePick(raw);
    } catch {
      return fail('bad_message', 'malformed pick');
    }
    if (!this.engine.isLegal(this.state, m.seat, pick)) return fail('illegal_pick', 'not allowed');
    this.pending[m.seat] = pick;
    this.send(conn, { v: PROTOCOL_VERSION, type: 'ack', ref: 'submit', round });
    this.touch();
  }

  /** All due work, in order; loops because one step (a resolve) can make the next due. */
  private work(now: number): void {
    for (let guard = 0; guard < 1000; guard++) {
      // Grace over -> bot.
      for (const s of this.seats) {
        if (s.away && !s.bot && now - s.awayAt >= this.opts.graceMs) {
          if (this.phase === 'lobby') {
            const lm = this.members.find((x) => x.id === s.occupant);
            if (lm) this.unseat(lm);
            this.roomDirty = true;
            continue;
          }
          s.bot = true;
          s.away = false;
          const m = this.members.find((x) => x.id === s.occupant);
          this.sys(`${m?.name ?? 'A player'} is away; a bot plays until they return`, now);
          this.touch();
        }
      }
      if (this.phase !== 'playing' || this.state === null) return;
      if (this.connectedCount() === 0) return; // paused
      const st = this.state;
      let changed = false;

      if (now >= this.roundStartedAt + this.opts.botDelayMs) {
        this.seats.forEach((s, i) => {
          if (this.isBot(s) && this.pending[i] === null) {
            this.pending[i] = this.engine.botPick(this.engine.viewFor(st, i), i);
            changed = true;
          }
        });
      }
      if (this.deadline !== null && now >= this.deadline) {
        this.seats.forEach((s, i) => {
          if (this.pending[i] === null) this.autoPick(s, i, st, now);
        });
        changed = true;
      } else if (this.opts.autoPickAway) {
        const humansIn = this.seats.every((s, i) => s.away || this.pending[i] !== null);
        if (humansIn) {
          this.seats.forEach((s, i) => {
            if (s.away && this.pending[i] === null) {
              this.autoPick(s, i, st, now);
              changed = true;
            }
          });
        }
      }
      if (changed) this.touch();

      if (this.pending.some((p) => p === null)) return;
      this.state = this.engine.resolveRound(st, this.pending as P[]);
      if (this.engine.isOver(this.state)) {
        this.phase = 'over';
        this.sys('The game is over', now);
        this.touch();
        return;
      }
      this.beginRound(now);
      this.touch();
    }
  }

  private autoPick(s: Seat, i: number, st: S, now: number): void {
    this.pending[i] = this.engine.defaultPick(st, i);
    if (!this.isBot(s) && !this.timedOut[i]) {
      this.timedOut[i] = true;
      const m = this.members.find((x) => x.id === s.occupant);
      this.sys(`${m?.name ?? 'A player'} ran out of time`, now);
    }
  }

  // ---- outbound views ------------------------------------------------------

  private roomInfo(): RoomInfo {
    const seats: SeatInfo[] = this.seats.map((s) => ({
      occupant: s.occupant,
      status:
        this.phase === 'lobby'
          ? s.occupant
            ? 'human'
            : 'bot'
          : s.bot || !s.occupant
            ? 'bot'
            : s.away
              ? 'away'
              : 'human',
    }));
    const members: MemberInfo[] = this.members.map((m) => ({
      id: m.id,
      name: m.name,
      seat: m.seat,
      connected: m.conn !== null,
    }));
    return {
      id: this.roomId,
      phase: this.phase,
      host: this.host,
      config: this.config,
      seats,
      members,
    };
  }

  private broadcastRoom(): void {
    const room = this.roomInfo();
    for (const m of this.connected()) {
      this.send(m.conn as string, { v: PROTOCOL_VERSION, type: 'room', room });
    }
  }

  private timerFor(now: number): TimerInfo | null {
    if (this.phase !== 'playing' || this.deadline === null || this.config.roundTimerSec === null)
      return null;
    return {
      remainingMs: Math.max(0, this.deadline - now),
      totalMs: this.config.roundTimerSec * 1000,
    };
  }

  /** One `game` message per connected member: their own view, legal picks and pending pick. */
  private broadcastGame(now: number): void {
    const st = this.state;
    if (st === null) return;
    const submitted = this.pending.map((p) => p !== null);
    for (const m of this.connected()) {
      const seat = this.phase === 'lobby' ? null : m.seat;
      this.send(m.conn as string, {
        v: PROTOCOL_VERSION,
        type: 'game',
        seq: this.seq,
        round: this.round(),
        view: this.engine.viewFor(st, seat ?? 'spectator'),
        legal: seat !== null && this.phase === 'playing' ? this.engine.legalPicks(st, seat) : [],
        submitted,
        myPick: seat === null ? null : (this.pending[seat] ?? null),
        timer: this.timerFor(now),
      });
    }
  }
}
