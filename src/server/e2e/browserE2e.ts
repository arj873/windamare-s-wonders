/**
 * Two-tab browser end-to-end on the real stack: `wrangler dev` serves the freshly built app and
 * the room server on one origin; two isolated browser contexts (Ann, Bob) play it through the UI.
 * Ann creates a room, Bob joins from the invite link, Ann picks the Fast clock and starts, both
 * play to final scores by clicking their own legal actions, then Ann asks for a Rematch and both
 * land back in the lobby. Every `game` frame each tab receives is leak-checked.
 *
 *   nice -n 19 pnpm exec tsx src/server/e2e/browserE2e.ts [--headed] [--out dir]
 *
 * Exit code 0 = every check passed. Not part of `pnpm test`. Rebuilds dist/ so the page is the
 * current code, and stops wrangler and the browser when it ends. State goes under the repo, never /tmp.
 */
/// <reference types="node" />
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { parseServerMessage } from '../../net/protocol';
import { assertNoLeaks, buildDist, check, startWrangler } from './support';

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const HEADED = args.includes('--headed');
const OUT = flag('--out');
const TIMEOUT_MS = 420_000;
const VIEWPORT = { width: 1440, height: 900 };

/** What one tab has been sent, and who it is. */
interface Tab {
  name: string;
  page: Page;
  member: string | null;
  seat: number | null;
  games: number;
  leakError: string | null;
  parseErrors: string[];
}

function track(tab: Tab): void {
  tab.page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string' || !f.payload.startsWith('{')) return;
      let msg;
      try {
        msg = parseServerMessage(f.payload);
      } catch (e) {
        tab.parseErrors.push(String(e).slice(0, 200));
        return;
      }
      if (msg.type === 'welcome') tab.member = msg.you.member;
      if (msg.type === 'room' || msg.type === 'welcome') {
        tab.seat = msg.room.members.find((m) => m.id === tab.member)?.seat ?? null;
      }
      if (msg.type === 'game') {
        tab.games++;
        try {
          assertNoLeaks(msg, tab.seat);
        } catch (e) {
          tab.leakError ??= String(e);
        }
      }
    });
  });
}

async function shot(tab: Tab, name: string): Promise<void> {
  if (OUT) await tab.page.screenshot({ path: join(OUT, `${tab.name}-${name}.png`) });
}

const visible = (page: Page, k: string): Promise<boolean> =>
  page.locator(`[data-k="${k}"]`).first().isVisible();

async function waitFor(page: Page, k: string, ms = 30_000): Promise<void> {
  await page.locator(`[data-k="${k}"]`).first().waitFor({ state: 'visible', timeout: ms });
}

/** One step of "play my own seat": the first thing that is clickable, in priority order. */
async function step(page: Page): Promise<boolean> {
  const click = async (sel: string): Promise<boolean> => {
    const el = page.locator(sel).first();
    if ((await el.count()) === 0 || !(await el.isVisible()) || !(await el.isEnabled()))
      return false;
    await el.click({ timeout: 2_000 }).catch(() => undefined);
    return true;
  };
  if (await click('[data-k="season-ok"]')) return true;
  // A pending Great Work choice (or any prompt): take the first answer if none is chosen.
  const answer = page.locator('[data-k^="answer-"]:not(.is-chosen)').first();
  if ((await answer.count()) > 0 && (await page.locator('.dt-answer.is-chosen').count()) === 0) {
    if (await click('[data-k="answer-0"]')) return true;
  }
  // A card is open: take its first offered use.
  if (await click('[data-k^="use-"]')) return true;
  // Nothing staged yet: open the first playable card.
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
    const launched = await chromium.launch({ headless: !HEADED });
    browser = launched;
    const open = async (name: string): Promise<Tab> => {
      const ctx = await launched.newContext({ viewport: VIEWPORT });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error(`${name} page error:`, e.message));
      const tab: Tab = {
        name,
        page,
        member: null,
        seat: null,
        games: 0,
        leakError: null,
        parseErrors: [],
      };
      track(tab);
      return tab;
    };
    const ann = await open('Ann');
    const bob = await open('Bob');

    // Ann: home -> Play online -> lobby.
    await ann.page.goto(`${base}/?server=remote`);
    await ann.page.locator('[data-k="nickname"]').first().fill('Ann');
    await ann.page.locator('[data-k="online"]').first().click();
    await waitFor(ann.page, 'invite');
    const invite = await ann.page.locator('[data-k="invite"]').first().inputValue();
    check(invite.includes('room='), 'Ann has an invite link');
    await shot(ann, 'lobby');

    // Bob: open the invite, join with a name.
    await bob.page.goto(invite.replace(/^https?:\/\/[^/]+/, base));
    await waitFor(bob.page, 'join-card');
    await bob.page.locator('[data-k="join-name"]').first().fill('Bob');
    await bob.page
      .getByRole('button', { name: /^Join$/ })
      .first()
      .click();
    await waitFor(bob.page, 'waiting-host');
    check(true, 'Bob joined from the invite link and waits for the host');

    // Ann: Fast clock, then start.
    await ann.page.locator('[data-k="timer-fast"]').first().click();
    await shot(ann, 'lobby-both');
    await ann.page.locator('[data-k="lobby-start"]').first().click();
    for (const t of [ann, bob]) {
      await t.page
        .locator('[data-k^="answer-"], [data-k^="card-"]')
        .first()
        .waitFor({ timeout: 30_000 });
    }
    check(true, 'both tabs reached the table');

    // Play to final scores.
    const deadline = Date.now() + TIMEOUT_MS - 90_000;
    let acted = 0;
    while (Date.now() < deadline && !(await visible(ann.page, 'rematch'))) {
      for (const t of [ann, bob]) if (await step(t.page)) acted++;
      await ann.page.waitForTimeout(150);
    }
    await waitFor(ann.page, 'rematch', 10_000);
    await shot(ann, 'final');
    await shot(bob, 'final');
    check(acted > 5, `both players acted through the UI (${acted} clicks)`);
    if (ann.parseErrors.length) console.log('unparsed frames:', ann.parseErrors.slice(0, 3));
    check(ann.leakError === null, `Ann's views never leaked (${ann.games} game frames)`);
    check(bob.leakError === null, `Bob's views never leaked (${bob.games} game frames)`);
    check(ann.games > 10 && bob.games > 10, 'both tabs received per-seat views throughout');

    // Rematch: the host asks; both tabs return to the lobby.
    await ann.page.locator('[data-k="rematch"]').first().click();
    await waitFor(ann.page, 'lobby-start');
    await waitFor(bob.page, 'waiting-host');
    check(true, 'Rematch puts both tabs back in the lobby');
    console.log('browser e2e passed');
    await cleanup(0);
  } catch (e) {
    console.error(e);
    await cleanup(1);
  }
}

void main();
