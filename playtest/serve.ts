/**
 * Playtest session server. Two modes, one command set (`pnpm -s pt <seat> <cmd>`):
 *
 *   `pnpm pt:serve [--seats 3] [--humans 1,2] [--seed s] [--level easy|medium|hard]`
 *       Text mode: the engine in-process, bots in the other seats, no browser.
 *   `pnpm pt:serve --browser [--seats 3] [--seed s] [--port 4187] [--headed] [--no-build]`
 *       Browser mode: builds the app, serves it with `vite preview` on 127.0.0.1:<port>, opens
 *       system Chrome on `/?debug=1&seats=N&seed=S` (all seats human, one page) and turns every
 *       action into a click. Stop it with `pnpm -s pt stop`; it removes its session file.
 *
 * Commands arrive over HTTP on 127.0.0.1 (port in playtest/session.json), one at a time.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { build, preview, type PreviewServer } from 'vite';
import { BrowserGame } from './browser';
import { TextGame, type Reply } from './game';
import {
  BUGS_DIR,
  REPO_ROOT,
  SESSION_FILE,
  type CommandRequest,
  type CommandResponse,
  type SessionInfo,
} from './protocol';
import { parseFlags, slugify } from './text';

const { flags } = parseFlags(process.argv.slice(2));
const browserMode = 'browser' in flags;
// The UI's setup range is 3 to 7 (src/ui/setup/model.ts), so `?debug=1` cannot start 2 seats.
const seats = Math.max(browserMode ? 3 : 2, Math.min(7, Number(flags.seats || 3)));
if (browserMode && Number(flags.seats || 3) < 3) {
  console.log('Browser mode starts 3 to 7 seats (the UI has no 2-seat game); using 3.');
}
const seed = flags.seed || `pt-${Date.now()}`;
const level = flags.level === 'easy' || flags.level === 'hard' ? flags.level : 'medium';
const humans = browserMode
  ? Array.from({ length: seats }, (_, i) => i)
  : (flags.humans || '1')
      .split(',')
      .map((x) => Number(x) - 1)
      .filter((n) => Number.isInteger(n) && n >= 0 && n < seats);
const CHROME = process.env.PT_CHROME || '/usr/bin/google-chrome-stable';
/** Build output outside the repo and outside /tmp (RAM): the qa scratch dir. */
const DIST = process.env.PT_DIST || '/home/blop/projects/sevenwonders/.scratch/qa/pt-dist';

if (existsSync(SESSION_FILE)) {
  const old = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as SessionInfo;
  if (alive(old.pid)) {
    console.error(`A session is already running (pid ${old.pid}). Stop it with: pnpm -s pt stop`);
    process.exit(1);
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// The table: text game or browser page
// ---------------------------------------------------------------------------------------------

interface Table {
  run(
    seat: number,
    cmd: string,
    args: string[],
    flags: Record<string, string>,
  ): Reply | Promise<Reply>;
  statusFor(seat: number): string | Promise<string>;
}

let browser: Browser | null = null;
let previewServer: PreviewServer | null = null;
let table: Table;

if (browserMode) {
  const port = Number(flags.port || 4187);
  if (!('no-build' in flags) || !existsSync(join(DIST, 'index.html'))) {
    console.log(`Building the app into ${DIST} (a minute)...`);
    mkdirSync(DIST, { recursive: true });
    await build({
      root: REPO_ROOT,
      logLevel: 'warn',
      build: { outDir: DIST, emptyOutDir: true },
    });
  }
  previewServer = await preview({
    root: REPO_ROOT,
    build: { outDir: DIST },
    preview: { host: '127.0.0.1', port, strictPort: true, open: false },
  });
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: !('headed' in flags),
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const bg = new BrowserGame(page, seats);
  await page.goto(
    `http://127.0.0.1:${port}/?debug=1&seats=${seats}&seed=${encodeURIComponent(seed)}`,
  );
  await page.waitForSelector('.dt', { timeout: 20_000 });
  table = { run: (s, c, a, f) => bg.run(s, c, a, f), statusFor: (s) => bg.statusFor(s) };
} else {
  const game = new TextGame({ seats, humans, seed, level });
  table = { run: (s, c, a, f) => game.run(s, c, a, f), statusFor: (s) => game.status(s) };
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

async function report(req: CommandRequest): Promise<string> {
  const f = req.flags;
  const missing = ['title', 'severity', 'expected', 'actual'].filter((k) => !f[k]);
  if (missing.length) return `report needs --${missing.join(' --')} (and --steps).`;
  mkdirSync(BUGS_DIR, { recursive: true });
  const file = join(
    BUGS_DIR,
    `${new Date().toISOString().slice(0, 10)}-${slugify(f.title ?? '')}.md`,
  );
  const body = [
    `# ${f.title}`,
    '',
    `- severity: ${f.severity}`,
    `- mode: ${browserMode ? 'browser' : 'text'}, seed: ${seed}, seats: ${seats}, seat reporting: ${req.seat + 1}`,
    `- expected: ${f.expected}`,
    `- actual: ${f.actual}`,
    `- steps: ${f.steps ?? '(none given)'}`,
    '',
    '## Status at the time',
    '',
    '```',
    req.seat >= 0 ? await table.statusFor(req.seat) : '(no seat)',
    '```',
    '',
  ].join('\n');
  writeFileSync(file, body);
  return `Bug saved: ${file}`;
}

async function handle(req: CommandRequest): Promise<CommandResponse> {
  if (req.cmd === 'report') return { out: await report(req) };
  if (req.cmd === 'stop') {
    setTimeout(() => void shutdown(), 50);
    return { out: 'Stopping the playtest server.' };
  }
  if (req.seat < 0 || req.seat >= seats) return { out: `No such seat (1 to ${seats}).` };
  return await table.run(req.seat, req.cmd, req.args, req.flags);
}

// Commands run one at a time: a click sequence must not interleave with another seat's.
let queue: Promise<unknown> = Promise.resolve();

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const run = queue.then(async (): Promise<CommandResponse> => {
      try {
        return await handle(JSON.parse(Buffer.concat(chunks).toString('utf8')) as CommandRequest);
      } catch (e) {
        return { out: `HARNESS ERROR: ${e instanceof Error ? e.message : String(e)}` };
      }
    });
    queue = run.catch(() => undefined);
    void run.then((out) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out));
    });
  });
});

async function shutdown(): Promise<void> {
  if (existsSync(SESSION_FILE)) rmSync(SESSION_FILE);
  server.close();
  await browser?.close().catch(() => undefined);
  await previewServer?.close().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const info: SessionInfo = {
    port,
    pid: process.pid,
    mode: browserMode ? 'browser' : 'text',
    seats,
    humans: humans.map((n) => n + 1),
    seed,
    level,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(SESSION_FILE, JSON.stringify(info, null, 2));
  console.log(
    `Playtest server up on 127.0.0.1:${port} · ${info.mode} mode, ${seats} seats, human seats ${info.humans.join(',')}, seed ${seed}.\n` +
      `Play with: pnpm -s pt <seat> status   (stop: pnpm -s pt stop)`,
  );
});
