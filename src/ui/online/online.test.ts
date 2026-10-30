// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { clockMs, type ChatEntry, type RoomInfo } from '../../net/protocol';
import { ChatPanel } from './chat';
import { JoinCard, noticeScreen } from './join';
import { LobbyScreen } from './lobby';
import {
  BOT_LEVEL_OPTIONS,
  configSummary,
  inviteUrl,
  lobbyView,
  seatColor,
  TIMER_OPTIONS,
  timerHint,
  withBotLevel,
  withColour,
  withDefaultLevels,
  withSeatCount,
} from './lobbyModel';
import { errorText, fatalText } from './messages';

const RANGE = { min: 2, max: 7 };

function room(over: Partial<RoomInfo> = {}): RoomInfo {
  return {
    id: 'K7QF2M',
    phase: 'lobby',
    host: 'm1',
    config: { seatCount: 4, timer: 'normal' },
    seats: [
      { occupant: 'm1', status: 'human' },
      { occupant: 'm2', status: 'human' },
      { occupant: null, status: 'bot' },
      { occupant: null, status: 'bot' },
    ],
    members: [
      { id: 'm1', name: 'Ann', seat: 0, connected: true },
      { id: 'm2', name: 'Bob', seat: 1, connected: false },
      { id: 'm3', name: 'Cy', seat: null, connected: true },
      { id: 'm4', name: null, seat: null, connected: true },
    ],
    ...over,
  };
}

describe('lobbyView', () => {
  it('shows seats, the host and who is away', () => {
    const v = lobbyView(room(), 'm1', RANGE);
    expect(v.isHost).toBe(true);
    expect(v.seats.map((s) => s.name)).toEqual(['Ann', 'Bob', null, null]);
    expect(v.seats[0]?.isMine && v.seats[0].isHostSeat).toBe(true);
    expect(v.seats[1]?.isAway).toBe(true);
    // Only the last open seat can be removed, and only by the host.
    expect(v.seats.map((s) => s.canRemove)).toEqual([false, false, false, true]);
    expect(v.canAddSeat).toBe(true);
    expect(v.startBlocked).toBeNull();
    expect(v.humans).toBe(2);
    expect(v.bots).toBe(2);
    // Spectators need a nickname to be listed.
    expect(v.spectators.map((m) => m.name)).toEqual(['Cy']);
  });

  it('gives a guest no host buttons and a watcher the first open seat', () => {
    const v = lobbyView(room(), 'm3', RANGE);
    expect(v.isHost).toBe(false);
    expect(v.canAddSeat).toBe(false);
    expect(v.seats.some((s) => s.canRemove)).toBe(false);
    expect(v.startBlocked).toBe('Only the host can start');
    expect(v.watching).toEqual({ named: true, openSeat: 2 });
    expect(v.seats[2]?.canSit).toBe(true);
    // No nickname: no seat.
    const anon = lobbyView(room(), 'm4', RANGE);
    expect(anon.watching).toEqual({ named: false, openSeat: 2 });
    expect(anon.seats[2]?.canSit).toBe(false);
  });

  it('blocks Start with nobody seated, and stops growing at the max', () => {
    const empty = room({
      seats: [
        { occupant: null, status: 'bot' },
        { occupant: null, status: 'bot' },
      ],
      config: { seatCount: 2, timer: 'off' },
    });
    const v = lobbyView(empty, 'm1', RANGE);
    expect(v.startBlocked).toBe('Someone has to take a seat first');
    expect(v.seats.some((s) => s.canRemove)).toBe(false); // already at the minimum
    const full = room({
      config: { seatCount: 2, timer: 'off' },
      seats: [
        { occupant: 'm1', status: 'human' },
        { occupant: 'm2', status: 'human' },
      ],
    });
    const f = lobbyView(full, 'm1', { min: 2, max: 2 });
    expect(f.canAddSeat).toBe(false);
    expect(f.tableFull).toBe(true);
    expect(f.inviteNote).toMatch(/full/);
  });

  it('seat colours and bot levels come from the room (N4), with old-server fallbacks', () => {
    // No colour / level on the wire (an older server): table order, easy.
    const old = lobbyView(room(), 'm1', RANGE);
    expect(old.seats.map((s) => s.colour)).toEqual([0, 1, 2, 3]);
    expect(old.seats.map((s) => s.botLevel)).toEqual(['easy', 'easy', 'easy', 'easy']);
    const r = room({
      seats: [
        { occupant: 'm1', status: 'human', colour: 4, botLevel: 'easy' },
        { occupant: 'm2', status: 'human', colour: 0, botLevel: 'easy' },
        { occupant: null, status: 'bot', colour: 1, botLevel: 'hard' },
        { occupant: null, status: 'bot', colour: 2, botLevel: 'medium' },
      ],
    });
    const v = lobbyView(r, 'm1', RANGE);
    expect(v.seats.map((s) => s.colour)).toEqual([4, 0, 1, 2]);
    expect(v.seats[0]?.color).toBe(seatColor(4).color);
    expect(v.seats[0]?.colorLabel).toBe(seatColor(4).name);
    expect(v.seats.map((s) => s.botLevel)).toEqual(['easy', 'easy', 'hard', 'medium']);
    // Host: levels on open seats only; colours on every seat.
    expect(v.seats.map((s) => s.canSetLevel)).toEqual([false, false, true, true]);
    expect(v.seats.every((s) => s.canSetColour)).toBe(true);
    const guest = lobbyView(r, 'm2', RANGE);
    expect(guest.seats.some((s) => s.canSetLevel || s.canSetColour)).toBe(false);
    // Net's medium is the setup screen's Normal, in the same words as hotseat.
    expect(BOT_LEVEL_OPTIONS.map((o) => [o.id, o.label])).toEqual([
      ['easy', 'Easy'],
      ['medium', 'Normal'],
      ['hard', 'Hard'],
    ]);
    // Config edits: one seat's level; a colour another seat has swaps the two (net wants them
    // all different); a smaller table trims both lists (net refuses longer ones).
    expect(withBotLevel(r, 3, 'hard').botLevels).toEqual(['easy', 'easy', 'hard', 'hard']);
    expect(withColour(r, 0, 1).colours).toEqual([1, 0, 4, 2]);
    expect(withColour(r, 0, 7).colours).toEqual([7, 0, 1, 2]);
    const trimmed = withSeatCount(withBotLevel(r, 3, 'hard'), 3);
    expect(trimmed).toEqual({ seatCount: 3, timer: 'normal', botLevels: ['easy', 'easy', 'hard'] });
    expect(withSeatCount({ ...r.config, colours: [4, 0, 1, 2] }, 2).colours).toEqual([4, 0]);
    expect(withSeatCount(r.config, 5)).toEqual({ seatCount: 5, timer: 'normal' });
    // Online bots default to Normal (net's medium); a bigger table's new seats get it too.
    expect(withDefaultLevels(r.config).botLevels).toEqual(['medium', 'medium', 'medium', 'medium']);
    const grown = withSeatCount({ ...r.config, botLevels: ['easy', 'hard'] }, 3);
    expect(grown.botLevels).toEqual(['easy', 'hard', 'medium']);
  });

  it('summarises the config and builds the invite link', () => {
    expect(configSummary({ seatCount: 4, timer: 'fast' }, 1)).toBe(
      '4 towns · 1 player + 3 bots · Fast clock',
    );
    // The setup screen's words: "Off", and no clock part in the summary (R8 #5).
    expect(configSummary({ seatCount: 3, timer: 'off' }, 3)).toBe('3 towns · 3 players');
    expect(TIMER_OPTIONS.map((t) => t.label)).toEqual(['Off', 'Relaxed', 'Normal', 'Fast']);
    expect(timerHint('normal')).toBe(
      `${(clockMs('normal', 'pick', 0) ?? 0) / 1000} s for the first pick`,
    );
    expect(timerHint('off')).toBe('picks wait for everyone');
    expect(inviteUrl('http://x.dev/play?debug=1&server=local#a', 'K7QF2M')).toBe(
      'http://x.dev/play?room=K7QF2M&server=local',
    );
  });
});

describe('messages', () => {
  it('words errors and stays quiet where the client recovers', () => {
    expect(errorText('not_joined', '')).toBeNull();
    expect(errorText('not_seated', '', 'start')).toMatch(/take a seat before/);
    expect(errorText('kicked', '')).toBe(fatalText('kicked'));
  });
});

describe('LobbyScreen', () => {
  function mount(r: RoomInfo, me: string) {
    const actions = {
      setName: vi.fn(),
      takeSeat: vi.fn(),
      leaveSeat: vi.fn(),
      configure: vi.fn(),
      start: vi.fn(),
      leave: vi.fn(),
      kick: vi.fn(),
    };
    const copy = vi.fn(() => Promise.resolve());
    let answer = true;
    const confirm = vi.fn(() => Promise.resolve(answer));
    const lobby = new LobbyScreen({
      roomId: r.id,
      inviteUrl: `http://x.dev/?room=${r.id}`,
      range: RANGE,
      actions,
      chat: document.createElement('div'),
      copy,
      confirm,
    });
    document.body.replaceChildren(lobby.element);
    lobby.update(r, me);
    const q = (k: string) => lobby.element.querySelector<HTMLElement>(`[data-k="${k}"]`);
    const setAnswer = (yes: boolean) => (answer = yes);
    return { lobby, actions, copy, confirm, setAnswer, q };
  }

  it('host: remove a player or a watcher, after confirming', async () => {
    const { actions, confirm, setAnswer, q } = mount(room(), 'm1');
    // Not on your own seat; not on open seats.
    expect(q('kick-seat-0')).toBeNull();
    expect(q('kick-seat-2')).toBeNull();
    setAnswer(false);
    q('kick-seat-1')?.click();
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledWith('Remove Bob?', expect.stringContaining('loses'), 'Remove');
    expect(actions.kick).not.toHaveBeenCalled();
    setAnswer(true);
    q('kick-seat-1')?.click();
    await vi.waitFor(() => expect(actions.kick).toHaveBeenCalledWith('m2'));
    q('kick-m3')?.click();
    await vi.waitFor(() => expect(actions.kick).toHaveBeenLastCalledWith('m3'));
  });

  it('guests get no kick buttons; an offline host is explained', () => {
    const offline = room({
      members: [
        { id: 'm1', name: 'Ann', seat: 0, connected: false },
        { id: 'm2', name: 'Bob', seat: 1, connected: true },
      ],
    });
    const { lobby, q } = mount(offline, 'm2');
    expect(lobby.element.querySelector('[data-k^="kick-"]')).toBeNull();
    expect(q('config-note')?.textContent).toMatch(/Ann\) is offline.*another player here becomes/);
    expect(lobbyView(offline, 'm2', RANGE).hostAway).toBe(true);
    expect(lobbyView(offline, 'm1', RANGE).hostAway).toBe(false); // the host sees their own room
  });

  it('host: add / remove bots, clock preset, start, copy link', async () => {
    const { actions, copy, q } = mount(room(), 'm1');
    // Each edit shows at once and the next builds on it, before the server answers.
    q('add-bot')?.click();
    expect(actions.configure).toHaveBeenLastCalledWith({ seatCount: 5, timer: 'normal' });
    expect(q('seat-4')).not.toBeNull();
    q('remove-bot')?.click();
    q('remove-bot')?.click();
    expect(actions.configure).toHaveBeenLastCalledWith({ seatCount: 3, timer: 'normal' });
    expect(q('seat-3')).toBeNull();
    q('timer-fast')?.focus();
    q('timer-fast')?.click();
    expect(actions.configure).toHaveBeenLastCalledWith({ seatCount: 3, timer: 'fast' });
    expect(q('timer-fast')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(q('timer-fast')); // focus survives the re-render
    q('lobby-start')?.click();
    expect(actions.start).toHaveBeenCalled();
    q('copy')?.click();
    await Promise.resolve();
    expect(copy).toHaveBeenCalledWith('http://x.dev/?room=K7QF2M');
    expect(q('copy')?.textContent).toBe('Copied!');
    expect(q('summary')?.textContent).toBe('Online · 3 towns · 2 players + 1 bot · Fast clock');
  });

  it('host: bot level on open seats, seat colours with swap', () => {
    const r = room({
      seats: [
        { occupant: 'm1', status: 'human', colour: 0, botLevel: 'easy' },
        { occupant: 'm2', status: 'human', colour: 1, botLevel: 'easy' },
        { occupant: null, status: 'bot', colour: 2, botLevel: 'medium' },
        { occupant: null, status: 'bot', colour: 3, botLevel: 'easy' },
      ],
    });
    const { lobby, actions, q } = mount(r, 'm1');
    // Everyone reads the level on an open seat; the host also gets the picker there only.
    expect(q('seat-2')?.textContent).toContain('a Normal bot plays it');
    expect(q('seat-3')?.textContent).toContain('an Easy bot plays it');
    expect(q('level-0')).toBeNull();
    const level = q('level-2') as HTMLSelectElement;
    expect(level.value).toBe('medium');
    level.value = 'hard';
    level.dispatchEvent(new Event('change'));
    expect(actions.configure).toHaveBeenLastCalledWith({
      seatCount: 4,
      timer: 'normal',
      botLevels: ['easy', 'easy', 'hard', 'easy'],
    });
    // Colour: the dot opens the palette; a free colour is taken, a used one swaps.
    expect(q('swatch-0-5')).toBeNull();
    q('colour-0')?.click();
    expect(q('colour-0')?.getAttribute('aria-expanded')).toBe('true');
    expect(q('swatch-0-0')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('swatch-0-1')?.getAttribute('aria-label')).toMatch(/swap with seat 2 \(Bob\)/);
    // Each edit builds on the last one, before the server echoes it (the level stays Hard).
    const botLevels = ['easy', 'easy', 'hard', 'easy'];
    q('swatch-0-5')?.click();
    expect(actions.configure).toHaveBeenLastCalledWith({
      seatCount: 4,
      timer: 'normal',
      botLevels,
      colours: [5, 1, 2, 3],
    });
    expect(q('swatch-0-5')).toBeNull(); // closed after a pick
    expect(q('seat-0')?.style.getPropertyValue('--seat')).toBe(seatColor(5).color);
    q('colour-3')?.click();
    q('swatch-3-1')?.click();
    expect(actions.configure).toHaveBeenLastCalledWith({
      seatCount: 4,
      timer: 'normal',
      botLevels,
      colours: [5, 3, 2, 1],
    });
    // The palette stays open across a room update; Escape closes it.
    q('colour-1')?.click();
    lobby.update(r, 'm1');
    expect(q('swatch-1-0')).not.toBeNull();
    q('swatch-1-0')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('swatch-1-0')).toBeNull();
    // A guest sees colours but cannot change them, and has no level picker.
    const guest = mount(r, 'm2');
    expect(guest.q('colour-0')).toBeNull();
    expect(guest.q('level-2')).toBeNull();
    expect(guest.q('seat-0')?.querySelector('.ol-dot')?.getAttribute('aria-label')).toBe(
      seatColor(0).name,
    );
  });

  it('guest watching: sit here, read-only settings, waiting for the host', () => {
    const { actions, q } = mount(room(), 'm3');
    expect(q('watching')?.hidden).toBe(false);
    q('watch-sit')?.click();
    expect(actions.takeSeat).toHaveBeenCalledWith(2);
    expect(q('add-bot')).toBeNull();
    expect(q('lobby-start')).toBeNull();
    expect((q('timer-fast') as HTMLButtonElement).disabled).toBe(true);
    expect(q('waiting-host')?.textContent).toContain('Waiting for Ann to start');
  });

  it('saves a new nickname, not an unchanged one', () => {
    const { actions, q } = mount(room(), 'm2');
    const input = q('nickname') as HTMLInputElement;
    expect(input.value).toBe('Bob');
    q('save-name')?.click();
    expect(actions.setName).not.toHaveBeenCalled();
    input.value = '  Bobby ';
    q('save-name')?.click();
    expect(actions.setName).toHaveBeenCalledWith('Bobby');
  });
});

describe('ChatPanel', () => {
  const entry = (id: number, from: string | null, name: string, text: string): ChatEntry => ({
    id,
    at: 0,
    from,
    name,
    text,
  });

  it('renders text as text, drops repeats, flags lines from others', () => {
    const incoming = vi.fn();
    const send = vi.fn(() => true);
    const chat = new ChatPanel({
      send,
      react: vi.fn(() => true),
      colorOf: () => '#d64541',
      me: () => 'm1',
      onIncoming: incoming,
      time: () => '',
    });
    chat.setEntries([entry(1, null, '', 'Ann joined')]);
    chat.add(entry(2, 'm2', 'Bob', '<b>hi</b>'));
    chat.add(entry(2, 'm2', 'Bob', '<b>hi</b>'));
    chat.add(entry(3, 'm1', 'Ann', 'hello'));
    const rows = [...chat.element.querySelectorAll('.ol-chat-row')].map((r) => r.textContent);
    expect(rows).toEqual(['Ann joined', 'Bob <b>hi</b>', 'Ann hello']);
    expect(chat.element.querySelector('b b')).toBeNull();
    expect(incoming).toHaveBeenCalledTimes(1);
    const input = chat.element.querySelector<HTMLInputElement>('[data-k="chat-input"]');
    if (!input) throw new Error('no input');
    input.value = ' yo ';
    chat.element.querySelector<HTMLElement>('[data-k="chat-send"]')?.click();
    expect(send).toHaveBeenCalledWith('yo');
    expect(input.value).toBe('');
    chat.setEnabled(false, 'Pick a nickname to chat.');
    expect(input.disabled).toBe(true);
  });
});

describe('JoinCard and notices', () => {
  it('invite: needs a nickname, then joins or watches', () => {
    const onJoin = vi.fn();
    const onWatch = vi.fn();
    const card = new JoinCard({
      name: '',
      invite: { roomId: 'K7QF2M', playing: false },
      onJoin,
      onWatch,
    });
    const q = (k: string) => card.element.querySelector<HTMLElement>(`[data-k="${k}"]`);
    q('join')?.click();
    expect(onJoin).not.toHaveBeenCalled();
    expect(q('join-error')?.textContent).toMatch(/nickname/);
    (q('join-name') as HTMLInputElement).value = 'Bob';
    q('join')?.click();
    expect(onJoin).toHaveBeenCalledWith('Bob', 'K7QF2M');
    q('join-watch')?.click();
    expect(onWatch).toHaveBeenCalledWith('K7QF2M', 'Bob');
  });

  it('invite to a game in progress: Watch only, a nickname is optional', () => {
    const onWatch = vi.fn();
    const card = new JoinCard({
      name: '',
      invite: { roomId: 'K7QF2M', playing: true },
      onJoin: vi.fn(),
      onWatch,
    });
    const q = (k: string) => card.element.querySelector<HTMLElement>(`[data-k="${k}"]`);
    expect(q('join')).toBeNull();
    q('join-watch')?.click();
    expect(onWatch).toHaveBeenCalledWith('K7QF2M', '');
  });

  it('start card: create, or join a typed code / pasted link', () => {
    const onJoin = vi.fn();
    const onCreate = vi.fn();
    const card = new JoinCard({ name: 'Ann', onJoin, onCreate });
    const q = (k: string) => card.element.querySelector<HTMLElement>(`[data-k="${k}"]`);
    q('create')?.click();
    expect(onCreate).toHaveBeenCalledWith('Ann');
    (q('join-code') as HTMLInputElement).value = 'nope';
    q('join')?.click();
    expect(onJoin).not.toHaveBeenCalled();
    (q('join-code') as HTMLInputElement).value = 'https://x.dev/?room=k7qf2m';
    q('join')?.click();
    expect(onJoin).toHaveBeenCalledWith('Ann', 'K7QF2M');
  });

  it('notice screen buttons', () => {
    const home = vi.fn();
    const el = noticeScreen('Room not found', 'gone', [{ label: 'Home', onClick: home }]);
    el.querySelector<HTMLElement>('[data-k="notice-home"]')?.click();
    expect(home).toHaveBeenCalled();
    expect(el.textContent).toContain('gone');
  });
});
