import { describe, expect, it } from 'vitest';
import { httpRoomApi, roomSocketUrl, webSocketConnect, type SocketLike } from './ws';

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closedWith: number | null = null;
  private cbs: Record<string, ((e: never) => void)[]> = {};
  constructor(readonly url: string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close(code = 1005) {
    this.closedWith = code;
  }
  addEventListener(type: string, cb: (e: never) => void) {
    (this.cbs[type] ??= []).push(cb);
  }
  emit(type: string, e: unknown = {}) {
    for (const cb of this.cbs[type] ?? []) cb(e as never);
  }
}

describe('roomSocketUrl', () => {
  it('maps http(s) to ws(s) and keeps the host', () => {
    expect(roomSocketUrl('http://localhost:8787', 'ABC234')).toBe(
      'ws://localhost:8787/api/rooms/ABC234/ws',
    );
    expect(roomSocketUrl('https://play.example', 'ABC234')).toBe(
      'wss://play.example/api/rooms/ABC234/ws',
    );
  });
});

describe('webSocketConnect', () => {
  it('relays open, text frames and one close; ignores binary frames', () => {
    let s!: FakeSocket;
    const log: string[] = [];
    const t = webSocketConnect(
      'http://h',
      'ABC234',
      (u) => (s = new FakeSocket(u)),
    )({
      onOpen: () => log.push('open'),
      onMessage: (m) => log.push(`msg:${m}`),
      onClose: (c, r) => log.push(`close:${c}:${r}`),
    });
    expect(s.url).toBe('ws://h/api/rooms/ABC234/ws');
    s.emit('open');
    s.emit('message', { data: 'hi' });
    s.emit('message', { data: new ArrayBuffer(2) });
    t.send('out');
    s.emit('close', { code: 4003, reason: 'replaced' });
    s.emit('error');
    expect(log).toEqual(['open', 'msg:hi', 'close:4003:replaced']);
    expect(s.sent).toEqual(['out']);
    t.close();
    expect(s.closedWith).toBe(1000);
  });

  it('reports 1006 when the socket errors before opening or cannot be created', async () => {
    let s!: FakeSocket;
    const codes: number[] = [];
    webSocketConnect(
      'http://h',
      'ABC234',
      (u) => (s = new FakeSocket(u)),
    )({
      onOpen: () => undefined,
      onMessage: () => undefined,
      onClose: (c) => codes.push(c),
    });
    s.emit('error');
    s.emit('close', { code: 1006, reason: '' });
    expect(codes).toEqual([1006]);

    webSocketConnect('http://h', 'ABC234', () => {
      throw new Error('blocked');
    })({
      onOpen: () => undefined,
      onMessage: () => undefined,
      onClose: (c) => codes.push(c),
    });
    await Promise.resolve();
    expect(codes).toEqual([1006, 1006]);
  });
});

describe('httpRoomApi', () => {
  const reply = (status: number, body: unknown) => async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });

  it('creates a room', async () => {
    const calls: string[] = [];
    const api = httpRoomApi('http://h', async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return reply(201, { roomId: 'ABC234', hostToken: 'tok' })();
    });
    expect(await api.create()).toEqual({ roomId: 'ABC234', hostToken: 'tok' });
    expect(calls).toEqual(['POST http://h/api/rooms']);
  });

  it('turns an error response into an Error with the server message', async () => {
    const api = httpRoomApi('http://h', reply(429, { error: 'too many rooms created' }));
    await expect(api.create()).rejects.toThrow('too many rooms created');
  });

  it('check: null for a missing room, the summary otherwise', async () => {
    expect(
      await httpRoomApi('http://h', reply(404, { error: 'no such room' })).check('ABC234'),
    ).toBeNull();
    const sum = { roomId: 'ABC234', phase: 'lobby', seats: 4, taken: 1, connected: 1 };
    expect(await httpRoomApi('http://h', reply(200, sum)).check('ABC234')).toMatchObject({
      phase: 'lobby',
    });
    await expect(httpRoomApi('http://h', reply(500, null)).check('ABC234')).rejects.toThrow('500');
  });
});
