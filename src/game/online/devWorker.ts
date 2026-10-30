/**
 * SharedWorker hosting the dev rooms, so every tab of `pnpm dev` talks to the same
 * GameSessions (open the invite link in a second tab = a second player). A tab's connections
 * close on `pagehide`; connections of tabs that died without saying so are dropped after
 * DEV_IDLE_MS of silence.
 */
import { DevServer } from './devServer';
import { DEV_IDLE_MS, type TabToWorker, type WorkerToTab } from './devWire';

const server = new DevServer();
const conns = new Map<string, { room: string; port: MessagePort; lastSeen: number }>();

function post(port: MessagePort, msg: WorkerToTab): void {
  port.postMessage(msg);
}

function onMessage(port: MessagePort, msg: TabToWorker): void {
  switch (msg.t) {
    case 'create':
      post(port, { t: 'reply', id: msg.id, result: server.create() });
      return;
    case 'check':
      post(port, { t: 'reply', id: msg.id, result: server.check(msg.room) });
      return;
    case 'open': {
      const ok = server.attach(msg.room, msg.conn, {
        message: (text) => post(port, { t: 'msg', conn: msg.conn, text }),
        close: (code, reason) => {
          conns.delete(msg.conn);
          post(port, { t: 'closed', conn: msg.conn, code, reason });
        },
      });
      if (ok) conns.set(msg.conn, { room: msg.room, port, lastSeen: Date.now() });
      else post(port, { t: 'closed', conn: msg.conn, code: 4004, reason: 'no such room' });
      return;
    }
    case 'send': {
      const c = conns.get(msg.conn);
      if (!c) return;
      c.lastSeen = Date.now();
      server.frame(c.room, msg.conn, msg.text);
      return;
    }
    case 'close': {
      const c = conns.get(msg.conn);
      if (!c) return;
      conns.delete(msg.conn);
      server.detach(c.room, msg.conn);
      return;
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [conn, c] of conns) {
    if (now - c.lastSeen > DEV_IDLE_MS) server.cut(c.room, conn);
  }
}, 10_000);

// The webworker lib is not in tsconfig (it clashes with DOM): type the one hook we need.
(self as unknown as { onconnect: (e: MessageEvent) => void }).onconnect = (e) => {
  const port = e.ports[0];
  if (!port) return;
  port.onmessage = (ev: MessageEvent<TabToWorker>) => onMessage(port, ev.data);
  port.start();
};
