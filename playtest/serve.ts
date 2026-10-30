/**
 * Playtest session server (text mode): `pnpm pt:serve [--seats 3] [--humans 1,2] [--seed s]
 * [--level easy|medium|hard]`. Holds one game in memory and answers short commands from `pnpm -s
 * pt <seat> <command>` on 127.0.0.1. Stop it with `pnpm -s pt stop`. No browser is started.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGame } from './boot';
import {
  BUGS_DIR,
  SESSION_FILE,
  type CommandRequest,
  type CommandResponse,
  type SessionInfo,
} from './protocol';
import { parseFlags, slugify } from './text';

const { positional, flags } = parseFlags(process.argv.slice(2));
void positional;
const seats = Math.max(2, Math.min(7, Number(flags.seats || 3)));
const humans = (flags.humans || '1')
  .split(',')
  .map((x) => Number(x) - 1)
  .filter((n) => Number.isInteger(n) && n >= 0 && n < seats);
const seed = flags.seed || `pt-${Date.now()}`;
const level = flags.level === 'easy' || flags.level === 'hard' ? flags.level : 'medium';

const { TextGame } = await loadGame();
const game = new TextGame({ seats, humans, seed, level });

function report(req: CommandRequest): string {
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
    `- seed: ${seed}, seats: ${seats}, seat reporting: ${req.seat + 1}`,
    `- expected: ${f.expected}`,
    `- actual: ${f.actual}`,
    `- steps: ${f.steps ?? '(none given)'}`,
    '',
    '## Status at the time',
    '',
    '```',
    req.seat >= 0 ? game.status(req.seat) : '(no seat)',
    '```',
    '',
  ].join('\n');
  writeFileSync(file, body);
  return `Bug saved: ${file}`;
}

function handle(req: CommandRequest): CommandResponse {
  if (req.cmd === 'report') return { out: report(req) };
  if (req.cmd === 'stop') {
    setTimeout(shutdown, 50);
    return { out: 'Stopping the playtest server.' };
  }
  if (req.seat < 0 || req.seat >= seats) return { out: `No such seat (1 to ${seats}).` };
  return game.run(req.seat, req.cmd, req.args, req.flags);
}

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    let out: CommandResponse;
    try {
      out = handle(JSON.parse(Buffer.concat(chunks).toString('utf8')) as CommandRequest);
    } catch (e) {
      out = { out: `HARNESS ERROR: ${e instanceof Error ? e.message : String(e)}` };
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(out));
  });
});

function shutdown(): void {
  if (existsSync(SESSION_FILE)) rmSync(SESSION_FILE);
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const info: SessionInfo = {
    port,
    pid: process.pid,
    mode: 'text',
    seats,
    humans: humans.map((n) => n + 1),
    seed,
    level,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(SESSION_FILE, JSON.stringify(info, null, 2));
  console.log(
    `Playtest server up on 127.0.0.1:${port} · ${seats} seats, human seats ${info.humans.join(',')}, seed ${seed}, bots ${level}.\n` +
      `Play with: pnpm -s pt <seat> status   (stop: pnpm -s pt stop)`,
  );
});
