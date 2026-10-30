/**
 * Online wire protocol (docs/MULTIPLAYER.md §3). One JSON object per frame with `v` and `type`.
 * Client frames are untrusted: `parseClientMessage` rebuilds them from known fields. Picks and
 * views are opaque here (`unknown`); the engine seam validates picks.
 */
import {
  field,
  int,
  Invalid,
  isRecord,
  nullable,
  oneOf,
  onlyKeys,
  record,
  str,
  type Check,
} from './guard';

export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  messageChars: 8_000,
  name: 16,
  chat: 280,
  chatHistory: 100,
  members: 32,
  tokenMin: 16,
  tokenMax: 128,
} as const;

export const RATE_LIMITS = {
  chat: { burst: 5, perSec: 0.5 },
  react: { burst: 6, perSec: 1 },
  submit: { burst: 10, perSec: 5 },
  lobby: { burst: 10, perSec: 2 },
} as const;
export type RateKind = keyof typeof RATE_LIMITS;

export const REACTIONS = ['thumbsUp', 'laugh', 'wow', 'sad', 'clap', 'think', 'gg'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const SEAT_RANGE = { min: 2, max: 8 } as const; // guess: RULES.md will decide
export const ROUND_TIMER_RANGE = { min: 10, max: 300 } as const; // seconds, guess

export type RoomPhase = 'lobby' | 'playing' | 'over';
export type SeatStatus = 'human' | 'away' | 'bot';

export interface RoomConfig {
  seatCount: number;
  /** Seconds per round; null = no clock. */
  roundTimerSec: number | null;
}
export const DEFAULT_ROOM_CONFIG: RoomConfig = { seatCount: 4, roundTimerSec: 60 };

export interface SeatInfo {
  /** Member id of the owner (kept while a bot plays for them), or null for an open seat. */
  occupant: string | null;
  status: SeatStatus;
}
export interface MemberInfo {
  id: string;
  name: string | null;
  seat: number | null;
  connected: boolean;
}
export interface RoomInfo {
  id: string;
  phase: RoomPhase;
  host: string;
  config: RoomConfig;
  seats: SeatInfo[];
  members: MemberInfo[];
}
export interface ChatEntry {
  id: number;
  at: number;
  /** Member id, or null for system lines. */
  from: string | null;
  name: string;
  text: string;
}

// ---- client -> server ------------------------------------------------------

export type ClientMessage =
  | { v: 1; type: 'hello'; token: string | null; name?: string }
  | { v: 1; type: 'setName'; name: string }
  | { v: 1; type: 'takeSeat'; seat: number }
  | { v: 1; type: 'leaveSeat' }
  | { v: 1; type: 'configure'; config: RoomConfig }
  | { v: 1; type: 'kick'; member: string }
  | { v: 1; type: 'start' }
  | { v: 1; type: 'rematch' }
  /** `round` guards against a pick for a round that has already resolved. */
  | { v: 1; type: 'submit'; round: number; pick: unknown }
  | { v: 1; type: 'withdraw'; round: number }
  | { v: 1; type: 'chat'; text: string }
  | { v: 1; type: 'react'; reaction: Reaction }
  | { v: 1; type: 'sync' };
export type ClientMessageType = ClientMessage['type'];

export const ERROR_CODES = [
  'bad_message',
  'version_mismatch',
  'not_joined',
  'rate_limited',
  'room_full',
  'not_host',
  'wrong_phase',
  'name_required',
  'bad_seat',
  'seat_taken',
  'not_seated',
  'bad_config',
  'stale_round',
  'illegal_pick',
  'kicked',
  'replaced',
  'room_expired',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Close codes. Clients must not auto-reconnect after 4000-4004. */
export const CLOSE = {
  versionMismatch: 4000,
  roomFull: 4001,
  kicked: 4002,
  replaced: 4003,
  expired: 4004,
} as const;

// ---- server -> client ------------------------------------------------------

export interface TimerInfo {
  remainingMs: number;
  totalMs: number;
}
export type ServerMessage =
  | {
      v: 1;
      type: 'welcome';
      you: { member: string; token: string };
      room: RoomInfo;
      chat: ChatEntry[];
    }
  | { v: 1; type: 'room'; room: RoomInfo }
  | {
      v: 1;
      type: 'game';
      /** Bumps on every change visible to anyone, including "seat N submitted". */
      seq: number;
      round: number;
      /** Redacted for this member only. */
      view: unknown;
      legal: unknown[];
      /** Who has a pick in; says nothing about what was picked. */
      submitted: boolean[];
      /** This member's own pending pick, so a reconnect shows it. */
      myPick: unknown;
      timer: TimerInfo | null;
    }
  | { v: 1; type: 'ack'; ref: 'submit' | 'withdraw'; round: number }
  | { v: 1; type: 'chat'; entry: ChatEntry }
  | { v: 1; type: 'reaction'; member: string; seat: number | null; reaction: Reaction }
  | { v: 1; type: 'error'; code: ErrorCode; message: string; ref?: ClientMessageType };
export type ServerMessageType = ServerMessage['type'];

// ---- parsing ---------------------------------------------------------------

const CTRL = /[\p{Cc}\p{Cf}]/gu; // control + format (zero-width, bidi) characters
/** Strip control/bidi characters, collapse whitespace, cap at `max` code points. */
export function cleanText(s: string, max: number): string {
  return [...s.replace(CTRL, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}

const token: Check<string> = str(LIMITS.tokenMax, {
  min: LIMITS.tokenMin,
  pattern: /^[A-Za-z0-9_-]+$/,
});
const memberId: Check<string> = str(12, { min: 2, pattern: /^m\d+$/ });
const rawText = (max: number): Check<string> => str(max * 2);

const configCheck: Check<RoomConfig> = (x, path) => {
  const o = record(x, path);
  onlyKeys(o, ['seatCount', 'roundTimerSec'], path);
  return {
    seatCount: field(o, 'seatCount', int(SEAT_RANGE.min, SEAT_RANGE.max), path),
    roundTimerSec: field(
      o,
      'roundTimerSec',
      nullable(int(ROUND_TIMER_RANGE.min, ROUND_TIMER_RANGE.max)),
      path,
    ),
  };
};

/** Throws `Invalid`. Unknown keys are rejected so nothing unvetted reaches the session. */
export function parseClientMessage(raw: unknown): ClientMessage {
  const o = record(raw, 'message');
  if (o['v'] !== PROTOCOL_VERSION) throw new Invalid('v', 'version_mismatch');
  const type = field(o, 'type', str(32), 'message');
  const keys = (...k: string[]) => onlyKeys(o, ['v', 'type', ...k], 'message');
  const p = 'message';
  switch (type) {
    case 'hello':
      keys('token', 'name');
      return {
        v: 1,
        type,
        token: field(o, 'token', nullable(token), p),
        ...(o['name'] === undefined ? {} : { name: field(o, 'name', rawText(LIMITS.name), p) }),
      };
    case 'setName':
      keys('name');
      return { v: 1, type, name: field(o, 'name', rawText(LIMITS.name), p) };
    case 'takeSeat':
      keys('seat');
      return { v: 1, type, seat: field(o, 'seat', int(0, SEAT_RANGE.max - 1), p) };
    case 'configure':
      keys('config');
      return { v: 1, type, config: field(o, 'config', configCheck, p) };
    case 'kick':
      keys('member');
      return { v: 1, type, member: field(o, 'member', memberId, p) };
    case 'leaveSeat':
    case 'start':
    case 'rematch':
    case 'sync':
      keys();
      return { v: 1, type };
    case 'submit': {
      keys('round', 'pick');
      // The pick is opaque JSON here; size is bounded by messageChars, shape by the engine.
      if (!('pick' in o)) throw new Invalid('message.pick', 'required');
      return { v: 1, type, round: field(o, 'round', int(1, 10_000), p), pick: o['pick'] };
    }
    case 'withdraw':
      keys('round');
      return { v: 1, type, round: field(o, 'round', int(1, 10_000), p) };
    case 'chat':
      keys('text');
      return { v: 1, type, text: field(o, 'text', rawText(LIMITS.chat), p) };
    case 'react':
      keys('reaction');
      return { v: 1, type, reaction: field(o, 'reaction', oneOf(REACTIONS), p) };
    default:
      throw new Invalid('message.type', 'unknown type');
  }
}

/** Shallow check for the client: JSON object, right version, known-looking type. */
export function parseServerMessage(raw: string): ServerMessage {
  const x: unknown = JSON.parse(raw);
  if (!isRecord(x) || x['v'] !== PROTOCOL_VERSION || typeof x['type'] !== 'string') {
    throw new Invalid('message', 'not a server message');
  }
  return x as unknown as ServerMessage;
}
