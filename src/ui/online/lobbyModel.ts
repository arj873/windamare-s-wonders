/** Pure lobby logic (UX.md §6, no DOM): what each seat shows and which buttons the viewer gets. */
import {
  clockMs,
  TIMER_PRESETS,
  type MemberInfo,
  type RoomConfig,
  type RoomInfo,
  type TimerPreset,
} from '../../net/protocol';
import { SEAT_COLORS } from '../setup/model';

/** How many towns the ruleset seats (engine `ruleset.minSeats` / `maxSeats`). */
export interface SeatRange {
  min: number;
  max: number;
}

/** Seat colour by table position (the room protocol has no colour choice yet). */
export function seatColor(seat: number): { name: string; color: string } {
  return SEAT_COLORS[seat % SEAT_COLORS.length] ?? { name: 'Seat', color: '#9aa3ad' };
}

export interface SeatView {
  index: number;
  color: string;
  colorLabel: string;
  /** Occupant's nickname, or null for an open seat (a bot plays it). */
  name: string | null;
  isMine: boolean;
  isHostSeat: boolean;
  /** Occupant disconnected. */
  isAway: boolean;
  canSit: boolean;
  canStand: boolean;
  /** Host: remove this seat (the last one, open, above the minimum). */
  canRemove: boolean;
}

export interface WatchingView {
  /** Has a nickname (needed to sit). */
  named: boolean;
  /** First open seat, or null when every seat has a person. */
  openSeat: number | null;
}

export interface LobbyView {
  seats: SeatView[];
  /** Members without a seat who have a nickname. */
  spectators: MemberInfo[];
  me: MemberInfo | null;
  isHost: boolean;
  hostName: string | null;
  canAddSeat: boolean;
  /** Start button: null = enabled, else why not. */
  startBlocked: string | null;
  summary: string;
  /** The viewer has no seat; null when seated. */
  watching: WatchingView | null;
  inviteNote: string;
  /** Every seat has a person and the table cannot grow: newcomers watch. */
  tableFull: boolean;
  humans: number;
  bots: number;
}

export function lobbyView(room: RoomInfo, meId: string | null, range: SeatRange): LobbyView {
  const me = room.members.find((m) => m.id === meId) ?? null;
  const isHost = me !== null && room.host === me.id;
  const byId = new Map(room.members.map((m) => [m.id, m]));
  const lastIndex = room.seats.length - 1;
  const named = me !== null && me.name !== null && me.name !== '';
  const seats = room.seats.map((s, index): SeatView => {
    const occ = s.occupant ? byId.get(s.occupant) : undefined;
    const look = seatColor(index);
    const isMine = s.occupant !== null && s.occupant === meId;
    return {
      index,
      color: look.color,
      colorLabel: look.name,
      name: occ ? occ.name || 'Someone' : null,
      isMine,
      isHostSeat: s.occupant !== null && s.occupant === room.host,
      isAway: occ !== undefined && !occ.connected,
      canSit: s.occupant === null && named,
      canStand: isMine,
      canRemove:
        isHost && s.occupant === null && index === lastIndex && room.seats.length > range.min,
    };
  });
  const humans = room.seats.filter((s) => s.occupant !== null).length;
  const open = room.seats.findIndex((s) => s.occupant === null);
  const tableFull = humans === room.seats.length && room.seats.length >= range.max;
  return {
    seats,
    spectators: room.members.filter((m) => m.seat === null && m.name),
    me,
    isHost,
    hostName: (byId.get(room.host)?.name ?? null) || null,
    canAddSeat: isHost && room.seats.length < range.max,
    startBlocked: !isHost
      ? 'Only the host can start'
      : humans === 0
        ? 'Someone has to take a seat first'
        : null,
    summary: configSummary(room.config, humans),
    watching: me === null || me.seat !== null ? null : { named, openSeat: open >= 0 ? open : null },
    inviteNote: tableFull
      ? `The table is full (${range.max} towns): anyone else who joins watches.`
      : `Anyone with the link can join. They take a bot's seat, or a new one up to ${range.max} towns; after that, newcomers watch.`,
    tableFull,
    humans,
    bots: room.seats.length - humans,
  };
}

export const TIMER_LABEL: Record<TimerPreset, string> = {
  off: 'No clock',
  relaxed: 'Relaxed',
  normal: 'Normal',
  fast: 'Fast',
};

/** "90 s first pick" (the clock shortens later in a Season, RULES.md R15.3), or "picks wait". */
export function timerHint(preset: TimerPreset): string {
  const ms = clockMs(preset, 'pick', 0);
  return ms === null ? 'picks wait for everyone' : `${ms / 1000} s for the first pick`;
}

export const TIMER_OPTIONS: readonly { id: TimerPreset; label: string; hint: string }[] =
  TIMER_PRESETS.map((id) => ({ id, label: TIMER_LABEL[id], hint: timerHint(id) }));

/** "4 towns · 2 players + 2 bots · Normal clock". */
export function configSummary(c: RoomConfig, humans: number): string {
  const bots = c.seatCount - humans;
  const who = [
    `${humans} player${humans === 1 ? '' : 's'}`,
    ...(bots > 0 ? [`${bots} bot${bots === 1 ? '' : 's'}`] : []),
  ].join(' + ');
  const clock = c.timer === 'off' ? 'no clock' : `${TIMER_LABEL[c.timer]} clock`;
  return [`${c.seatCount} towns`, who, clock].join(' · ');
}

export function withSeatCount(c: RoomConfig, seatCount: number): RoomConfig {
  return { ...c, seatCount };
}

/** The link friends open: this page with `?room=CODE` (keeps an explicit `?server=`). */
export function inviteUrl(href: string, roomId: string): string {
  const u = new URL(href);
  const server = u.searchParams.get('server');
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', roomId);
  if (server) u.searchParams.set('server', server);
  return u.toString();
}
