/**
 * End-to-end check of the room server: starts `wrangler dev` on a free port, creates a room over
 * HTTP, connects two WebSocket clients (host + friend; the third seat is a server bot), plays a
 * whole Windamere game with autopilot clients, drops and reconnects one player mid-game, and checks
 * every view for masked secrets.
 *
 *   nice -n 19 pnpm exec tsx src/server/e2e/serverE2e.ts      (builds dist/ first if it is missing)
 *
 * Exit code 0 = the game finished and every check passed. Not part of `pnpm test` (it needs
 * workerd and spawns a server). Local state goes to .scratch, never /tmp.
 */
/// <reference types="node" />
import { rmSync } from 'node:fs';
import type { DraftView } from '../../engine';
import type { CreateRoomResponse } from '../../net/api';
import { roomSocketUrl } from '../../net/ws';
import { parseServerMessage, PROTOCOL_VERSION, type ServerMessage } from '../../net/protocol';
import { assertNoLeaks, buildDist, check, startWrangler, TIMEOUT_MS } from './support';

type Game = Extract<ServerMessage, { type: 'game' }>;

/** One browser tab: a socket, its inbox, and an autopilot that plays its seat. */
class Client {
  readonly inbox: ServerMessage[] = [];
  ws!: WebSocket;
  token: string | null;
  autopilot = false;
  seat: number | null = null;
  member = '';
  last: Game | null = null;
  phase = 'lobby';
  games = 0;
  private waiters: (() => void)[] = [];

  constructor(
    readonly name: string,
    private readonly base: string,
    private readonly room: string,
    token: string | null,
  ) {
    this.token = token;
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket(roomSocketUrl(this.base, this.room), {
      headers: { origin: this.base },
    } as never);
    this.ws.addEventListener('message', (e) => this.onMessage(String(e.data)));
    this.ws.addEventListener('close', () => this.wake());
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error(`${this.name}: socket error`)), {
        once: true,
      });
    });
    this.send({ type: 'hello', token: this.token, name: this.name });
    await this.until((m) => m.type === 'welcome');
  }

  send(body: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...body }));
  }

  private onMessage(text: string): void {
    if (text === 'pong') return;
    const msg = parseServerMessage(text);
    this.inbox.push(msg);
    if (msg.type === 'welcome') {
      this.token = msg.you.token;
      this.member = msg.you.member;
      this.updateRoom(msg.room);
    } else if (msg.type === 'room') {
      this.updateRoom(msg.room);
    } else if (msg.type === 'game') {
      this.games++;
      this.last = msg;
      assertNoLeaks(msg, this.seat);
      if (this.autopilot) this.act(msg);
    }
    this.wake();
  }

  private updateRoom(room: {
    phase: string;
    members: { id: string; seat: number | null }[];
  }): void {
    this.phase = room.phase;
    this.seat = room.members.find((m) => m.id === this.member)?.seat ?? null;
  }

  private act(g: Game): void {
    if (this.seat === null || !g.waiting.includes(this.seat)) return;
    const a = g.legal[0];
    if (!a || a.type === 'unpick') return;
    if (a.type === 'pick') this.send({ type: 'pick', pick: a.pick });
    else this.send({ type: 'answer', prompt: a.prompt, answer: a.answer });
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  until(pred: (m: ServerMessage) => boolean, ms = 30_000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.name}: timed out waiting`)), ms);
      const look = () => {
        const hit = this.inbox.find(pred);
        if (hit) {
          clearTimeout(t);
          resolve(hit);
        } else this.waiters.push(look);
      };
      look();
    });
  }

  async untilPhase(phase: string, ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (this.phase !== phase) {
      if (Date.now() > end) throw new Error(`${this.name}: phase ${this.phase}, wanted ${phase}`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 500);
      });
    }
  }

  close(): void {
    this.ws.close();
  }
}

async function main(): Promise<void> {
  buildDist(false);
  const { base, proc, stateDir } = await startWrangler();
  const killer = setTimeout(() => {
    console.error('timeout');
    cleanup(1);
  }, TIMEOUT_MS);
  const cleanup = (code: number) => {
    clearTimeout(killer);
    try {
      if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    rmSync(stateDir, { recursive: true, force: true });
    process.exit(code);
  };
  try {
    console.log(`wrangler dev on ${base}`);
    const res = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { origin: base } });
    check(res.status === 201, 'POST /api/rooms -> 201');
    const { roomId, hostToken } = (await res.json()) as CreateRoomResponse;
    const info = await fetch(`${base}/api/rooms/${roomId}`, { headers: { origin: base } });
    check(info.status === 200, 'GET /api/rooms/:code -> 200');
    const bad = await fetch(`${base}/api/rooms/ZZZZZZ`, { headers: { origin: base } });
    check(bad.status === 404, 'unknown room -> 404');

    const ann = new Client('Ann', base, roomId, hostToken);
    await ann.connect();
    const bob = new Client('Bob', base, roomId, null);
    await bob.connect();
    check(ann.seat === 0 && bob.seat === 1, 'host and friend are auto-seated');
    ann.send({ type: 'configure', config: { seatCount: 3, timer: 'fast' } });
    ann.autopilot = true;
    bob.autopilot = true;
    ann.send({ type: 'start' });
    await ann.untilPhase('playing', 20_000);
    check(true, 'game started');
    await bob.until((m) => m.type === 'game');

    // Drop Bob mid-game and bring him back with his token.
    await new Promise((r) => setTimeout(r, 1500));
    const bobToken = bob.token;
    bob.close();
    await new Promise((r) => setTimeout(r, 500));
    const bob2 = new Client('Bob', base, roomId, bobToken);
    bob2.autopilot = true;
    await bob2.connect();
    await bob2.until((m) => m.type === 'game');
    check(bob2.seat === 1, 'Bob reconnects into his seat');

    await ann.untilPhase('over', TIMEOUT_MS - 60_000);
    // The final `game` message follows the `room` that says "over".
    await ann.until((m) => m.type === 'game' && m.view.result !== null, 10_000);
    const view = ann.last?.view as DraftView<unknown, unknown> | undefined;
    check((view?.result?.winners.length ?? 0) > 0, 'game over with a result');
    check(ann.games > 10 && bob2.games > 3, 'both clients received per-seat views throughout');
    console.log('server e2e passed');
    cleanup(0);
  } catch (e) {
    console.error(e);
    cleanup(1);
  }
}

void main();
