import { describe, expect, it } from 'vitest';
import {
  addSeat,
  buildConfig,
  defaultSetup,
  loadSetup,
  MAX_PLAYERS,
  MIN_PLAYERS,
  moveSeat,
  pickSeatColor,
  removeSeat,
  sanitizeSetup,
  saveSetup,
  SEAT_COLORS,
  setController,
  setSeatName,
  setSeed,
  setTimerIdx,
  setupError,
  shuffleSeats,
  STORAGE_KEY,
  summaryLine,
  TIMER_STEPS,
  withPlayerName,
  type SetupStorage,
} from './model';

function memory(): SetupStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const colours = (d: ReturnType<typeof defaultSetup>) => d.seats.map((s) => s.color);

describe('withPlayerName', () => {
  it('names the first human seat only while it has a default name', () => {
    const d = defaultSetup();
    expect(withPlayerName(d, ' Ana ').seats[0]!.name).toBe('Ana');
    expect(withPlayerName(d, '').seats[0]!.name).toBe('Player 1');
    const named = setSeatName(d, 0, 'Bea');
    expect(withPlayerName(named, 'Ana').seats[0]!.name).toBe('Bea');
    expect(withPlayerName(d, 'Ana').seats[1]!.name).toBe(d.seats[1]!.name); // bots untouched
  });
});

describe('setup draft', () => {
  it('defaults to you + bots with unique colours', () => {
    const d = defaultSetup();
    expect(d.seats).toHaveLength(4);
    expect(d.seats[0]).toMatchObject({ name: 'Player 1', controller: 'human' });
    expect(d.seats.slice(1).every((s) => s.controller === 'bot')).toBe(true);
    expect(new Set(colours(d)).size).toBe(4);
    expect(setupError(d)).toBeNull();
  });

  it('adds bots up to the max and removes down to the min', () => {
    let d = defaultSetup(MIN_PLAYERS);
    expect(removeSeat(d, 0)).toBe(d);
    while (d.seats.length < MAX_PLAYERS) d = addSeat(d);
    expect(addSeat(d)).toBe(d);
    expect(new Set(colours(d)).size).toBe(MAX_PLAYERS);
    const fewer = removeSeat(d, 2);
    expect(fewer.seats).toHaveLength(MAX_PLAYERS - 1);
    expect(fewer.seats.map((s) => s.name)).not.toContain(d.seats[2]!.name);
  });

  it('adds a human seat with a human name', () => {
    const d = addSeat(defaultSetup(3), 'human');
    expect(d.seats[3]).toMatchObject({ controller: 'human', name: 'Player 4' });
  });

  it('moves a seat in table order, clamped at the ends', () => {
    const d = defaultSetup();
    const names = d.seats.map((s) => s.name);
    expect(moveSeat(d, 0, -1)).toBe(d);
    expect(moveSeat(d, 0, 1).seats.map((s) => s.name)).toEqual([
      names[1],
      names[0],
      names[2],
      names[3],
    ]);
    expect(moveSeat(d, 3, 5)).toBe(d);
  });

  it('shuffles with the injected random source', () => {
    const d = defaultSetup();
    const s = shuffleSeats(d, () => 0);
    expect(s.seats.map((x) => x.name).sort()).toEqual(d.seats.map((x) => x.name).sort());
    expect(s.seats.map((x) => x.name)).not.toEqual(d.seats.map((x) => x.name));
  });

  it('swaps colours so they stay unique', () => {
    const d = defaultSetup();
    const c1 = d.seats[1]!.color;
    const c0 = d.seats[0]!.color;
    const next = pickSeatColor(d, 0, c1);
    expect(next.seats[0]!.color).toBe(c1);
    expect(next.seats[1]!.color).toBe(c0);
    expect(pickSeatColor(d, 0, '#123456')).toBe(d);
  });

  it('renames default seat names when switching human ⇄ bot', () => {
    const d = defaultSetup();
    const botName = d.seats[1]!.name;
    const human = setController(d, 1, 'human');
    expect(human.seats[1]).toMatchObject({ controller: 'human', name: 'Player 2' });
    expect(setController(human, 1, 'bot').seats[1]!.name).toBe(botName);
    const named = setController(setSeatName(d, 1, 'Ana'), 1, 'human');
    expect(named.seats[1]!.name).toBe('Ana');
  });

  it('needs at least one human', () => {
    const d = setController(defaultSetup(), 0, 'bot');
    expect(setupError(d)).toMatch(/human/);
  });

  it('builds a config with unique trimmed names, bot levels and the timer', () => {
    let d = defaultSetup();
    d = setSeatName(d, 1, '  Ana ');
    d = setSeatName(d, 2, 'ana');
    d = setSeatName(d, 3, '   ');
    d = setTimerIdx(d, TIMER_STEPS.indexOf(45));
    const cfg = buildConfig(d);
    expect(cfg.players.map((p) => p.name)).toEqual(['Player 1', 'Ana', 'ana 2', 'Player 4']);
    expect(cfg.players[0]).not.toHaveProperty('botLevel');
    expect(cfg.players[1]!.botLevel).toBe('normal');
    expect(cfg.pickTimerSec).toBe(45);
    expect(cfg).not.toHaveProperty('seed');
    expect(buildConfig(setSeed(d, ' abc ')).seed).toBe('abc');
  });

  it('summarises the table for the footer', () => {
    expect(summaryLine(defaultSetup())).toBe('Standard · 4 players (3 bots)');
    expect(summaryLine(setTimerIdx(defaultSetup(), TIMER_STEPS.indexOf(60)))).toBe(
      'Standard · 4 players (3 bots) · 1 min picks',
    );
  });
});

describe('setup storage', () => {
  it('round-trips the draft but never the seed', () => {
    const store = memory();
    const d = setSeed(setTimerIdx(addSeat(defaultSetup()), 2), 'replay-me');
    saveSetup(store, d);
    const back = loadSetup(store);
    expect(back).toEqual({ ...d, seed: '' });
  });

  it('falls back to defaults on garbage', () => {
    const store = memory();
    store.data.set(STORAGE_KEY, '{not json');
    expect(loadSetup(store)).toEqual(defaultSetup());
    expect(sanitizeSetup(42)).toEqual(defaultSetup());
    expect(loadSetup(null)).toEqual(defaultSetup());
  });

  it('repairs bad seats, colours and timer', () => {
    const red = SEAT_COLORS[0]!.color;
    const d = sanitizeSetup({
      mode: 'nope',
      timerIdx: 99,
      seats: [
        { name: 'A', color: red, controller: 'human', botLevel: 'godlike' },
        { name: 'B', color: red, controller: 'robot' },
        'junk',
      ],
    });
    expect(d.mode).toBe('standard');
    expect(d.timerIdx).toBe(TIMER_STEPS.length - 1);
    expect(d.seats).toHaveLength(MIN_PLAYERS);
    expect(new Set(d.seats.map((s) => s.color)).size).toBe(MIN_PLAYERS);
    expect(d.seats[0]).not.toHaveProperty('botLevel');
    expect(d.seats[1]!.controller).toBe('bot');
  });

  it('survives a storage that throws', () => {
    const broken: SetupStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(() => saveSetup(broken, defaultSetup())).not.toThrow();
    expect(loadSetup(broken)).toEqual(defaultSetup());
  });
});
