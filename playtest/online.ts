/**
 * Q4, the online layer: one browser page per seat against the real stack (`wrangler dev` serves
 * the built app and the room server on one origin). Three isolated contexts (Ann, Bob, Cy) create
 * and join a room through the lobby, start it, and play to the final scores by clicking their own
 * legal actions. On top of net's e2e (src/server/e2e/browserE2e.ts, which this reuses for the
 * lobby flow, wrangler and the basic leak canary) it checks every `game` frame each tab receives:
 *
 *   - net's canary (other seats' hands, picks, recall, deck, legal actions);
 *   - seed and rng masked, other seats' prompt data and glean zone hidden, unrevealed
 *     Raids and other towns' unrevealed Great Work hidden;
 *   - `seq` never goes backwards on one tab, and every frame parses;
 *
 * and then, mid-game, drops one tab's network and restores it, and reloads it: the seat must come
 * back as the same member with views flowing again. At the end all three tabs must hold the same
 * result. Not part of `pnpm test` (needs Chrome, a build and wrangler); about 3 to 6 minutes.
 *
 *   nice -n 19 pnpm exec tsx playtest/online.ts [--seats 3] [--headed] [--out dir]
 *
 * Exit code 0 = every check passed. Stops wrangler and the browser when it ends. State goes to
 * the qa scratch dir, never /tmp. Remove `dist/` afterwards if you do not need it.
 */
/// <reference types="node" />
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { HIDDEN_SEED, type DraftView } from '../src/engine';
import { parseServerMessage, type ServerMessage } from '../src/net/protocol';
import { parseFlags } from './text';

process.env['E2E_STATE_DIR'] ??= '/home/blop/projects/sevenwonders/.scratch/qa/wrangler-state';
const { assertNoLeaks, buildDist, check, startWrangler } =
  await import('../src/server/e2e/support');

type Game = Extract<ServerMessage, { type: 'game' }>;

const { flags } = parseFlags(process.argv.slice(2));
const SEATS = Math.max(3, Math.min(7, Number(flags.seats || 3)));
const HEADED = 'headed' in flags;
const OUT = flags.out || null;
const NAMES = ['Ann', 'Bob', 'Cy', 'Di', 'Ed', 'Flo', 'Gus'].slice(0, SEATS);
const TIMEOUT_MS = 600_000;
const VIEWPORT = { width: 1440, height: 900 };
/** Exact selectors: `[data-k="x"]`, never a substring match (ui's request). */
const k = (key: string): string => `[data-k="${key}"]`;

interface Tab {
  name: string;
  page: Page;
  context: BrowserContext;
  member: string | null;
  seat: number | null;
  games: number;
  lastSeq: number;
  lastView: DraftView<unknown, unknown> | null;
  problems: string[];
}

/** A view carries only the masked placeholders: the hidden seed and an all-zero rng (view.ts). */
function maskedSecrets(g: Game): string[] {
  const v = g.view as DraftView<unknown, unknown>;
  const bad: string[] = [];
  if (v.config.seed !== HIDDEN_SEED)
    bad.push(`config.seed is "${String(v.config.seed)}", not the mask`);
  if (!v.rng.every((n) => n === 0)) bad.push('rng words are not zeroed');
  return bad;
}

/** The leak checks beyond net's canary. Returns what is wrong with this frame, if anything. */
function audit(g: Game, seat: number | null): string[] {
  const bad: string[] = [];
  const v = g.view as DraftView<unknown, unknown> & {
    table?: { raids?: { id: string; revealed: boolean }[] };
  };
  bad.push(...maskedSecrets(g));
  for (const p of v.prompts) {
    if (p.seat !== seat && p.data !== null)
      bad.push(`prompt ${p.id} of seat ${p.seat} shows its data`);
    if (p.seat !== seat && p.answered === false && p.answer !== null) {
      bad.push(`prompt ${p.id} of seat ${p.seat} shows an answer`);
    }
  }
  v.seats.forEach((s, i) => {
    if (i === seat) return;
    const glean = s.zones['glean'] ?? [];
    if (glean.some((c) => c.id >= 0)) bad.push(`seat ${i}'s glean card is visible`);
    const data = s.data as { greatWork?: string | null } | null;
    // Before the choices are revealed (a prompt phase), nobody else's Great Work shows.
    if (v.phase.kind === 'prompt' && v.round === 0 && v.turn === 0 && data?.greatWork) {
      bad.push(`seat ${i}'s Great Work shows during the choice`);
    }
  });
  const raids = v.table?.raids ?? [];
  raids.forEach((r, i) => {
    if (i > v.round && (r.revealed || r.id !== '?')) bad.push(`Raid ${i} is revealed early`);
  });
  return bad;
}

function track(tab: Tab): void {
  tab.page.on('pageerror', (e) => tab.problems.push(`page error: ${e.message.slice(0, 160)}`));
  tab.page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string' || !f.payload.startsWith('{')) return;
      let msg: ServerMessage;
      try {
        msg = parseServerMessage(f.payload);
      } catch (e) {
        tab.problems.push(`unparsed frame: ${String(e).slice(0, 160)}`);
        return;
      }
      if (msg.type === 'welcome') tab.member = msg.you.member;
      if (msg.type === 'room' || msg.type === 'welcome') {
        tab.seat = msg.room.members.find((m) => m.id === tab.member)?.seat ?? null;
      }
      if (msg.type !== 'game') return;
      tab.games++;
      const v = msg.view as DraftView<unknown, unknown>;
      if (v.seq < tab.lastSeq) tab.problems.push(`seq went back ${tab.lastSeq} -> ${v.seq}`);
      tab.lastSeq = Math.max(tab.lastSeq, v.seq);
      tab.lastView = v;
      try {
        assertNoLeaks(msg, tab.seat);
      } catch (e) {
        tab.problems.push(`leak: ${String(e).slice(0, 160)}`);
      }
      for (const b of audit(msg, tab.seat)) tab.problems.push(`leak: ${b}`);
    });
  });
}

const visible = (page: Page, key: string): Promise<boolean> =>
  page.locator(k(key)).first().isVisible();

async function waitFor(page: Page, key: string, ms = 30_000): Promise<void> {
  await page.locator(k(key)).first().waitFor({ state: 'visible', timeout: ms });
}

/** One step of "play my own seat": the first thing that is clickable, in priority order. */
async function step(page: Page): Promise<boolean> {
  const click = async (sel: string): Promise<boolean> => {
    const el = page.locator(sel).first();
    if ((await el.count()) === 0 || !(await el.isVisible()) || !(await el.isEnabled())) {
      return false;
    }
    await el.click({ timeout: 2_000 }).catch(() => undefined);
    return true;
  };
  if (await click(k('season-ok'))) return true;
  const answer = page.locator('[data-k^="answer-"]:not(.is-chosen)').first();
  if ((await answer.count()) > 0 && (await page.locator('.dt-answer.is-chosen').count()) === 0) {
    if (await click(k('answer-0'))) return true;
  }
  if (await click('[data-k^="use-"]')) return true;
  if ((await page.locator('.dt-card.is-staged').count()) === 0) {
    if (await click('[data-k^="card-"][data-playable="true"]')) return true;
  }
  return false;
}

async function main(): Promise<void> {
  if (OUT) mkdirSync(OUT, { recursive: true });
  buildDist(true);
  const { base, proc, stateDir } = await startWrangler();
  let browser: Browser | null = null;
  const cleanup = async (code: number): Promise<never> => {
    clearTimeout(killer);
    await browser?.close().catch(() => undefined);
    try {
      if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    rmSync(stateDir, { recursive: true, force: true });
    process.exit(code);
  };
  const killer = setTimeout(() => {
    console.error('timeout');
    void cleanup(1);
  }, TIMEOUT_MS);

  try {
    const launched = await chromium.launch({
      executablePath: process.env['PT_CHROME'] || '/usr/bin/google-chrome-stable',
      headless: !HEADED,
    });
    browser = launched;
    const shot = async (t: Tab, name: string): Promise<void> => {
      if (OUT) await t.page.screenshot({ path: join(OUT, `${t.name}-${name}.png`) });
    };
    const tabs: Tab[] = [];
    for (const name of NAMES) {
      const context = await launched.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      const tab: Tab = {
        name,
        page,
        context,
        member: null,
        seat: null,
        games: 0,
        lastSeq: -1,
        lastView: null,
        problems: [],
      };
      track(tab);
      tabs.push(tab);
    }
    const host = tabs[0];
    if (!host) throw new Error('no tabs');

    // Host: home -> Play online -> lobby, with an invite link.
    await host.page.goto(`${base}/?server=remote`);
    await host.page.locator(k('nickname')).first().fill(host.name);
    await host.page.locator(k('online')).first().click();
    await waitFor(host.page, 'invite');
    const invite = await host.page.locator(k('invite')).first().inputValue();
    check(invite.includes('room='), `${host.name} has an invite link`);

    // The others join from the invite link, one by one.
    for (const t of tabs.slice(1)) {
      await t.page.goto(invite.replace(/^https?:\/\/[^/]+/, base));
      await waitFor(t.page, 'join-card');
      await t.page.locator(k('join-name')).first().fill(t.name);
      await t.page
        .getByRole('button', { name: /^Join$/ })
        .first()
        .click();
      await waitFor(t.page, 'waiting-host');
    }
    check(true, `${tabs.length - 1} players joined from the invite link and wait for the host`);
    await shot(host, 'lobby');

    await host.page.locator(k('timer-fast')).first().click();
    await host.page.locator(k('lobby-start')).first().click();
    for (const t of tabs) {
      await t.page
        .locator('[data-k^="answer-"], [data-k^="card-"]')
        .first()
        .waitFor({ timeout: 30_000 });
    }
    check(true, 'every tab reached the table');
    for (const t of tabs) check(t.seat !== null, `${t.name} was given a seat (${t.seat})`);
    check(new Set(tabs.map((t) => t.seat)).size === tabs.length, 'all seats are different');

    // Play. Part-way through, cut one tab's network, restore it, then reload it.
    const victim = tabs[1];
    if (!victim) throw new Error('need a second tab');
    const victimSeat = victim.seat;
    const victimMember = victim.member;
    const deadline = Date.now() + TIMEOUT_MS - 120_000;
    let acted = 0;
    let phase: 'play' | 'dropped' | 'restored' | 'reloaded' = 'play';
    let phaseAt = 0;
    while (Date.now() < deadline && !(await visible(host.page, 'rematch'))) {
      for (const t of tabs) if (await step(t.page)) acted++;
      if (phase === 'play' && acted >= 24) {
        await victim.context.setOffline(true);
        phase = 'dropped';
        phaseAt = Date.now();
        console.log('  ..  dropped the network of', victim.name);
      } else if (phase === 'dropped' && Date.now() - phaseAt > 6_000) {
        const before = victim.games;
        await victim.context.setOffline(false);
        phase = 'restored';
        phaseAt = Date.now();
        await waitForGames(victim, before + 1, 60_000);
        check(victim.games > before, `${victim.name} got views again after the network came back`);
        check(
          victim.seat === victimSeat,
          `${victim.name} kept seat ${victimSeat} after reconnecting`,
        );
      } else if (phase === 'restored' && Date.now() - phaseAt > 5_000) {
        const before = victim.games;
        await victim.page.reload();
        phase = 'reloaded';
        await waitForGames(victim, before + 1, 60_000);
        check(victim.member === victimMember, `${victim.name} is the same member after a reload`);
        check(victim.seat === victimSeat, `${victim.name} kept seat ${victimSeat} after a reload`);
      }
      await host.page.waitForTimeout(150);
    }
    check(phase === 'reloaded', 'the drop, reconnect and reload were all exercised');
    await waitFor(host.page, 'rematch', 20_000);
    await shot(host, 'final');
    check(acted > 30, `the players acted through the UI (${acted} clicks)`);

    // Frames and consistency.
    for (const t of tabs) {
      if (t.problems.length)
        console.log(`${t.name} problems:\n - ${t.problems.slice(0, 6).join('\n - ')}`);
      check(
        t.problems.length === 0,
        `${t.name}: no leak, parse or ordering problem in ${t.games} game frames`,
      );
      check(t.games > 20, `${t.name} received per-seat views throughout`);
    }
    // Let the last frames land, then every tab must hold the same result.
    await host.page.waitForTimeout(1500);
    const results = tabs.map((t) => JSON.stringify(t.lastView?.result ?? null));
    check(results[0] !== 'null', 'the game produced a result');
    check(
      results.every((r) => r === results[0]),
      'all tabs hold the same final result',
    );
    const seqs = tabs.map((t) => t.lastView?.seq);
    check(
      seqs.every((s) => s === seqs[0]),
      `all tabs ended on the same seq (${String(seqs[0])})`,
    );
    console.log('online playtest passed');
    await cleanup(0);
  } catch (e) {
    console.error(e);
    await cleanup(1);
  }
}

async function waitForGames(tab: Tab, n: number, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (tab.games < n && Date.now() < until) await tab.page.waitForTimeout(250);
}

void main();
