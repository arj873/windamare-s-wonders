/**
 * Q5, narrow-screen check (ui's request): at 360 and 390 px wide, no element may reach past the
 * viewport and the page must not scroll sideways, on the home screen, the setup screen, the table
 * with each turn clock, the Season-end card and the final scores.
 *
 *   nice -n 19 pnpm exec tsx playtest/widths.ts [--widths 360,390] [--out shots-dir] [--headed]
 *
 * Builds the app (into the qa scratch dir), serves it with `vite preview`, drives system Chrome.
 * The table with a clock is reached through the real setup screen ("Play vs bots", clock buttons,
 * Start); the Season card and the final scores through `?debug=1` (clock off) and the browser
 * layer's `autoplay`. Exit code 0 = no problem found. Not part of `pnpm test`.
 *
 * What counts: (1) the document scrolls sideways (`scrollWidth` > viewport) = FAIL; (2) a visible
 * element whose box reaches past the viewport and is NOT clipped by a scrolling or hidden-overflow
 * ancestor that itself fits = FAIL; (3) elements past the edge but clipped or scrollable on
 * purpose are listed as notes, not failures.
 */
/// <reference types="node" />
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { build, preview, type PreviewServer } from 'vite';
import { BrowserGame } from './browser';
import { REPO_ROOT } from './protocol';
import { parseFlags } from './text';

const { flags } = parseFlags(process.argv.slice(2));
const WIDTHS = (flags.widths || '360,390').split(',').map(Number);
const HEIGHT_OF: Record<number, number> = { 360: 740, 390: 844 };
const OUT = flags.out || null;
const PORT = Number(flags.port || 4188);
const CHROME = process.env['PT_CHROME'] || '/usr/bin/google-chrome-stable';
const DIST = process.env['PT_DIST'] || '/home/blop/projects/sevenwonders/.scratch/qa/pt-dist';
const k = (key: string): string => `[data-k="${key}"]`;

interface Offender {
  el: string;
  left: number;
  right: number;
  clipped: boolean;
  /** Wholly outside the viewport (an off-canvas drawer), not sticking out of it. */
  offCanvas: boolean;
  /** Off-canvas yet a keyboard user can Tab into it (not inert / aria-hidden). */
  focusable: boolean;
}
interface Measure {
  innerWidth: number;
  scrollWidth: number;
  offenders: Offender[];
}

/** Runs in the page: how far does anything stick out past the viewport? */
function measureInPage(): Measure {
  const vw = document.documentElement.clientWidth;
  const out: Offender[] = [];
  const describe = (el: Element): string => {
    const cls =
      typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
    const key = el.getAttribute('data-k') ?? el.getAttribute('data-pt-role') ?? '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${key ? `[${key}]` : ''}${text ? ` "${text}"` : ''}`;
  };
  const clippedByAncestor = (el: Element): boolean => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) {
        const r = a.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const offCanvas = r.left >= vw - 1 || r.right <= 1;
      const tabbable =
        el.matches('a[href],button,input,select,textarea,[tabindex]') &&
        (el as HTMLElement).tabIndex >= 0 &&
        !(el as HTMLButtonElement).disabled;
      out.push({
        el: describe(el),
        left: Math.round(r.left),
        right: Math.round(r.right),
        clipped: clippedByAncestor(el),
        offCanvas,
        focusable: offCanvas && tabbable && !el.closest('[inert],[aria-hidden="true"]'),
      });
    }
  }
  return { innerWidth: vw, scrollWidth: document.documentElement.scrollWidth, offenders: out };
}

const failures: string[] = [];
const notes: string[] = [];

async function measure(
  page: Page,
  width: number,
  label: string,
  shotDir: string | null,
): Promise<void> {
  const m = await page.evaluate(measureInPage);
  // A sub-pixel or 1-2 px overshoot (an animated chip mid-flight) is a note, not a failure.
  const overshoot = (o: Offender): number => Math.max(-o.left, o.right - m.innerWidth);
  const bad = m.offenders.filter((o) => !o.clipped && !o.offCanvas && overshoot(o) > 2);
  for (const o of m.offenders.filter((x) => !x.clipped && !x.offCanvas && overshoot(x) <= 2)) {
    notes.push(
      `${width}px ${label}: ${o.el} overshoots by ${overshoot(o)} px (${o.left}..${o.right})`,
    );
  }
  const clipped = m.offenders.filter((o) => o.clipped);
  const off = m.offenders.filter((o) => o.offCanvas && !o.clipped);
  const trap = off.filter((o) => o.focusable);
  const sideways = m.scrollWidth > m.innerWidth;
  const verdict = sideways || bad.length > 0 ? 'FAIL' : 'ok  ';
  console.log(
    `  ${verdict} ${width}px ${label}: scrollWidth ${m.scrollWidth}/${m.innerWidth}, ${bad.length} sticking out, ${off.length} wholly off-canvas (${trap.length} tabbable), ${clipped.length} clipped on purpose`,
  );
  if (sideways)
    failures.push(
      `${width}px ${label}: page scrolls sideways (scrollWidth ${m.scrollWidth} > ${m.innerWidth})`,
    );
  for (const o of bad.slice(0, 8)) {
    const line = `${width}px ${label}: ${o.el} spans ${o.left}..${o.right} (viewport ${m.innerWidth})`;
    failures.push(line);
    console.log(`        ${line}`);
  }
  for (const o of clipped.slice(0, 3))
    notes.push(`${width}px ${label}: ${o.el} ${o.left}..${o.right} (clipped/scrolls)`);
  for (const o of trap.slice(0, 2))
    notes.push(
      `${width}px ${label}: off-canvas but reachable by Tab: ${o.el} (${o.left}..${o.right})`,
    );
  if (shotDir)
    await page.screenshot({ path: join(shotDir, `${width}-${label.replace(/\W+/g, '-')}.png`) });
}

async function main(): Promise<void> {
  if (OUT) mkdirSync(OUT, { recursive: true });
  if (!existsSync(join(DIST, 'index.html')) || !('no-build' in flags)) {
    console.log(`building the app into ${DIST} ...`);
    mkdirSync(DIST, { recursive: true });
    await build({ root: REPO_ROOT, logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true } });
  }
  const server: PreviewServer = await preview({
    root: REPO_ROOT,
    build: { outDir: DIST },
    preview: { host: '127.0.0.1', port: PORT, strictPort: true, open: false },
  });
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ executablePath: CHROME, headless: !('headed' in flags) });
    const base = `http://127.0.0.1:${PORT}`;
    for (const width of WIDTHS) {
      const height = HEIGHT_OF[width] ?? 800;
      console.log(`\n== ${width} x ${height}`);
      const ctx = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        isMobile: true,
      });
      // tsx (esbuild keepNames) wraps named functions in `__name(...)`; the page has no such helper.
      await ctx.addInitScript('window.__name = (f) => f;');
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      page.on('pageerror', (e) =>
        failures.push(`${width}px: page error ${e.message.slice(0, 120)}`),
      );

      // Home, setup, and the table with each clock, through the real setup screen.
      await page.goto(base);
      await page.waitForSelector(k('play'));
      await measure(page, width, 'home', OUT);
      await page.locator(k('play')).click();
      await page.waitForSelector(k('start'));
      await measure(page, width, 'setup', OUT);
      for (const [i, clock] of ['off', 'relaxed', 'normal', 'fast'].entries()) {
        if (i > 0) {
          await page.goto(base);
          await page.waitForSelector(k('play'));
          await page.locator(k('play')).click();
          await page.waitForSelector(k('start'));
        }
        await page.locator(k(`clock-${clock}`)).click();
        await measure(page, width, `setup clock ${clock}`, null);
        await page.locator(k('start')).click();
        await page.waitForSelector('.dt', { timeout: 20_000 });
        await page.waitForTimeout(600);
        await measure(page, width, `table clock ${clock}`, OUT);
      }

      // Season card and final scores: an all-human debug game with no clock, played by autoplay.
      await page.goto(`${base}/?debug=1&seats=3&seed=widths`);
      await page.waitForSelector('.dt');
      const game = new BrowserGame(page, 3);
      let season = false;
      const tick = async (): Promise<void> => {
        if (!season && (await page.locator('[data-act="season-ok"]').count()) > 0) {
          season = true;
          await page.waitForTimeout(300);
          await measure(page, width, 'Season card', OUT);
        }
      };
      await game.autoplay(400, tick);
      if (!season)
        failures.push(`${width}px: the Season card never appeared, so it was not measured`);
      await page.waitForSelector('.dt-band-card', { timeout: 15_000 }).catch(() => {
        failures.push(`${width}px: the final scores never appeared, so they were not measured`);
      });
      if ((await page.locator('.dt-band-card').count()) > 0)
        await measure(page, width, 'final scores', OUT);
      await ctx.close();
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
  if (notes.length)
    console.log(
      `\nclipped on purpose (not failures):\n - ${[...new Set(notes)].slice(0, 12).join('\n - ')}`,
    );
  if (failures.length) {
    console.log(`\n${failures.length} problem(s):\n - ${failures.join('\n - ')}`);
    process.exit(1);
  }
  console.log('\nno element past the viewport, no sideways scroll');
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
