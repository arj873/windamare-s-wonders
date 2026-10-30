/**
 * In-memory transport with a fake clock for session tests, and for the client to test against
 * without a server. Records every frame per connection (as JSON text) for leak checks.
 */
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

// ---- transport -------------------------------------------------------------

export class LocalNet<S, T> {
  now: number;
  readonly inbox = new Map<ConnId, ServerMessage[]>();
  readonly closed = new Map<ConnId, number>();
  /** Every frame ever sent per connection, as JSON text (for leak canaries). */
  readonly wire = new Map<ConnId, string[]>();

  constructor(
    public session: GameSession<S, T>,
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
