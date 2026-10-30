/**
 * One room, transport-agnostic (docs/MULTIPLAYER.md). Sockets, storage and alarms belong to the
 * Durable Object adapter; this class takes events plus `now` and returns `Outbound[]`.
 *
 * Game-agnostic: the engine comes in through `DraftEngine`. Time only enters through `now`.
 * Hidden information: the full state, pending picks and tokens never leave this class except
 * through `engine.viewFor`, the owner's own `myPick`, and the owner's own `welcome`.
 */
import type { DraftAction, DraftEngine, DraftState } from '../engine';
import { pickFor } from '../bots';
import { Invalid } from './guard';
import {
  CLOSE,
  DEFAULT_ROOM_CONFIG,
  LIMITS,
  PROTOCOL_VERSION,
  RATE_LIMITS,
  SEAT_COLOURS,
  clockMs,
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
  type BotLevel,
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
  /** Bots act this long after a stage (turn, prompt) opens. */
  botDelayMs: number;
  /** Added to the first pick clock of each Season (the Season card's time). */
  openingBonusMs: number;
  /** An empty room (nobody connected) expires after this long. */
  idleExpiryMs: number;
  /** R15.5: once every seat that is here has acted, away seats get this long, then a timeout pick. */
  awayWaitMs: number;
}
export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  graceMs: 60_000,
  botDelayMs: 900,
  openingBonusMs: 0, // the server sets it (SERVER_LIMITS)
  idleExpiryMs: 24 * 3_600_000,
  awayWaitMs: 15_000,
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

export interface SessionSnapshot<S, T> {
  version: 1;
  roomId: string;
  phase: RoomPhase;
  config: RoomConfig;
  host: string;
  nextMember: number;
  nextChat: number;
  members: Member[];
  seats: Seat[];
  chat: ChatEntry[];
  game: {
    state: DraftState<S, T>;
    stageKey: string;
    stageStartedAt: number;
    deadline: number | null;
    stageTotalMs: number | null;
    awayWaitFrom: number | null;
    pausedAt: number | null;
    timedOut: boolean[];
  } | null;
  emptySince: number | null;
}

/** Numeric salt for the bots' decision RNG, from the game's seed. */
function saltOf(seed: number | string): number {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
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

export class GameSession<S, T> {
  private phase: RoomPhase = 'lobby';
  private config: RoomConfig = { ...DEFAULT_ROOM_CONFIG };
  private host = '';
  private nextMember = 1;
  private nextChat = 1;
  private members: Member[] = [];
  private seats: Seat[] = [];
  private chat: ChatEntry[] = [];
  private emptySince: number | null;

  // Game (phase playing/over). `pending` is SECRET.
  private state: DraftState<S, T> | null = null;
  private stageKey = '';
  private stageStartedAt = 0;
  private deadline: number | null = null;
  private stageTotalMs: number | null = null;
  private awayWaitFrom: number | null = null;
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
    private readonly engine: DraftEngine<S, T>,
    private readonly deps: SessionDeps,
    private readonly opts: SessionOptions,
    now: number,
  ) {
    this.emptySince = now;
    const { minSeats, maxSeats } = engine.ruleset;
    this.config.seatCount = Math.min(maxSeats, Math.max(minSeats, this.config.seatCount));
    this.resizeSeats();
  }

  static create<S, T>(
    roomId: string,
    now: number,
    engine: DraftEngine<S, T>,
    deps: SessionDeps,
    opts: Partial<SessionOptions> = {},
  ): { session: GameSession<S, T>; hostToken: string } {
    const s = new GameSession(roomId, engine, deps, { ...DEFAULT_SESSION_OPTIONS, ...opts }, now);
    const host = s.addMember(now);
    s.host = host.id;
    return { session: s, hostToken: host.token };
  }

  static restore<S, T>(
    snap: SessionSnapshot<S, T>,
    engine: DraftEngine<S, T>,
    deps: SessionDeps,
    opts: Partial<SessionOptions> = {},
  ): GameSession<S, T> {
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
    // Sockets survive a Durable Object hibernation; `reconcile` drops the ones that did not.
    s.members = snap.members.map((m) => ({ ...m }));
    for (const m of s.members) if (m.conn !== null) s.conns.set(m.conn, m.id);
    s.seats = snap.seats;
    s.chat = snap.chat;
    s.emptySince = snap.emptySince;
    if (snap.game) {
      s.state = snap.game.state;
      s.stageKey = snap.game.stageKey;
      s.stageStartedAt = snap.game.stageStartedAt;
      s.deadline = snap.game.deadline;
      s.stageTotalMs = snap.game.stageTotalMs;
      s.awayWaitFrom = snap.game.awayWaitFrom;
      s.pausedAt = snap.game.pausedAt;
      s.timedOut = snap.game.timedOut;
    }
    return s;
  }

  snapshot(): SessionSnapshot<S, T> {
    return structuredClone({
      version: 1 as const,
      roomId: this.roomId,
      phase: this.phase,
      config: this.config,
      host: this.host,
      nextMember: this.nextMember,
      nextChat: this.nextChat,
      members: this.members,
      seats: this.seats,
      chat: this.chat,
      game:
        this.state === null
          ? null
          : {
              state: this.state,
              stageKey: this.stageKey,
              stageStartedAt: this.stageStartedAt,
              deadline: this.deadline,
              stageTotalMs: this.stageTotalMs,
              awayWaitFrom: this.awayWaitFrom,
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
  /** SECRET. Tests only. */
  get fullState(): DraftState<S, T> | null {
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
    if (this.phase === 'playing' && this.deadline !== null) due.push(this.deadline);
    if (this.phase === 'playing' && this.awayWaitFrom !== null) {
      due.push(this.awayWaitFrom + this.opts.awayWaitMs);
    }
    if (this.phase === 'playing' && this.state !== null) {
      const st = this.state;
      if (this.engine.waitingOn(st).some((i) => this.isBot(this.seatAt(i)))) {
        due.push(this.stageStartedAt + this.opts.botDelayMs);
      }
    }
    if (this.phase !== 'over') {
      for (const s of this.seats) if (s.away && !s.bot) due.push(s.awayAt + this.opts.graceMs);
    }
    const host = this.members.find((x) => x.id === this.host);
    if (host && host.conn === null) due.push(host.lastSeen + this.opts.graceMs);
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

  private bucket(key: string, kind: RateKind, now = 0): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = new Bucket(RATE_LIMITS[kind].burst, now);
      this.buckets.set(key, b);
    }
    return b;
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

  private botLevel(i: number): BotLevel {
    return this.config.botLevels?.[i] ?? 'easy';
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
          : msg.type === 'pick' || msg.type === 'unpick' || msg.type === 'answer'
            ? 'pick'
            : 'lobby';
    if (!this.bucket(`${m.id}:${kind}`, kind, now).take(kind, now))
      return this.error(conn, 'rate_limited', 'slow down', msg.type);

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
        if (
          !need(
            msg.config.seatCount >= this.engine.ruleset.minSeats &&
              msg.config.seatCount <= this.engine.ruleset.maxSeats,
            'bad_config',
            `this game seats ${this.engine.ruleset.minSeats} to ${this.engine.ruleset.maxSeats}`,
          )
        ) {
          return;
        }
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
        return this.start(conn, now);
      case 'rematch':
        if (!need(m.id === this.host, 'not_host', 'host only')) return;
        if (!need(this.phase === 'over', 'wrong_phase', 'game is not over')) return;
        return this.rematch(now);
      case 'pick':
        return this.act(conn, m, (seat) => ({ type: 'pick', seat, pick: msg.pick }), msg.type, now);
      case 'unpick':
        return this.act(conn, m, (seat) => ({ type: 'unpick', seat }), msg.type, now);
      case 'answer':
        return this.act(
          conn,
          m,
          (seat) => ({ type: 'answer', seat, prompt: msg.prompt, answer: msg.answer }),
          msg.type,
          now,
        );
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
    // One member per connection: a second hello may only repeat the first one's token.
    const boundId = this.conns.get(conn);
    if (boundId) {
      const cur = this.members.find((x) => x.id === boundId);
      if (!cur || msg.token !== cur.token) {
        return this.error(conn, 'bad_message', 'already joined on this connection', 'hello');
      }
    }
    if (!this.bucket(`${conn}:hello`, 'lobby').take('lobby', now)) {
      return this.error(conn, 'rate_limited', 'slow down', 'hello');
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
      this.stageStartedAt += d;
      if (this.deadline !== null) this.deadline += d;
      if (this.awayWaitFrom !== null) this.awayWaitFrom += d;
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
      room: this.room(),
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
    this.conns.delete(conn);
    this.buckets.delete(`${conn}:hello`);
    for (const m of this.members.filter((x) => x.conn === conn)) {
      m.conn = null;
      m.lastSeen = now;
      this.markAway(m, now);
    }
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

  private seatAt(i: number): Seat {
    return this.seats[i] as Seat;
  }
  private touch(): void {
    this.gameDirty = true;
    this.roomDirty = true;
  }

  private start(conn: ConnId, now: number): void {
    const names = this.seats.map((s, i) => {
      const m = this.members.find((x) => x.id === s.occupant);
      return m?.name ?? `Bot ${i + 1}`;
    });
    const config = {
      seed: this.deps.seed(),
      seats: names.map((name) => ({ name })),
      ...(this.config.options ? { options: this.config.options } : {}),
    };
    const bad = this.engine.validateConfig(config);
    if (bad !== null) return this.error(conn, 'bad_config', bad, 'start');
    try {
      this.state = this.engine.createGame(config);
    } catch (e) {
      return this.error(
        conn,
        'bad_config',
        e instanceof Error ? e.message : 'cannot start',
        'start',
      );
    }
    for (const s of this.seats) {
      s.away = false;
      s.bot = false;
    }
    this.phase = 'playing';
    this.stageKey = '';
    this.pausedAt = null;
    this.sys('The game has started', now);
    this.touch();
  }

  private rematch(now: number): void {
    this.phase = 'lobby';
    this.state = null;
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

  /** Host away for the grace period (or gone): the longest-present connected member takes over. */
  private passHost(now: number): void {
    const host = this.members.find((x) => x.id === this.host);
    if (host && (host.conn !== null || now - host.lastSeen < this.opts.graceMs)) return;
    const next = this.connected()
      .filter((x) => x.id !== this.host)
      .sort(
        (a, b) => Number(b.seat !== null) - Number(a.seat !== null) || a.joinedAt - b.joinedAt,
      )[0];
    if (!next) return;
    this.host = next.id;
    this.sys(`${next.name ?? 'Someone'} is now the host`, now);
    this.roomDirty = true;
  }

  /** A seat's action from a client message: engine-validated, then the engine does the rest. */
  private act(
    conn: ConnId,
    m: Member,
    build: (seat: number) => DraftAction,
    ref: ClientMessage['type'],
    _now: number,
  ): void {
    if (this.phase !== 'playing' || this.state === null) {
      return this.error(conn, 'wrong_phase', 'no game is running', ref);
    }
    if (m.seat === null) return this.error(conn, 'not_seated', 'you have no seat', ref);
    let r;
    try {
      r = this.engine.applyAction(this.state, build(m.seat));
    } catch {
      return this.error(conn, 'illegal_action', 'the game refused that action', ref);
    }
    if (!r.ok) return this.error(conn, 'illegal_action', r.error, ref);
    this.state = r.state;
    this.touch();
  }

  /** New engine stage (turn, prompt, round) -> fresh clock and "ran out of time" flags. */
  private syncStage(st: DraftState<S, T>, now: number): void {
    // A prompt group (engine C3) is one stage: its seats answer together.
    const head = st.prompts[0] as { id: number; group?: number } | undefined;
    const key = `${st.round}:${st.turn}:${st.phase.kind}:${head?.group ?? head?.id ?? ''}`;
    if (key === this.stageKey) return;
    this.stageKey = key;
    this.stageStartedAt = now;
    this.awayWaitFrom = null;
    this.timedOut = this.seats.map(() => false);
    const base = clockMs(
      this.config.timer,
      st.phase.kind === 'prompt' ? 'prompt' : 'pick',
      st.turn,
    );
    // The Season card opens over the first pick of a Season and closes itself after
    // `openingBonusMs`; that reading time is not the players' (research R7 net #1).
    const bonus = st.turn === 0 && st.phase.kind === 'pick' ? this.opts.openingBonusMs : 0;
    this.stageTotalMs = base === null ? null : base + bonus;
    this.deadline = this.stageTotalMs === null ? null : now + this.stageTotalMs;
    this.gameDirty = true; // the timer changed
  }

  /** All due work, in order; loops because one step (a resolve) can make the next due. */
  private work(now: number): void {
    this.passHost(now);
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
      if (this.state.phase.kind === 'gameOver') {
        this.phase = 'over';
        this.sys('The game is over', now);
        this.touch();
        return;
      }
      if (this.connectedCount() === 0) return; // paused
      this.syncStage(this.state, now);
      const st = this.state;
      const waiting = this.engine.waitingOn(st);
      const due: number[] = [];
      if (now >= this.stageStartedAt + this.opts.botDelayMs) {
        due.push(...waiting.filter((i) => this.isBot(this.seatAt(i))));
      }
      // R15.5: everyone who is here has acted -> the away seats get a short wait, never past the clock.
      const onlyAway = waiting.length > 0 && waiting.every((i) => this.seatAt(i).away);
      if (!onlyAway) this.awayWaitFrom = null;
      else this.awayWaitFrom ??= now;
      if (this.deadline !== null && now >= this.deadline) {
        due.push(...waiting);
      } else if (this.awayWaitFrom !== null && now >= this.awayWaitFrom + this.opts.awayWaitMs) {
        due.push(...waiting);
      }
      let next = st;
      let acted = false;
      for (const i of new Set(due)) {
        // Bots and timeouts answer from the seat's own view, like a client would.
        const v = this.engine.viewFor(st, i);
        // Bots play at their seat's level; R15.6: a timeout pick is always the Easy bot's.
        const level = this.isBot(this.seatAt(i)) ? this.botLevel(i) : 'easy';
        const a =
          pickFor(this.engine, v, i, { level, salt: saltOf(st.config.seed) }) ??
          this.engine.defaultAction(v, i);
        if (a === null) continue;
        const r = this.engine.applyAction(next, a);
        if (!r.ok) throw new Error(`default action refused for seat ${i}: ${r.error}`);
        next = r.state;
        acted = true;
        const seat = this.seatAt(i);
        if (!this.isBot(seat) && !this.timedOut[i]) {
          this.timedOut[i] = true;
          const mm = this.members.find((x) => x.id === seat.occupant);
          this.sys(`${mm?.name ?? 'A player'} ran out of time`, now);
        }
      }
      if (!acted) return;
      this.state = next;
      this.touch();
    }
  }

  // ---- outbound views ------------------------------------------------------

  /** Chosen colours first; seats without one get the lowest unused slots, so all differ. */
  private seatColours(): number[] {
    const chosen = this.config.colours ?? [];
    const free = Array.from({ length: SEAT_COLOURS }, (_, c) => c).filter(
      (c) => !chosen.includes(c),
    );
    return this.seats.map((_, i) => chosen[i] ?? (free.shift() as number));
  }

  room(): RoomInfo {
    const colours = this.seatColours();
    const seats: SeatInfo[] = this.seats.map((s, i) => ({
      occupant: s.occupant,
      botLevel: this.botLevel(i),
      colour: colours[i] as number,
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
    const room = this.room();
    for (const m of this.connected()) {
      this.send(m.conn as string, { v: PROTOCOL_VERSION, type: 'room', room });
    }
  }

  private timerFor(now: number): TimerInfo | null {
    if (this.phase !== 'playing' || this.deadline === null || this.stageTotalMs === null) {
      return null;
    }
    return { remainingMs: Math.max(0, this.deadline - now), totalMs: this.stageTotalMs };
  }

  /** One `game` message per connected member: their own view and legal actions. */
  private broadcastGame(now: number): void {
    const st = this.state;
    if (st === null) return;
    for (const m of this.connected()) {
      const seat = m.seat;
      this.send(m.conn as string, {
        v: PROTOCOL_VERSION,
        type: 'game',
        seq: st.seq,
        view: this.engine.viewFor(st, seat ?? 'spectator'),
        legal: seat === null ? [] : this.engine.legalActions(st, seat),
        waiting: this.engine.waitingOn(st),
        timer: this.timerFor(now),
      });
    }
  }
}
