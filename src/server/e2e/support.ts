/** Shared by the two end-to-end scripts: wrangler dev lifecycle, checks and the leak canary. */
/// <reference types="node" />
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { DraftView } from '../../engine';
import type { ServerMessage } from '../../net/protocol';

type Game = Extract<ServerMessage, { type: 'game' }>;

/** Build dist/ (wrangler serves it). `force` rebuilds so the page is the current code. */
export function buildDist(force: boolean): void {
  if (!force && existsSync('dist/index.html')) return;
  console.log('building dist/ ...');
  const r = spawnSync('nice', ['-n', '19', 'pnpm', 'exec', 'vite', 'build'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('vite build failed');
}

export const TIMEOUT_MS = 300_000;
const STATE_ROOT = process.env['E2E_STATE_DIR'] ?? join(process.cwd(), '.wrangler-e2e');

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() =>
        typeof addr === 'object' && addr ? resolve(addr.port) : reject(new Error('no port')),
      );
    });
  });
}

export function check(ok: unknown, what: string): void {
  if (!ok) throw new Error(`check failed: ${what}`);
  console.log(`  ok  ${what}`);
}

export async function startWrangler(): Promise<{
  base: string;
  proc: ChildProcess;
  stateDir: string;
}> {
  const port = await freePort();
  const inspector = await freePort();
  mkdirSync(STATE_ROOT, { recursive: true });
  const stateDir = mkdtempSync(join(STATE_ROOT, 'run-'));
  const proc = spawn(
    'nice',
    [
      '-n',
      '19',
      'node_modules/.bin/wrangler',
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--inspector-port',
      String(inspector),
      '--persist-to',
      stateDir,
      '--var',
      'BOT_DELAY_MS:40',
      '--var',
      'GRACE_MS:2000',
    ],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const onData = (b: Buffer) => {
      log += b.toString();
      if (log.includes('Ready on')) resolve();
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.once('exit', (code) => reject(new Error(`wrangler exited (${code}):\n${log}`)));
    setTimeout(() => reject(new Error(`wrangler not ready after 90 s:\n${log}`)), 90_000);
  });
  return { base: `http://127.0.0.1:${port}`, proc, stateDir };
}

/** The per-seat view must hide other seats' hands, picks, recall, the deck and the seed. */
export function assertNoLeaks(g: Game, seat: number | null): void {
  const v = g.view as DraftView<unknown, unknown>;
  v.seats.forEach((s, i) => {
    if (i === seat) return;
    if (s.hand.some((c) => c.id >= 0)) throw new Error(`seat ${seat} saw seat ${i}'s hand`);
    if (s.pick !== null) throw new Error(`seat ${seat} saw seat ${i}'s pick`);
    if (s.recall.length > 0) throw new Error(`seat ${seat} saw seat ${i}'s recall`);
  });
  if (v.deck.some((c) => c.id >= 0)) throw new Error('deck face visible');
  for (const a of g.legal) if (a.seat !== seat) throw new Error('legal action for another seat');
}
