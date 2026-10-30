/** Pure lobby logic (UX.md §6, no DOM): what each seat shows and which buttons the viewer gets. */
import {
  BOT_LEVELS,
  clockMs,
  SEAT_COLOURS,
  TIMER_PRESETS,
  type BotLevel,
  type MemberInfo,
  type RoomConfig,
  type RoomInfo,
  type SeatInfo,
  type TimerPreset,
} from '../../net/protocol';
import {
  BOT_LEVELS as SETUP_LEVELS,
  clockLabel,
  SEAT_COLORS,
  type BotLevel as SetupLevel,
} from '../setup/model';

/** How many towns the ruleset seats (engine `ruleset.minSeats` / `maxSeats`). */
export interface SeatRange {
  min: number;
  max: number;
}

/** What a palette slot (net's `SeatInfo.colour`, 0..SEAT_COLOURS-1) looks like. */
export function seatColor(slot: number): { name: string; color: string } {
  return SEAT_COLORS[slot % SEAT_COLORS.length] ?? { name: 'Seat', color: '#9aa3ad' };
}

/** The palette slots the host can hand out. */
export const COLOUR_SLOTS: readonly number[] = Array.from({ length: SEAT_COLOURS }, (_, i) => i);

/** Each seat's palette slot: the server's (it always sends one), else table order. */
export function roomColours(room: RoomInfo | null, seats = room?.seats.length ?? 0): number[] {
  return Array.from({ length: seats }, (_, i) => room?.seats[i]?.colour ?? i);
}

/** A seat's colour (CSS) in this room. */
export function seatHex(room: RoomInfo | null | undefined, seat: number): string {
  return seatColor(room?.seats[seat]?.colour ?? seat).color;
}

/** Net's rule (session `seatColours`): chosen slots first, other seats the lowest unused. */
export function seatColours(config: RoomConfig, seats: number): number[] {
  const chosen = config.colours ?? [];
  const free = COLOUR_SLOTS.filter((c) => !chosen.includes(c));
  return Array.from({ length: seats }, (_, i) => chosen[i] ?? free.shift() ?? i);
}

/**
 * The room as it will be once the server takes `config`: seats added or cut at the end, levels
 * and colours as chosen. The lobby shows a host edit at once and builds the next edit on it, so
 * two quick edits do not undo each other; the server's next room message replaces the guess.
 */
export function withConfig(room: RoomInfo, config: RoomConfig): RoomInfo {
  const colours = seatColours(config, config.seatCount);
  const seats = Array.from({ length: config.seatCount }, (_, i): SeatInfo => {
    const s = room.seats[i] ?? { occupant: null, status: 'bot' };
    // No level chosen: the server's own default, which it already reports on the seat.
    const botLevel = config.botLevels?.[i] ?? s.botLevel ?? 'easy';
    return { ...s, botLevel, colour: colours[i] ?? i };
  });
  const cut = new Set(room.seats.slice(config.seatCount).map((s) => s.occupant));
  const members = room.members.map((m) => (cut.has(m.id) ? { ...m, seat: null } : m));
  return { ...room, config, seats, members };
}

/** Net's bot levels in the setup screen's words: its `medium` is the setup screen's Normal. */
const SETUP_LEVEL: Record<BotLevel, SetupLevel> = { easy: 'easy', medium: 'normal', hard: 'hard' };
export const BOT_LEVEL_OPTIONS: readonly { id: BotLevel; label: string; hint: string }[] =
  BOT_LEVELS.map((id) => {
    const s = SETUP_LEVELS.find((l) => l.id === SETUP_LEVEL[id]);
    return { id, label: s?.label ?? id, hint: s?.hint ?? '' };
  });

export function botLevelLabel(level: BotLevel): string {
  return BOT_LEVEL_OPTIONS.find((o) => o.id === level)?.label ?? level;
}

export interface SeatView {
  index: number;
  /** Palette slot (see `seatColor`). */
  colour: number;
  color: string;
  colorLabel: string;
  /** Level of the bot that plays this seat when nobody does (net's default: easy). */
  botLevel: BotLevel;
  /** Host: pick the level of the bot on this open seat. */
  canSetLevel: boolean;
  /** Host: pick this seat's colour (taking another seat's colour swaps the two). */
  canSetColour: boolean;
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
  /** The occupant's member id (null for an open seat). */
  member: string | null;
  /** Host: remove this player from the room (anyone but the host). */
  canKick: boolean;
}

export interface SpectatorView {
  member: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isMe: boolean;
  /** Host: remove this watcher from the room. */
  canKick: boolean;
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
  spectators: SpectatorView[];
  me: MemberInfo | null;
  isHost: boolean;
  hostName: string | null;
  /**
   * The host is disconnected: if they stay away past the grace period, net hands the room to
   * the longest-present connected member (seated first). Shown to everyone else.
   */
  hostAway: boolean;
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
  const colours = roomColours(room);
  const seats = room.seats.map((s, index): SeatView => {
    const occ = s.occupant ? byId.get(s.occupant) : undefined;
    const colour = colours[index] ?? index;
    const look = seatColor(colour);
    const isMine = s.occupant !== null && s.occupant === meId;
    return {
      index,
      colour,
      color: look.color,
      colorLabel: look.name,
      botLevel: s.botLevel ?? 'easy',
      canSetLevel: isHost && s.occupant === null,
      canSetColour: isHost,
      name: occ ? occ.name || 'Someone' : null,
      isMine,
      isHostSeat: s.occupant !== null && s.occupant === room.host,
      isAway: occ !== undefined && !occ.connected,
      canSit: s.occupant === null && named,
      canStand: isMine,
      canRemove:
        isHost && s.occupant === null && index === lastIndex && room.seats.length > range.min,
      member: s.occupant,
      canKick: isHost && s.occupant !== null && s.occupant !== meId,
    };
  });
  const host = byId.get(room.host);
  const humans = room.seats.filter((s) => s.occupant !== null).length;
  const open = room.seats.findIndex((s) => s.occupant === null);
  const tableFull = humans === room.seats.length && room.seats.length >= range.max;
  return {
    seats,
    spectators: room.members
      .filter((m) => m.seat === null && m.name)
      .map((m) => ({
        member: m.id,
        name: m.name ?? 'Someone',
        connected: m.connected,
        isHost: m.id === room.host,
        isMe: m.id === meId,
        canKick: isHost && m.id !== meId,
      })),
    me,
    isHost,
    hostName: (host?.name ?? null) || null,
    hostAway: !isHost && host !== undefined && !host.connected,
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

/** The setup screen's words for the clock options (research R8 #5: one name for Off). */
export const TIMER_LABEL: Record<TimerPreset, string> = Object.fromEntries(
  TIMER_PRESETS.map((id) => [id, clockLabel(id)]),
) as Record<TimerPreset, string>;

/** "90 s first pick" (the clock shortens later in a Season, RULES.md R15.3), or "picks wait". */
export function timerHint(preset: TimerPreset): string {
  const ms = clockMs(preset, 'pick', 0);
  return ms === null ? 'picks wait for everyone' : `${ms / 1000} s for the first pick`;
}

export const TIMER_OPTIONS: readonly { id: TimerPreset; label: string; hint: string }[] =
  TIMER_PRESETS.map((id) => ({ id, label: TIMER_LABEL[id], hint: timerHint(id) }));

/** "4 towns · 2 players + 2 bots · Normal clock" (no clock part when Off, as on setup). */
export function configSummary(c: RoomConfig, humans: number): string {
  const bots = c.seatCount - humans;
  const who = [
    `${humans} player${humans === 1 ? '' : 's'}`,
    ...(bots > 0 ? [`${bots} bot${bots === 1 ? '' : 's'}`] : []),
  ].join(' + ');
  const clock = c.timer === 'off' ? [] : [`${TIMER_LABEL[c.timer]} clock`];
  return [`${c.seatCount} towns`, who, ...clock].join(' · ');
}

/** Online bots play at Normal unless the host picks another level, as in hotseat. */
export const ONLINE_BOT_LEVEL: BotLevel = 'medium';

/** Every seat's bot level set to the online default (a room net made with none chosen). */
export function withDefaultLevels(c: RoomConfig): RoomConfig {
  return { ...c, botLevels: Array.from({ length: c.seatCount }, () => ONLINE_BOT_LEVEL) };
}

/**
 * Net refuses per-seat lists longer than the table, so a smaller table trims them; a bigger one
 * gets the online default level on its new seats.
 */
export function withSeatCount(c: RoomConfig, seatCount: number): RoomConfig {
  const { botLevels, colours, ...rest } = c;
  const levels = botLevels
    ? Array.from({ length: seatCount }, (_, i) => botLevels[i] ?? ONLINE_BOT_LEVEL)
    : undefined;
  return {
    ...rest,
    seatCount,
    ...(levels ? { botLevels: levels } : {}),
    ...(colours ? { colours: colours.slice(0, seatCount) } : {}),
  };
}

/** The room's config with one seat's bot level changed (the others as the server sent them). */
export function withBotLevel(room: RoomInfo, seat: number, level: BotLevel): RoomConfig {
  const botLevels = room.seats.map((s, i) => (i === seat ? level : (s.botLevel ?? 'easy')));
  return { ...room.config, botLevels };
}

/**
 * The room's config with `seat` on palette slot `slot`. Net wants every colour different, so if
 * another seat has that slot the two seats swap.
 */
export function withColour(room: RoomInfo, seat: number, slot: number): RoomConfig {
  const colours = roomColours(room);
  const other = colours.indexOf(slot);
  if (other >= 0 && other !== seat) colours[other] = colours[seat] ?? seat;
  colours[seat] = slot;
  return { ...room.config, colours };
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
