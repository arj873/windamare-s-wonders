/**
 * Where the room server lives, for the online room visit (app.ts). Production: the Cloudflare
 * Worker (net's WebSocket `Connect` and HTTP `RoomApi`, src/net/ws.ts). Dev: net's GameSession in
 * this browser (devBackend.ts), picked by `?server=local` or by default under `pnpm dev`.
 */
import type { Clock, Connect, KeyStore, RoomApi } from '../../net/transport';
import { httpRoomApi, webSocketConnect, type SocketLike } from '../../net/ws';

export interface Backend {
  kind: 'remote' | 'local';
  api: RoomApi;
  connect(roomId: string): Connect;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

function guardedStore(storage: () => Storage): KeyStore {
  return {
    get(key) {
      try {
        return storage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage().setItem(key, value);
      } catch {
        /* private mode or blocked storage: not remembered */
      }
    },
    remove(key) {
      try {
        storage().removeItem(key);
      } catch {
        /* nothing to forget */
      }
    },
  };
}

/** localStorage, every access guarded. */
export const browserKeyStore: KeyStore = guardedStore(() => localStorage);
/** sessionStorage: per tab, survives a reload. */
export const tabKeyStore: KeyStore = guardedStore(() => sessionStorage);

/**
 * Where reconnect tokens live. The dev server's rooms are shared by this browser's tabs, so each
 * tab keeps its own token (two tabs = two players); real rooms use localStorage (two tabs = the
 * same player, the newer tab takes over with `replaced`).
 */
export function tokenStoreFor(kind: Backend['kind']): KeyStore {
  return kind === 'local' ? tabKeyStore : browserKeyStore;
}

/** The Worker under `base` (an origin: this page's, or VITE_ROOM_SERVER). */
export function remoteBackend(base: string): Backend {
  return {
    kind: 'remote',
    api: httpRoomApi(base, (url, init) => fetch(url, init)),
    connect: (roomId) =>
      webSocketConnect(base, roomId, (url) => new WebSocket(url) as unknown as SocketLike),
  };
}

/**
 * `?server=local|remote` wins; otherwise local under `pnpm dev` (unless VITE_ROOM_SERVER is set)
 * and remote in builds.
 */
export function backendKind(search: string, dev: boolean, roomServer?: string): Backend['kind'] {
  const p = new URLSearchParams(search).get('server');
  if (p === 'local' || p === 'remote') return p;
  return dev && !roomServer ? 'local' : 'remote';
}

/** The backend for this page; the dev server's code is only loaded when it is used. */
export async function pickBackend(search: string): Promise<Backend> {
  const env = import.meta.env as { DEV: boolean; VITE_ROOM_SERVER?: string };
  if (backendKind(search, env.DEV, env.VITE_ROOM_SERVER) === 'local') {
    const { localBackend } = await import('./devBackend');
    return localBackend();
  }
  return remoteBackend((env.VITE_ROOM_SERVER ?? location.origin).replace(/\/$/, ''));
}
