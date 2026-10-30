/**
 * The browser's side of the wire: a `Connect` over WebSocket and a `RoomApi` over fetch
 * (docs/MULTIPLAYER.md §18.1). Both take the platform pieces as arguments so tests (and Node
 * scripts) can pass fakes; the UI passes `globalThis.WebSocket` and `fetch`.
 */
import { roomApiPath, roomSocketPath, type CreateRoomResponse, type RoomSummary } from './api';
import type { Connect, RoomApi } from './transport';

/** The slice of the WebSocket API we use. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'error', cb: () => void): void;
  addEventListener(type: 'message', cb: (e: { data: unknown }) => void): void;
  addEventListener(type: 'close', cb: (e: { code: number; reason: string }) => void): void;
}
export type SocketFactory = (url: string) => SocketLike;

/**
 * `ws://host/api/rooms/<code>/ws` (or `wss:` for https). `base` is the page's origin, or the
 * Worker's when it is hosted elsewhere.
 */
export function roomSocketUrl(base: string, roomId: string): string {
  const u = new URL(roomSocketPath(roomId), base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

/**
 * Every reconnect calls the returned function again, which opens a fresh socket. A socket that
 * fails to open reports close code 1006, like a dropped one, so the client retries with backoff.
 */
export function webSocketConnect(base: string, roomId: string, make: SocketFactory): Connect {
  return (handlers) => {
    let closed = false;
    const once = (code: number, reason: string) => {
      if (closed) return;
      closed = true;
      handlers.onClose(code, reason);
    };
    let ws: SocketLike;
    try {
      ws = make(roomSocketUrl(base, roomId));
    } catch {
      queueMicrotask(() => once(1006, 'cannot open'));
      return { send: () => undefined, close: () => undefined };
    }
    ws.addEventListener('open', () => {
      if (!closed) handlers.onOpen();
    });
    ws.addEventListener('message', (e) => {
      // Binary frames are not part of the protocol.
      if (!closed && typeof e.data === 'string') handlers.onMessage(e.data);
    });
    ws.addEventListener('close', (e) => once(e.code, e.reason));
    ws.addEventListener('error', () => once(1006, 'socket error'));
    return {
      send: (text) => {
        try {
          ws.send(text);
        } catch {
          // closing; the close event follows
        }
      },
      close: () => {
        try {
          ws.close(1000, 'bye');
        } catch {
          // already closed
        }
      },
    };
  };
}

export type FetchLike = (
  url: string,
  init?: { method?: string },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

/** `POST /api/rooms` and `GET /api/rooms/:code`. Errors throw with the server's message. */
export function httpRoomApi(base: string, doFetch: FetchLike): RoomApi {
  const url = (path: string) => new URL(path, base).toString();
  const fail = async (res: { status: number; json(): Promise<unknown> }): Promise<never> => {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof body?.error === 'string' ? body.error : `server answered ${res.status}`);
  };
  return {
    async create(): Promise<CreateRoomResponse> {
      const res = await doFetch(url('/api/rooms'), { method: 'POST' });
      if (res.status !== 201) return fail(res);
      return (await res.json()) as CreateRoomResponse;
    },
    async check(roomId: string): Promise<Pick<RoomSummary, 'phase'> | null> {
      const res = await doFetch(url(roomApiPath(roomId)));
      if (res.status === 404) return null;
      if (!res.ok) return fail(res);
      return (await res.json()) as RoomSummary;
    },
  };
}
