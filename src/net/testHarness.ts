/**
 * In-memory transport + a toy drafting engine for session tests (and for the client to test against
 * without a server). The toy engine is NOT the real game: it only has the same shape of secrets
 * (hidden hands that rotate, simultaneous picks).
 */
import type { DraftEngine, Viewer } from './engineApi';
import { Invalid } from './guard';
import type { ClientMessage, ServerMessage, ServerMessageType } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import type { ConnId, GameSession, Outbound, SessionDeps } from './session';

type Body = ClientMessage extends infer M
  ? M extends ClientMessage
    ? Omit<M, 'v'>
    : never
  : never;

export function fakeDeps(prefix = 't'): SessionDeps {
  let tokens = 0;
  let seeds = 0;
  return {
    token: () => `${prefix}${String(++tokens).padStart(20, '0')}`,
    seed: () => `seed-${++seeds}`,
  };
}

// ---- toy engine ------------------------------------------------------------

export interface ToyState {
  names: string[];
  round: number;
  hands: number[][];
  tableau: number[][];
}
export interface ToyView {
  viewer: Viewer;
  round: number;
  names: string[];
  hand: number[];
  handCounts: number[];
  tableau: number[][];
}
export const TOY_ROUNDS = 3;
export const TOY_HAND = TOY_ROUNDS;

/** Card ids are unique per game (seat*100 + n) so leak tests can search the wire for them. */
export const toyEngine: DraftEngine<ToyState, ToyView, number> = {
  create(names) {
    return {
      names: [...names],
      round: 1,
      hands: names.map((_, s) => Array.from({ length: TOY_HAND }, (_, n) => s * 100 + n + 1)),
      tableau: names.map(() => []),
    };
  },
  round: (s) => s.round,
  isOver: (s) => s.round > TOY_ROUNDS,
  viewFor(s, viewer) {
    return {
      viewer,
      round: s.round,
      names: s.names,
      hand: viewer === 'spectator' ? [] : [...(s.hands[viewer] ?? [])],
      handCounts: s.hands.map((h) => h.length),
      tableau: s.tableau,
    };
  },
  legalPicks: (s, seat) => [...(s.hands[seat] ?? [])],
  parsePick(raw) {
    if (typeof raw !== 'number' || !Number.isInteger(raw)) throw new Invalid('pick', 'number');
    return raw;
  },
  isLegal: (s, seat, pick) => (s.hands[seat] ?? []).includes(pick),
  defaultPick: (s, seat) => (s.hands[seat] ?? [])[0] as number,
  botPick: (v) => v.hand[0] as number,
  resolveRound(s, picks) {
    const hands = s.hands.map((h, i) => h.filter((c) => c !== picks[i]));
    const tableau = s.tableau.map((t, i) => [...t, picks[i] as number]);
    // Pass hands to the left.
    const passed = hands.map((_, i) => hands[(i + hands.length - 1) % hands.length] as number[]);
    return { ...s, round: s.round + 1, hands: passed, tableau };
  },
};

// ---- transport -------------------------------------------------------------

export class LocalNet<S, V, P> {
  now: number;
  readonly inbox = new Map<ConnId, ServerMessage[]>();
  readonly closed = new Map<ConnId, number>();
  /** Every frame ever sent per connection, as JSON text (for leak canaries). */
  readonly wire = new Map<ConnId, string[]>();

  constructor(
    public session: GameSession<S, V, P>,
    start = 0,
  ) {
    this.now = start;
  }

  deliver(out: readonly Outbound[]): void {
    for (const o of out) {
      if (o.kind === 'close') {
        this.closed.set(o.conn, o.code);
        continue;
      }
      const text = JSON.stringify(o.msg);
      this.wire.set(o.conn, [...(this.wire.get(o.conn) ?? []), text]);
      const box = this.inbox.get(o.conn) ?? [];
      box.push(JSON.parse(text) as ServerMessage);
      this.inbox.set(o.conn, box);
    }
  }

  connect(conn: ConnId): void {
    this.inbox.set(conn, []);
    this.closed.delete(conn);
    this.deliver(this.session.open(conn, this.now));
  }

  send(conn: ConnId, body: Body): void {
    this.deliver(
      this.session.receive(conn, JSON.stringify({ v: PROTOCOL_VERSION, ...body }), this.now),
    );
  }

  sendRaw(conn: ConnId, raw: unknown): void {
    this.deliver(this.session.receive(conn, raw, this.now));
  }

  disconnect(conn: ConnId): void {
    this.deliver(this.session.close(conn, this.now));
  }

  /** Advance the clock by `ms`, running every tick the session asks for on the way. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (let i = 0; i < 100_000; i++) {
      const wake = this.session.nextWakeAt();
      if (wake === null || wake > target) break;
      this.now = Math.max(this.now, wake);
      this.deliver(this.session.tick(this.now));
    }
    this.now = target;
    this.deliver(this.session.tick(this.now));
  }

  messages<T extends ServerMessageType>(
    conn: ConnId,
    type: T,
  ): Extract<ServerMessage, { type: T }>[] {
    return (this.inbox.get(conn) ?? []).filter(
      (m): m is Extract<ServerMessage, { type: T }> => m.type === type,
    );
  }

  last<T extends ServerMessageType>(
    conn: ConnId,
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined {
    return this.messages(conn, type).at(-1);
  }
}
