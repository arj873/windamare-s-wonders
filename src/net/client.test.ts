import { describe, expect, it } from 'vitest';
import { toy } from '../engine/core/testing/helpers';
import type { ToySeat, ToyTable } from '../engine/core/testing/toy';
import { backoffDelay, RoomClient, type ClientEvent, type RoomClientOptions } from './client';
import { FakeClock, hostConnect, RoomHost } from './loopback';
import { DEFAULT_ROOM_CONFIG, type ServerMessage } from './protocol';
import { GameSession } from './session';
import { fakeDeps } from './testHarness';
import { parseRoomCode, tokenKey, type KeyStore, type TransportHandlers } from './transport';

const GRACE = 10_000;
type Client = RoomClient<ToySeat, ToyTable>;

function memStore(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

/** A room on a fake clock, plus a factory for clients connected to it. */
function world() {
  const clock = new FakeClock(1000);
  const { session, hostToken } = GameSession.create('room1', clock.now(), toy, fakeDeps(), {
    graceMs: GRACE,
    botDelayMs: 200,
  });
  const host = new RoomHost(session, clock);
  let offline = false;
  let prefix = 0;
  const client = (name: string, store = memStore(), extra: Partial<RoomClientOptions> = {}) => {
    const events: ClientEvent<ToySeat, ToyTable>[] = [];
    const c: Client = new RoomClient({
      roomId: 'room1',
      connect: hostConnect(host, clock, { offline: () => offline, prefix: `p${++prefix}-` }),
      clock,
      store,
      name,
      pingMs: 0,
      ...extra,
    });
    c.on((e) => events.push(e));
    c.start();
    return { c, store, events };
  };
  return { clock, host, session, hostToken, client, setOffline: (v: boolean) => (offline = v) };
}

/** Ann (host, seat 0) and Bob (seat 1) in a started 3-seat game; seat 2 is a bot. */
function game() {
  const w = world();
  const annStore = memStore();
  annStore.set(tokenKey('room1'), w.hostToken);
  const ann = w.client('Ann', annStore);
  const bob = w.client('Bob');
  w.clock.flush();
  ann.c.configure({ ...DEFAULT_ROOM_CONFIG, seatCount: 3 });
  w.clock.flush();
  ann.c.startGame();
  w.clock.flush();
  return { w, ann, bob };
}

const sell = (c: Client) => {
  const v = c.game!.view;
  return { card: v.seats[c.mySeat!]!.hand[0]!.id, use: 'sell' };
};

describe('parseRoomCode', () => {
  it('takes codes and invite links', () => {
    expect(parseRoomCode(' k3j9qx ')).toBe('K3J9QX');
    expect(parseRoomCode('https://x.dev/?room=K3J9QX')).toBe('K3J9QX');
    expect(parseRoomCode('https://x.dev/room/K3J9QX')).toBe('K3J9QX');
    expect(parseRoomCode('')).toBeNull();
    expect(parseRoomCode('K3J9Q0')).toBeNull(); // 0, O, 1 and I are not in the alphabet
    expect(parseRoomCode('%E0%A4%A')).toBeNull();
  });
});

describe('backoffDelay', () => {
  it('doubles up to the cap', () => {
    const b = { baseMs: 500, maxMs: 4000, factor: 2 };
    expect([1, 2, 3, 4, 5, 9].map((n) => backoffDelay(n, b))).toEqual([
      500, 1000, 2000, 4000, 4000, 4000,
    ]);
  });
});

describe('RoomClient over the loopback room', () => {
  it('joins with the host token, stores it, and sees the lobby', () => {
    const w = world();
    const store = memStore();
    store.set(tokenKey('room1'), w.hostToken);
    const { c, events } = w.client('Ann', store);
    expect(c.status).toBe('connecting');
    w.clock.flush();
    expect(c.status).toBe('open');
    expect(c.isHost).toBe(true);
    expect(c.me?.name).toBe('Ann');
    expect(c.room?.phase).toBe('lobby');
    expect(events.map((e) => e.type)).toContain('room');
    expect(store.get(tokenKey('room1'))).toBe(w.hostToken);
    expect(tokenKey('room1')).toBe('windamere.mp.token.room1');
  });

  it('a new member gets and keeps a token; leave() forgets it', () => {
    const w = world();
    const { c, store } = w.client('Bob');
    w.clock.flush();
    expect(c.isHost).toBe(false);
    expect(store.get(tokenKey('room1'))).toBe(c.you?.token);
    c.leave();
    expect(store.get(tokenKey('room1'))).toBeNull();
    expect(c.status).toBe('closed');
  });

  it('lobby to table: each client gets only its own view; picks hide, then reveal', () => {
    const { w, ann, bob } = game();
    expect(ann.c.room?.phase).toBe('playing');
    expect(ann.c.game?.view.view.viewer).toBe(0);
    expect(bob.c.game?.view.view.viewer).toBe(1);
    expect(ann.c.game?.waiting).toEqual([0, 1, 2]);
    expect(ann.c.game?.legal.length).toBeGreaterThan(0);

    expect(ann.c.pick(sell(ann.c))).toBe(true);
    w.clock.flush();
    expect(ann.c.game!.view.seats[0]!.pick).not.toBeNull(); // own pick shows
    expect(bob.c.game!.view.seats[0]!.pick).toBeNull(); // not to Bob
    expect(bob.c.game!.view.view.submitted).toEqual([true, false, false]);

    expect(ann.c.unpick()).toBe(true);
    w.clock.flush();
    expect(bob.c.game!.view.view.submitted[0]).toBe(false);

    ann.c.pick(sell(ann.c));
    bob.c.pick(sell(bob.c));
    w.clock.advance(1000);
    expect(ann.c.game!.view.turn).toBe(1);
    const reveals = ann.events.filter((e) => e.type === 'reveal');
    expect(reveals).toHaveLength(1);
    const atReveal = ann.events.find((e) => e.type === 'game' && e.game.view.turn === 1);
    expect(atReveal).toMatchObject({ prev: { view: { turn: 0 } } });
  });

  it('server errors reach the UI as events', () => {
    const w = world();
    const { c, events } = w.client('Eve');
    w.clock.flush();
    c.startGame();
    w.clock.flush();
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'not_host',
      ref: 'start',
    });
    expect(c.status).toBe('open');
  });

  it('reconnects with backoff after a drop and keeps the same member', () => {
    const w = world();
    const { c, events } = w.client('Bob');
    w.clock.flush();
    const member = c.you!.member;
    w.setOffline(true);
    w.host.cut(w.host.conns()[0]!);
    w.clock.flush();
    expect(c.status).toBe('reconnecting');
    w.clock.advance(500);
    expect(c.attempts).toBe(2);
    w.clock.advance(1000);
    expect(c.attempts).toBe(3);
    w.setOffline(false);
    w.clock.advance(1999);
    expect(c.status).toBe('reconnecting');
    w.clock.advance(1);
    expect(c.status).toBe('open');
    expect(c.attempts).toBe(0);
    expect(c.you!.member).toBe(member);
    const statuses = events.filter((e) => e.type === 'status').map((e) => e.status);
    expect(statuses).toEqual(['open', 'reconnecting', 'open']);
  });

  it('retryNow skips the wait', () => {
    const w = world();
    const { c } = w.client('Bob');
    w.clock.flush();
    w.host.cut(w.host.conns()[0]!);
    w.clock.flush();
    expect(c.status).toBe('reconnecting');
    c.retryNow();
    w.clock.flush();
    expect(c.status).toBe('open');
  });

  it('after a reconnect the first game event carries the own pending pick', () => {
    const { w, bob } = game();
    const pick = sell(bob.c);
    bob.c.pick(pick);
    w.clock.flush();
    w.host.cut(w.host.conns().find((x) => x.startsWith('p2-'))!);
    w.clock.flush();
    bob.c.retryNow();
    w.clock.flush();
    expect(bob.c.status).toBe('open');
    expect(bob.c.game!.view.seats[1]!.pick).toEqual(pick);
    expect(bob.c.game!.view.view.submitted[1]).toBe(true);
  });

  it('mid-game: away within the grace, a bot after it, reclaimed on reconnect', () => {
    const { w, ann, bob } = game();
    w.setOffline(true);
    w.host.cut(w.host.conns().find((x) => x.startsWith('p2-'))!);
    w.clock.flush();
    expect(ann.c.room?.seats[1]?.status).toBe('away');
    w.clock.advance(GRACE + 1);
    expect(ann.c.room?.seats[1]?.status).toBe('bot');
    expect(ann.c.chat.some((e) => /Bob is away/.test(e.text))).toBe(true);
    w.setOffline(false);
    bob.c.retryNow();
    w.clock.advance(20_000);
    expect(bob.c.status).toBe('open');
    expect(ann.c.room?.seats[1]?.status).toBe('human');
    expect(bob.c.game?.view.view.viewer).toBe(1);
  });

  it('stops for good on a fatal close (another tab took over)', () => {
    const w = world();
    const store = memStore();
    const first = w.client('Bob', store);
    w.clock.flush();
    const second = w.client('Bob', store);
    w.clock.flush();
    expect(second.c.status).toBe('open');
    expect(first.c.status).toBe('closed');
    expect(first.c.fatal?.code).toBe('replaced');
    expect(first.events.filter((e) => e.type === 'fatal')).toHaveLength(1);
    w.clock.advance(60_000);
    expect(first.c.status).toBe('closed');
    expect(w.host.connections).toBe(1);
  });

  it('spectators get the spectator view and no legal actions; chat reaches players', () => {
    const { w, ann } = game();
    const eve = w.client('Eve').c;
    w.clock.flush();
    expect(eve.mySeat).toBeNull();
    expect(eve.game?.view.view.viewer).toBeNull();
    expect(eve.game?.legal).toEqual([]);
    expect(eve.chatSend('hi all')).toBe(true);
    w.clock.flush();
    expect(ann.c.chat.at(-1)?.text).toBe('hi all');
  });

  it('reactions are broadcast; sending while closed returns false', () => {
    const w = world();
    const ann = w.client('Ann');
    const bob = w.client('Bob');
    w.clock.flush();
    ann.c.react('clap');
    w.clock.flush();
    expect(bob.events.find((e) => e.type === 'reaction')).toMatchObject({ reaction: 'clap' });
    ann.c.close();
    expect(ann.c.react('gg')).toBe(false);
    expect(ann.c.status).toBe('closed');
  });

  it('the turn clock counts down from the arrival time', () => {
    const { ann } = game();
    const t = ann.c.game!.timer!;
    expect(t.totalMs).toBe(90_000);
    expect(ann.c.timerLeftMs(ann.c.game!.receivedAt + 1500)).toBe(t.remainingMs - 1500);
    expect(ann.c.timerLeftMs(ann.c.game!.receivedAt + 10 ** 7)).toBe(0);
  });

  it('dead socket detection: no frames for deadMs -> reconnect', () => {
    const clock = new FakeClock(0);
    let opened = 0;
    const sent: string[] = [];
    let handlers: TransportHandlers | null = null;
    const c = new RoomClient({
      roomId: 'r1x',
      clock,
      pingMs: 1000,
      deadMs: 3000,
      connect: (h) => {
        opened++;
        handlers = h;
        clock.setTimeout(() => h.onOpen(), 0);
        return { send: (t) => sent.push(t), close: () => undefined };
      },
    });
    c.start();
    clock.flush();
    const welcome: ServerMessage = {
      v: 1,
      type: 'welcome',
      you: { member: 'm1', token: 'tok0000000000000001' },
      room: {
        id: 'r1x',
        phase: 'lobby',
        host: 'm1',
        config: DEFAULT_ROOM_CONFIG,
        seats: [],
        members: [],
      },
      chat: [],
    };
    handlers!.onMessage(JSON.stringify(welcome));
    expect(c.status).toBe('open');
    clock.advance(1000);
    expect(sent.at(-1)).toBe('ping');
    clock.advance(2000);
    expect(c.status).toBe('reconnecting');
    clock.advance(500);
    expect(opened).toBe(2);
  });

  it('a wrong protocol version is fatal', () => {
    const clock = new FakeClock(0);
    let handlers: TransportHandlers | null = null;
    const c = new RoomClient({
      roomId: 'r1x',
      clock,
      connect: (h) => {
        handlers = h;
        clock.setTimeout(() => h.onOpen(), 0);
        return { send: () => undefined, close: () => undefined };
      },
    });
    c.start();
    clock.flush();
    handlers!.onMessage(JSON.stringify({ v: 99, type: 'room' }));
    expect(c.status).toBe('closed');
    expect(c.fatal?.code).toBe('version_mismatch');
  });
});
