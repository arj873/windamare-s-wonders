/**
 * New-game setup draft (UX.md §5): pure data + transitions, no DOM. Port of the game-agnostic
 * half of catan's ui/setup/model.ts (seats, colours, names, timer, seed, storage); the Catan
 * maps, expansions and rule toggles are gone. Card-game rules options are slots until
 * docs/RULES.md exists.
 */

/**
 * Seat range. PROVISIONAL: ww-design fixes the real range in docs/RULES.md (UX.md §14.1
 * ⟨player range⟩); the layout is built for 3–7 and must not break at 2 or 8.
 */
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;
export const DEFAULT_PLAYERS = 4;
export const NAME_MAX = 16;
export const SEED_MAX = 32;

/**
 * RULES.md R15.3 turn clock options. The game gives the Normal lengths (Windamere: 45, 40, 35,
 * 30, 25 s by turn of the Season, 60 s for the Great Work choice); the others scale them,
 * rounded up. Default Off in hotseat (R15.3).
 */
export type ClockId = 'off' | 'relaxed' | 'normal' | 'fast';
export const CLOCKS: readonly { id: ClockId; label: string; scale: number }[] = [
  { id: 'off', label: 'Off', scale: 0 },
  { id: 'relaxed', label: 'Relaxed', scale: 1.5 },
  { id: 'normal', label: 'Normal', scale: 1 },
  { id: 'fast', label: 'Fast', scale: 0.5 },
];
export const DEFAULT_CLOCK: ClockId = 'off';
export const clockScale = (id: ClockId): number => CLOCKS.find((c) => c.id === id)?.scale ?? 0;

export type Controller = 'human' | 'bot';
export type BotLevel = 'easy' | 'normal' | 'hard';

/** The bots lane's levels (src/bots pickFor: easy, level 2, level 3), in players' words. */
export const BOT_LEVELS: readonly { id: BotLevel; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy', hint: 'Picks any legal card at random' },
  { id: 'normal', label: 'Normal', hint: 'Weighs every card it holds for this turn' },
  {
    id: 'hard',
    label: 'Hard',
    hint: 'Like Normal, and also takes cards its neighbours want (a small step up)',
  },
];
export const DEFAULT_BOT_LEVEL: BotLevel = 'normal';

/**
 * Seat colours. PROVISIONAL (catan's set): ww-art owns the final player palette and its
 * colour-blind check (UX.md §14.2).
 */
const RED = { name: 'Red', color: '#d64541' };
export const SEAT_COLORS: readonly { name: string; color: string }[] = [
  RED,
  { name: 'Blue', color: '#3a7bd5' },
  { name: 'White', color: '#ecf0f1' },
  { name: 'Orange', color: '#f39c12' },
  { name: 'Green', color: '#3fae6a' },
  { name: 'Purple', color: '#9b59b6' },
  { name: 'Brown', color: '#9c6b43' },
  { name: 'Pink', color: '#ec7fb5' },
];

/** A ruleset tile on the setup screen. Until design ships variants there is one. */
export interface ModeInfo {
  id: string;
  name: string;
  blurb: string;
}

const STANDARD: ModeInfo = { id: 'standard', name: 'Standard', blurb: 'The full game' };
export const MODES: readonly ModeInfo[] = [STANDARD];

export interface SeatDraft {
  name: string;
  color: string;
  controller: Controller;
  /** Difficulty when the seat is a bot (absent = DEFAULT_BOT_LEVEL). */
  botLevel?: BotLevel;
}

export interface SetupDraft {
  mode: string;
  /** Table order: seat i sits between seats i-1 and i+1 (wrapping). */
  seats: SeatDraft[];
  /** R15.3 turn clock. */
  clock: ClockId;
  seed: string;
}

export interface SeatConfig {
  name: string;
  color: string;
  controller: Controller;
  botLevel?: BotLevel;
}

/** What the setup screen hands to the controller (src/game). */
export interface NewGameConfig {
  mode: string;
  players: SeatConfig[];
  /** R15.3 turn clock; the game turns it into seconds per turn. */
  clock: ClockId;
  seed?: string;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

function newSeat(index: number, taken: ReadonlySet<string>): SeatDraft {
  const c = SEAT_COLORS.find((x) => !taken.has(x.color)) ?? RED;
  return {
    // Not "You": the engine writes names into log lines ("Player 1 builds …").
    name: index === 0 ? 'Player 1' : `Bot ${c.name}`,
    color: c.color,
    controller: index === 0 ? 'human' : 'bot',
  };
}

export function defaultSetup(players = DEFAULT_PLAYERS): SetupDraft {
  const seats: SeatDraft[] = [];
  for (let i = 0; i < players; i++) seats.push(newSeat(i, new Set(seats.map((s) => s.color))));
  return { mode: STANDARD.id, seats, clock: DEFAULT_CLOCK, seed: '' };
}

function withSeat(draft: SetupDraft, index: number, patch: Partial<SeatDraft>): SetupDraft {
  if (!draft.seats[index]) return draft;
  return { ...draft, seats: draft.seats.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}

/** + Add player: a bot by default (most tables are you + bots). No-op at MAX_PLAYERS. */
export function addSeat(draft: SetupDraft, controller: Controller = 'bot'): SetupDraft {
  if (draft.seats.length >= MAX_PLAYERS) return draft;
  const seat = newSeat(draft.seats.length, new Set(draft.seats.map((s) => s.color)));
  const name = controller === 'human' ? `Player ${draft.seats.length + 1}` : seat.name;
  return { ...draft, seats: [...draft.seats, { ...seat, name, controller }] };
}

/** Remove exactly seat `index`; the others keep names and colours. No-op at MIN_PLAYERS. */
export function removeSeat(draft: SetupDraft, index: number): SetupDraft {
  if (draft.seats.length <= MIN_PLAYERS || !draft.seats[index]) return draft;
  return { ...draft, seats: draft.seats.filter((_, i) => i !== index) };
}

/** Move seat `index` by `delta` places in table order (↑/↓). Clamped at the ends. */
export function moveSeat(draft: SetupDraft, index: number, delta: number): SetupDraft {
  const to = clamp(index + delta, 0, draft.seats.length - 1);
  const seat = draft.seats[index];
  if (!seat || to === index) return draft;
  const seats = draft.seats.filter((_, i) => i !== index);
  seats.splice(to, 0, seat);
  return { ...draft, seats };
}

/** ↻ Shuffle table order. `random` is injected (tests); the UI passes Math.random. */
export function shuffleSeats(draft: SetupDraft, random: () => number): SetupDraft {
  const seats = [...draft.seats];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = seats[i];
    const b = seats[j];
    if (a && b) {
      seats[i] = b;
      seats[j] = a;
    }
  }
  return { ...draft, seats };
}

export function setSeatName(draft: SetupDraft, index: number, name: string): SetupDraft {
  return withSeat(draft, index, { name: name.slice(0, NAME_MAX) });
}

const DEFAULT_HUMAN_NAME = /^(You|Player \d+)$/;

/** The home screen's nickname on the first human seat, if that seat still has a default name. */
export function withPlayerName(draft: SetupDraft, name: string | undefined): SetupDraft {
  const nick = name?.trim().slice(0, NAME_MAX);
  const i = draft.seats.findIndex((s) => s.controller === 'human');
  const seat = draft.seats[i];
  if (!nick || !seat || !DEFAULT_HUMAN_NAME.test(seat.name)) return draft;
  return setSeatName(draft, i, nick);
}

/**
 * Human ⇄ bot. A seat whose name is still the default of the other kind gets this kind's
 * default ("Bot Red" ⇄ "Player 2"), so the list never shows a human called "Bot Red".
 */
export function setController(
  draft: SetupDraft,
  index: number,
  controller: Controller,
): SetupDraft {
  const seat = draft.seats[index];
  if (!seat || seat.controller === controller) return draft;
  const colour = SEAT_COLORS.find((c) => c.color === seat.color)?.name ?? '';
  const botName = `Bot ${colour}`;
  const humanName = `Player ${index + 1}`;
  let name = seat.name;
  if (controller === 'human' && name === botName) name = humanName;
  if (controller === 'bot' && (name === humanName || name.trim() === '')) name = botName;
  return withSeat(draft, index, { controller, name });
}

export function setBotLevel(draft: SetupDraft, index: number, botLevel: BotLevel): SetupDraft {
  return withSeat(draft, index, { botLevel });
}

/** Give seat `index` a colour; whoever had it gets this seat's old colour (colours stay unique). */
export function pickSeatColor(draft: SetupDraft, index: number, color: string): SetupDraft {
  const seat = draft.seats[index];
  if (!seat || seat.color === color || !SEAT_COLORS.some((c) => c.color === color)) return draft;
  const seats = draft.seats.map((s, i) => {
    if (i === index) return { ...s, color };
    if (s.color === color) return { ...s, color: seat.color };
    return s;
  });
  return { ...draft, seats };
}

export function setClock(draft: SetupDraft, clock: ClockId): SetupDraft {
  return CLOCKS.some((c) => c.id === clock) ? { ...draft, clock } : draft;
}

export function setMode(draft: SetupDraft, id: string): SetupDraft {
  return MODES.some((m) => m.id === id) ? { ...draft, mode: id } : draft;
}

export function setSeed(draft: SetupDraft, seed: string): SetupDraft {
  return { ...draft, seed: seed.slice(0, SEED_MAX) };
}

export function humanCount(draft: SetupDraft): number {
  return draft.seats.filter((s) => s.controller === 'human').length;
}

export function clockLabel(id: ClockId): string {
  return CLOCKS.find((c) => c.id === id)?.label ?? 'Off';
}

export function modeOf(draft: Pick<SetupDraft, 'mode'>): ModeInfo {
  return MODES.find((m) => m.id === draft.mode) ?? STANDARD;
}

/** Footer line (UX.md §5): "Standard · 4 players (3 bots) · Normal clock". */
export function summaryLine(draft: SetupDraft): string {
  const n = draft.seats.length;
  const bots = n - humanCount(draft);
  const who = bots === 0 ? `${n} players` : `${n} players (${bots} bot${bots === 1 ? '' : 's'})`;
  const clock = draft.clock === 'off' ? '' : ` · ${clockLabel(draft.clock)} clock`;
  return `${modeOf(draft).name} · ${who}${clock}`;
}

/** Why Start is off, or null. */
export function setupError(draft: SetupDraft): string | null {
  const n = draft.seats.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS)
    return `${MIN_PLAYERS}–${MAX_PLAYERS} players, this table has ${n}.`;
  if (humanCount(draft) === 0) return 'Seat at least one human player.';
  return null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Trim names, fill blanks, make duplicates unique, drop an empty seed. */
export function buildConfig(draft: SetupDraft): NewGameConfig {
  const taken = new Set<string>();
  const players = draft.seats.map((s, i): SeatConfig => {
    const base = s.name.trim().slice(0, NAME_MAX) || `Player ${i + 1}`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    taken.add(name.toLowerCase());
    return {
      name,
      color: s.color,
      controller: s.controller,
      ...(s.controller === 'bot' ? { botLevel: s.botLevel ?? DEFAULT_BOT_LEVEL } : {}),
    };
  });
  const cfg: NewGameConfig = { mode: draft.mode, players, clock: draft.clock };
  const seed = draft.seed.trim();
  if (seed) cfg.seed = seed;
  return cfg;
}

// ---------------------------------------------------------------------------
// Persistence (last-used settings). Every storage access is guarded.
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'ww:setup:v1';

export type SetupStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function saveSetup(storage: SetupStorage | null, draft: SetupDraft): void {
  if (!storage) return;
  try {
    // The seed is not remembered: it would replay the same game every time.
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, seed: '' }));
  } catch {
    // Quota / privacy mode: settings just aren't remembered.
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isBotLevel = (v: unknown): v is BotLevel => BOT_LEVELS.some((l) => l.id === v);

/** Rebuild a valid draft from untrusted JSON; anything off falls back to the default. */
export function sanitizeSetup(raw: unknown): SetupDraft {
  const base = defaultSetup();
  if (!isRecord(raw)) return base;
  const rawSeats = Array.isArray(raw['seats']) ? raw['seats'].slice(0, MAX_PLAYERS) : [];
  const seats: SeatDraft[] = [];
  const used = new Set<string>();
  rawSeats.forEach((rs, i) => {
    const o = isRecord(rs) ? rs : {};
    const fresh = newSeat(i, used);
    let color = typeof o['color'] === 'string' ? o['color'] : '';
    if (!SEAT_COLORS.some((c) => c.color === color) || used.has(color)) color = fresh.color;
    used.add(color);
    const controller: Controller =
      o['controller'] === 'human' || o['controller'] === 'bot' ? o['controller'] : fresh.controller;
    seats.push({
      name: typeof o['name'] === 'string' ? o['name'].slice(0, NAME_MAX) : fresh.name,
      color,
      controller,
      ...(isBotLevel(o['botLevel']) ? { botLevel: o['botLevel'] } : {}),
    });
  });
  while (seats.length < MIN_PLAYERS)
    seats.push(newSeat(seats.length, new Set(seats.map((s) => s.color))));
  // Setups saved before R15.3 had a timer index: any timer becomes Normal.
  const legacy = typeof raw['timerIdx'] === 'number' && raw['timerIdx'] > 0 ? 'normal' : 'off';
  const clock = CLOCKS.find((c) => c.id === raw['clock'])?.id ?? legacy;
  const mode =
    typeof raw['mode'] === 'string' && MODES.some((m) => m.id === raw['mode'])
      ? raw['mode']
      : base.mode;
  return { mode, seats, clock, seed: '' };
}

export function loadSetup(storage: SetupStorage | null): SetupDraft {
  if (!storage) return defaultSetup();
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? sanitizeSetup(JSON.parse(text)) : defaultSetup();
  } catch {
    return defaultSetup();
  }
}
