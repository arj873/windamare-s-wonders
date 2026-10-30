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
import type { DraftAction, DraftView, Json, Pick } from '../engine';

export const PROTOCOL_VERSION = 1;

/** Keep-alive: raw text frames, answered by the runtime without waking the Durable Object. */
export const PING = 'ping';
export const PONG = 'pong';

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
  pick: { burst: 10, perSec: 5 },
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
  /** Ruleset options (variants); the engine's `validateConfig` judges them at start. */
  options?: Record<string, Json>;
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
  /** Hidden until the reveal; replaces an earlier pick. The sender's seat is implied. */
  | { v: 1; type: 'pick'; pick: Pick }
  | { v: 1; type: 'unpick' }
  | { v: 1; type: 'answer'; prompt: number; answer: Json }
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
  'illegal_action',
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
      /** The engine's `seq`: +1 per accepted action. */
      seq: number;
      /** Engine `viewFor` for this member only. It carries their own pending pick and `submitted[]`. */
      view: DraftView<unknown, unknown>;
      /** Engine `legalActions` for this member's seat ([] for spectators). */
      legal: DraftAction[];
      /** Seats the game waits for now (picks or a prompt answer). */
      waiting: number[];
      timer: TimerInfo | null;
    }
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

const pickCheck: Check<Pick> = (x, path) => {
  const o = record(x, path);
  onlyKeys(o, ['card', 'use', 'args'], path);
  const pick: Pick = {
    card: field(o, 'card', int(0, 1_000_000), path),
    use: field(o, 'use', str(32, { min: 1 }), path),
  };
  // `args` is ruleset vocabulary: any JSON, judged by the ruleset's validatePick.
  if (o['args'] !== undefined) pick.args = o['args'] as Json;
  return pick;
};

const configCheck: Check<RoomConfig> = (x, path) => {
  const o = record(x, path);
  onlyKeys(o, ['seatCount', 'roundTimerSec', 'options'], path);
  const options = o['options'];
  if (options !== undefined && (!isRecord(options) || Object.keys(options).length > 16)) {
    throw new Invalid(`${path}.options`, 'expected an object with at most 16 keys');
  }
  return {
    ...(options === undefined ? {} : { options: options as Record<string, Json> }),
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
    case 'unpick':
    case 'start':
    case 'rematch':
    case 'sync':
      keys();
      return { v: 1, type };
    case 'pick':
      keys('pick');
      return { v: 1, type, pick: field(o, 'pick', pickCheck, p) };
    case 'answer': {
      keys('prompt', 'answer');
      if (!('answer' in o)) throw new Invalid('message.answer', 'required');
      // Any JSON; its size is bounded by messageChars and its meaning is the engine's to judge.
      return {
        v: 1,
        type,
        prompt: field(o, 'prompt', int(0, 1_000_000), p),
        answer: o['answer'] as Json,
      };
    }
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
