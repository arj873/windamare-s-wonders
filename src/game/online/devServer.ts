/**
 * In-browser room server for development and tests: one net `GameSession` per room on a
 * `RoomHost` (src/net/loopback.ts), on whatever clock it is given (real timers in the browser, a
 * FakeClock in tests). Runs inside a SharedWorker (devWorker.ts) so several tabs share the rooms,
 * or in the page itself where SharedWorker is missing. Same engine as the Worker
 * (src/server/engine.ts): the shipped Windamere content.
 */
import { createWindamereEngine, windamereContent, type DraftEngine } from '../../engine';
import { ROOM_CODE_LENGTH, roomCodeFromBytes } from '../../net/api';
import { RoomHost, type Sink } from '../../net/loopback';
import type { RoomPhase } from '../../net/protocol';
import { GameSession, type SessionDeps, type SessionOptions } from '../../net/session';
import type { Clock } from '../../net/transport';
import { sessionOptionsFrom } from '../../server/room';
import { realClock } from './backend';

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomString(n: number, bytes: (n: number) => Uint8Array): string {
  return Array.from(bytes(n), (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

const cryptoBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

export interface DevServerOptions {
  clock?: Clock;
  session?: Partial<SessionOptions>;
  /** Random bytes (room codes, tokens, seeds); tests pass a seeded source. */
  bytes?: (n: number) => Uint8Array;
  engine?: DraftEngine<unknown, unknown>;
}

/** The shipped engine, typed for the game-agnostic session (as src/server/engine.ts does). */
export function devEngine(): DraftEngine<unknown, unknown> {
  return createWindamereEngine(windamereContent()) as unknown as DraftEngine<unknown, unknown>;
}

export class DevServer {
  private readonly rooms = new Map<string, RoomHost>();
  private readonly clock: Clock;
  private readonly bytes: (n: number) => Uint8Array;
  private readonly engine: DraftEngine<unknown, unknown>;

  constructor(private readonly opts: DevServerOptions = {}) {
    this.clock = opts.clock ?? realClock;
    this.bytes = opts.bytes ?? cryptoBytes;
    this.engine = opts.engine ?? devEngine();
  }

  create(): { roomId: string; hostToken: string } {
    // Same code format as the Worker (6 symbols, no 0/O/1/I).
    const code = () => roomCodeFromBytes(this.bytes(ROOM_CODE_LENGTH));
    let roomId = code();
    while (this.rooms.has(roomId)) roomId = code();
    const deps: SessionDeps = {
      token: () => randomString(32, this.bytes),
      seed: () => randomString(16, this.bytes),
    };
    const { session, hostToken } = GameSession.create(
      roomId,
      this.clock.now(),
      this.engine,
      deps,
      // The Worker's defaults first (the Season card's reading time, R7 net #1), then overrides.
      { ...sessionOptionsFrom({}), ...this.opts.session },
    );
    this.rooms.set(roomId, new RoomHost(session, this.clock));
    return { roomId, hostToken };
  }

  check(roomId: string): { phase: RoomPhase } | null {
    const room = this.rooms.get(roomId);
    return room ? { phase: room.session.currentPhase } : null;
  }

  /** False if the room does not exist (the caller closes the connection with 4004). */
  attach(roomId: string, conn: string, sink: Sink): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.attach(conn, sink);
    return true;
  }

  frame(roomId: string, conn: string, text: string): void {
    this.rooms.get(roomId)?.frame(conn, text);
  }

  detach(roomId: string, conn: string): void {
    this.rooms.get(roomId)?.detach(conn);
  }

  /** Drop a connection as if the network failed (the client sees 1006 and reconnects). */
  cut(roomId: string, conn: string): void {
    this.rooms.get(roomId)?.cut(conn);
  }

  /** Every connection of a room (tests). */
  conns(roomId: string): string[] {
    return this.rooms.get(roomId)?.conns() ?? [];
  }

  dispose(): void {
    for (const r of this.rooms.values()) r.dispose();
    this.rooms.clear();
  }
}
