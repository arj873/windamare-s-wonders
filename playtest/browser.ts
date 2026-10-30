/**
 * Browser layer (Q2b): the same commands as the text game, but every action is a click in the
 * real UI (`/?debug=1`, UX.md §18), so UI bugs show up. State is only read: the seat's view comes
 * from `window.__pt.view(seat)`, never from the engine singleton, and after each action the view
 * is compared with what the click should have done. One page holds all seats (no pass covers):
 * the table shows whichever seat the game waits for, and a command for another seat is refused.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from 'playwright';
import type { SeatId } from '../src/engine';
import {
  at,
  cardsText,
  engine,
  isOver,
  isWaiting,
  presenter,
  resultText,
  rules,
  statusText,
  waitingNames,
  type View,
} from './render';
import { matchChoice } from './text';
import type { Reply } from './game';
import { SHOTS_DIR } from './protocol';

const SETTLE_MS = 450;
const CLICK_TIMEOUT_MS = 4000;
/** Headless-GPU chatter, not app bugs. */
const NOISE = [/GL Driver Message/, /GPU stall due to ReadPixels/];

interface ConsoleRecord {
  level: string;
  text: string;
}

export class BrowserGame {
  private readonly log: ConsoleRecord[] = [];
  private seen = 0;

  constructor(
    readonly page: Page,
    readonly seats: number,
  ) {
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') this.record(m.type(), m.text());
    });
    page.on('pageerror', (e) => this.record('pageerror', e.message));
  }

  private record(level: string, text: string): void {
    if (NOISE.some((re) => re.test(text))) return;
    this.log.push({ level, text });
  }

  // -------------------------------------------------------------------------------------------
  // Reading (never clicks)
  // -------------------------------------------------------------------------------------------

  async view(seat: SeatId): Promise<View | null> {
    return (await this.page.evaluate(
      (s) =>
        (window as unknown as { __pt?: { view?: (n: number) => unknown } }).__pt?.view?.(s) ?? null,
      seat,
    )) as View | null;
  }

  /** What the table shows right now: the seat it is drawn for and its phase. */
  async shown(): Promise<{ viewer: number | null; phase: string | null }> {
    return this.page.evaluate(() => {
      const dt = document.querySelector<HTMLElement>('.dt');
      const v = dt?.dataset.viewer;
      return {
        viewer: v === undefined || v === '' ? null : Number(v),
        phase: dt?.dataset.phase ?? null,
      };
    });
  }

  private async require(seat: SeatId): Promise<{ v: View } | { out: string }> {
    const v = await this.view(seat);
    if (!v) return { out: 'No game on screen (the page did not start one). Try `shot`.' };
    return { v };
  }

  async probe(seat: SeatId): Promise<Reply> {
    const r = await this.require(seat);
    if ('out' in r) return { out: r.out, ready: false };
    const { v } = r;
    if (isOver(v)) return { out: 'The game is over.\n' + resultText(v), ready: true };
    const shown = await this.shown();
    const mine = isWaiting(v, seat) && !at(v.seats, seat).pick;
    if (mine && shown.viewer === seat) return { out: await this.status(seat), ready: true };
    if (mine) {
      return {
        out: `Your move, but the table is showing seat ${(shown.viewer ?? -1) + 1}.`,
        ready: false,
      };
    }
    return { out: `Waiting for ${waitingNames(v, seat)}.`, ready: false };
  }

  async status(seat: SeatId): Promise<string> {
    const r = await this.require(seat);
    if ('out' in r) return r.out;
    const shown = await this.shown();
    const ui = `[UI: table drawn for seat ${shown.viewer === null ? '?' : shown.viewer + 1}, phase ${shown.phase ?? '?'}]`;
    return `${statusText(r.v, seat)}\n\n${ui}`;
  }

  // -------------------------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------------------------

  async run(
    seat: SeatId,
    cmd: string,
    args: string[],
    flags: Record<string, string>,
  ): Promise<Reply> {
    try {
      switch (cmd) {
        case 'status':
          return { out: await this.status(seat) };
        case 'cards':
          return { out: await this.cards(seat) };
        case 'pick':
          return { out: await this.pick(seat, args, flags) };
        case 'unpick':
          return { out: await this.unpick(seat) };
        case 'choose':
        case 'choose-gw':
          return { out: await this.choose(seat, args) };
        case 'dom':
          return { out: await this.dom(args.join(' ')) };
        case 'autoplay':
          return { out: await this.autoplay(Number(flags.moves || 400)) };
        case 'check':
          return { out: await this.check(seat) };
        case 'shot':
          return { out: await this.shot(seat, args[0]) };
        case 'console':
          return { out: this.console() };
        case 'result': {
          const v = await this.view(seat);
          return { out: v && isOver(v) ? resultText(v) : 'The game is not over yet.' };
        }
        case 'probe':
          return await this.probe(seat);
        default:
          return {
            out: `Unknown command "${cmd}". Try: status, cards, pick, unpick, choose, check, shot, console, wait.`,
          };
      }
    } catch (e) {
      return {
        out: `UI PROBLEM: ${firstLine(e)}\nRun \`shot\` to see the screen, and \`report\` it if the UI should have worked.`,
      };
    }
  }

  private async cards(seat: SeatId): Promise<string> {
    const r = await this.require(seat);
    if ('out' in r) return r.out;
    return cardsText(r.v, seat);
  }

  /** Is it this seat's turn to act on screen? Returns the reason it is not. */
  private async gate(seat: SeatId): Promise<{ v: View } | { out: string }> {
    await this.clearSeasonCard();
    const r = await this.require(seat);
    if ('out' in r) return r;
    const { v } = r;
    if (isOver(v)) return { out: 'The game is over.' };
    if (!isWaiting(v, seat)) return { out: `Not your move. Waiting for ${waitingNames(v, seat)}.` };
    const shown = await this.shown();
    if (shown.viewer !== seat) {
      return {
        out: `The table is drawn for seat ${(shown.viewer ?? -1) + 1}, not you. Run wait, then retry. (If this never clears it is a UI bug: report it.)`,
      };
    }
    return { v };
  }

  private async pick(
    seat: SeatId,
    words: string[],
    flags: Record<string, string>,
  ): Promise<string> {
    const g = await this.gate(seat);
    if ('out' in g) return g.out;
    const { v } = g;
    if (v.prompts.some((p) => p.seat === seat && !p.answered)) {
      return 'You have a question to answer first: see status, then choose <n>.';
    }
    if (flags.any !== undefined || flags.glean !== undefined || flags.burn !== undefined) {
      return '--any, --glean and --burn have no UI hooks yet: browser mode cannot set them (the UI picks defaults).';
    }
    const use = words[words.length - 1]?.toLowerCase();
    if (use !== 'build' && use !== 'spend') {
      return 'Usage: pick <n or card name> build|spend [--cover <name>|none] [--pay buy:<seat>,bank,exchange:<good>,auto]';
    }
    const hand = at(v.seats, seat).hand;
    const query = words.slice(0, -1).join(' ');
    let index: number;
    if (/^\d+$/.test(query)) index = Number(query) - 1;
    else {
      const m = matchChoice(
        query,
        hand.map((c) => rules.card(c.def).name),
      );
      if (m.kind !== 'one')
        return m.kind === 'many'
          ? `"${query}" matches more than one card.`
          : `No card called "${query}".`;
      index = m.index;
    }
    const card = hand[index];
    if (!card) return `No card ${index + 1}: your hand has ${hand.length}.`;
    const name = rules.card(card.def).name;

    await this.click(
      this.page.locator(`[data-pt-role="card"][data-card="${card.id}"]`),
      `card ${name}`,
    );
    // Choices inside the popover (cover, who to buy from), then the use button.
    const button = this.page.locator(`[data-pt-role="${use}"][data-card="${card.id}"]`);
    if ((await button.count()) === 0)
      return `UI PROBLEM: no ${use} button appeared for ${name}. Run \`shot\`.`;
    if (await button.isDisabled()) {
      const why = (await button.getAttribute('data-why')) ?? '';
      return `The UI has ${use} disabled for ${name}: "${why}".`;
    }
    const covered = flags.cover;
    if (covered !== undefined) {
      const tableau = at(v.seats, seat).tableau;
      let option = 'full';
      if (covered !== 'none') {
        const m = matchChoice(
          covered,
          tableau.map((c) => rules.card(c.def).name),
        );
        if (m.kind !== 'one') return '--cover: no unique card of that name in your town.';
        option = `cover-${at(tableau, m.index).id}`;
      }
      const err = await this.choose1(card.id, 'cover', option);
      if (err) return err;
    }
    if (flags.pay !== undefined) {
      const entries = flags.pay
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      for (const [i, entry] of entries.entries()) {
        if (entry === 'auto' || entry === '-') continue;
        const option = this.payOption(entry);
        if (!option) return `--pay: "${entry}" is not buy:<seat>, bank, exchange:<good> or auto.`;
        const err = await this.choose1(card.id, `pay-${i}-`, option);
        if (err) return err;
      }
    }
    if (await button.isDisabled()) {
      return `The UI disabled ${use} after the choices: "${(await button.getAttribute('data-why')) ?? ''}".`;
    }
    await this.click(button, `${use} button`);
    await this.page.waitForTimeout(SETTLE_MS);

    // Did the click do what it should? The view is the judge.
    const after = await this.view(seat);
    if (!after) return 'UI PROBLEM: the game vanished after the click.';
    const stored = at(after.seats, seat).pick;
    const moved = after.seq > v.seq;
    if (!moved) {
      const msgs = await this.page
        .locator('[role="alert"], [role="status"], .toast')
        .allInnerTexts();
      return `UI PROBLEM: clicked ${use} on ${name} but nothing was recorded (seq stayed ${v.seq}).${msgs.length ? ` Screen says: ${msgs.join(' | ')}` : ''}`;
    }
    if (stored && (stored.card !== card.id || stored.use !== use)) {
      return `UI PROBLEM: you asked for ${use} on card ${card.id}, the game recorded ${stored.use} on card ${stored.card}.`;
    }
    const note = presenter.describe?.(v, seat, stored ?? { card: card.id, use }) ?? '';
    return `Picked ${name} (${use})${note ? `: ${note}` : ''} — through the UI.\n${await this.progress(seat)}`;
  }

  /**
   * Plays every seat through the UI until the game ends (or `moves` actions): the first Build the
   * engine allows, else a Spend; Great Work choice 1. Returns what went wrong, if anything. A
   * smoke test of the whole table, not a player.
   */
  async autoplay(moves: number, tick?: () => Promise<void>): Promise<string> {
    const problems: string[] = [];
    let done = 0;
    for (; done < moves; done++) {
      await tick?.();
      const shown = await this.shown();
      if (shown.viewer === null) {
        problems.push(`move ${done}: the table shows no seat (phase ${shown.phase ?? '?'})`);
        break;
      }
      const seat = shown.viewer;
      const v = await this.view(seat);
      if (!v) {
        problems.push(`move ${done}: no view`);
        break;
      }
      if (isOver(v)) break;
      let out: string;
      try {
        out = await this.autoMove(v, seat);
      } catch (e) {
        out = `UI PROBLEM: ${firstLine(e)}`;
      }
      if (/UI PROBLEM|disabled|not your move|table is drawn|^Cannot|^No /i.test(out)) {
        problems.push(`move ${done} (seat ${seat + 1}): ${out.split('\n')[0]}`);
        if (problems.length >= 5) break;
      }
    }
    const v = await this.view(0);
    const end =
      v && isOver(v)
        ? `Game over after ${done} moves.\n${resultText(v)}`
        : `Stopped after ${done} moves, game not over.`;
    return problems.length
      ? `${end}\nPROBLEMS:\n- ${problems.join('\n- ')}`
      : `${end}\nNo UI problems met.`;
  }

  private async autoMove(v: View, seat: SeatId): Promise<string> {
    if (v.prompts.some((p) => p.seat === seat && !p.answered))
      return await this.choose(seat, ['1']);
    const hand = at(v.seats, seat).hand;
    const buildable = hand.findIndex((c) => {
      const pick = { card: c.id, use: 'build' };
      const p = engine.ruleset.normalizePick?.(v, seat, pick) ?? pick;
      return engine.ruleset.validatePick(v, seat, p) === null;
    });
    return await this.pick(
      seat,
      [String((buildable < 0 ? 0 : buildable) + 1), buildable < 0 ? 'spend' : 'build'],
      {},
    );
  }

  private payOption(entry: string): string | null {
    const [via, arg] = entry.split(':') as [string, string | undefined];
    if (via === 'bank') return 'bank';
    if (via === 'buy' && arg && /^\d+$/.test(arg)) return `buy-${Number(arg) - 1}`;
    if (via === 'exchange' && arg) {
      const m = matchChoice(
        arg,
        rules.content.goods.map((x) => x.name),
      );
      return m.kind === 'one' ? `exchange-${at(rules.goods, m.index)}` : null;
    }
    return null;
  }

  /** Click choice option `option` inside the row whose `data-choice` starts with `row`. */
  private async choose1(card: number, row: string, option: string): Promise<string | null> {
    const loc = this.page
      .locator(`[data-choice^="${row}"] [data-pt-role="choice"][data-option="${option}"]`)
      .first();
    // A card with no upgrade row has only the full-cost Build: `--cover none` is already true.
    if ((await loc.count()) === 0 && option === 'full') return null;
    if ((await loc.count()) === 0) return `The UI offers no "${option}" choice here (row ${row}).`;
    if (await loc.isDisabled()) {
      return `The UI has "${option}" disabled: "${(await loc.getAttribute('data-why')) ?? ''}".`;
    }
    await this.click(loc, `choice ${option} on card ${card}`);
    return null;
  }

  private async progress(seat: SeatId): Promise<string> {
    const v = await this.view(seat);
    if (!v) return '';
    if (isOver(v)) return `The game is over.\n${resultText(v)}`;
    if (isWaiting(v, seat)) return 'Everyone has played; it is your move again. Run status.';
    return `Waiting for ${waitingNames(v, seat)}.`;
  }

  private async unpick(seat: SeatId): Promise<string> {
    await this.clearSeasonCard();
    const shown = await this.shown();
    if (shown.viewer !== seat)
      return `The table is drawn for seat ${(shown.viewer ?? -1) + 1}, not you.`;
    const b = this.page.locator('[data-pt-role="unpick"]');
    if ((await b.count()) === 0)
      return 'No Change pick button on screen: you have no pick waiting.';
    await this.click(b, 'Change pick');
    await this.page.waitForTimeout(SETTLE_MS);
    const v = await this.view(seat);
    if (v && at(v.seats, seat).pick)
      return 'UI PROBLEM: clicked Change pick but the pick is still recorded.';
    return 'Pick withdrawn through the UI. Choose again with pick.';
  }

  private async choose(seat: SeatId, words: string[]): Promise<string> {
    const g = await this.gate(seat);
    if ('out' in g) return g.out;
    const { v } = g;
    const prompt = v.prompts.find((p) => p.seat === seat);
    if (!prompt) return 'Nothing to choose now.';
    const offers = ((prompt.data as { offers?: string[] } | null)?.offers ?? []) as string[];
    const info = presenter.prompt(prompt);
    const query = words.join(' ');
    let index = -1;
    if (/^\d+$/.test(query)) index = Number(query) - 1;
    else {
      const m = matchChoice(
        query,
        offers.map((o) => info.answer(o)),
      );
      if (m.kind === 'one') index = m.index;
    }
    const answer = offers[index];
    if (answer === undefined) {
      return `Choose one of: ${offers.map((o, i) => `${i + 1}. ${info.answer(o)}`).join('; ')}.`;
    }
    await this.click(
      this.page.locator(`[data-pt-role="answer"][data-answer="${answer}"]`),
      `answer ${info.answer(answer)}`,
    );
    await this.page.waitForTimeout(SETTLE_MS);
    const after = await this.view(seat);
    if (after && after.seq === v.seq)
      return `UI PROBLEM: clicked ${info.answer(answer)} but nothing was recorded.`;
    return `You chose ${info.answer(answer)} — through the UI.\n${await this.progress(seat)}`;
  }

  /**
   * UI vs engine for every card in the hand: is Build / Spend enabled on screen exactly when the
   * engine says it is legal, and does a disabled one give the engine's reason? Selects each card.
   */
  private async check(seat: SeatId): Promise<string> {
    const g = await this.gate(seat);
    if ('out' in g) return g.out;
    const { v } = g;
    const problems: string[] = [];
    let n = 0;
    for (const c of at(v.seats, seat).hand) {
      const name = rules.card(c.def).name;
      await this.click(
        this.page.locator(`[data-pt-role="card"][data-card="${c.id}"]`),
        `card ${name}`,
      );
      for (const use of ['build', 'spend'] as const) {
        const b = this.page.locator(`[data-pt-role="${use}"][data-card="${c.id}"]`);
        if ((await b.count()) === 0) {
          problems.push(`${name}: no ${use} button on screen`);
          continue;
        }
        const pick = engine.ruleset.normalizePick?.(v, seat, { card: c.id, use }) ?? {
          card: c.id,
          use,
        };
        const err = engine.ruleset.validatePick(v, seat, pick);
        const disabled = await b.isDisabled();
        n++;
        if (disabled !== (err !== null)) {
          problems.push(
            `${name}: ${use} is ${disabled ? 'disabled' : 'enabled'} on screen but the engine says ${err === null ? 'legal' : `illegal (${err})`}`,
          );
        } else if (disabled && err !== null) {
          const want = presenter.whyNot?.(v, seat, pick, err) ?? err;
          const got = (await b.getAttribute('data-why')) ?? '';
          if (got !== want) problems.push(`${name}: ${use} reason on screen "${got}" vs "${want}"`);
        }
      }
    }
    await this.page.keyboard.press('Escape');
    return problems.length
      ? `UI MISMATCHES (${problems.length} of ${n} buttons):\n- ${problems.join('\n- ')}`
      : `UI agrees with the engine on all ${n} Build/Spend buttons of your hand.`;
  }

  /** A look at the page for bug reports: how many elements match, their text and first HTML. */
  private async dom(selector: string): Promise<string> {
    if (!selector) return 'Usage: dom <css selector>';
    const loc = this.page.locator(selector);
    const n = await loc.count();
    if (n === 0) return `No element matches ${selector}.`;
    const first = loc.first();
    const html = (await first.evaluate((el) => el.outerHTML)).slice(0, 800);
    const box = await first.boundingBox();
    const hit = await first.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top && top !== el && !el.contains(top)
        ? `${top.tagName.toLowerCase()}.${top.className}`
        : null;
    });
    return [
      `${n} match(es) for ${selector}; first:`,
      html,
      `box: ${box ? JSON.stringify(box) : 'none (hidden)'}`,
      hit ? `COVERED by: ${hit}` : 'the centre of it is clickable (nothing on top).',
    ].join('\n');
  }

  private async shot(seat: SeatId, name?: string): Promise<string> {
    mkdirSync(SHOTS_DIR, { recursive: true });
    const file = join(SHOTS_DIR, `${Date.now()}-seat${seat + 1}-${name ?? 'table'}.png`);
    await this.page.screenshot({ path: file, fullPage: false });
    return file;
  }

  private console(): string {
    const fresh = this.log.slice(this.seen);
    this.seen = this.log.length;
    return fresh.length
      ? fresh.map((r) => `[${r.level}] ${r.text}`).join('\n')
      : 'No new console errors or warnings.';
  }

  /** The Season-end summary (UX.md §10.1) is modal and times out on its own: press Continue. */
  private async clearSeasonCard(): Promise<void> {
    const ok = this.page.locator('[data-act="season-ok"]');
    if ((await ok.count()) === 0) return;
    await ok
      .first()
      .click({ timeout: CLICK_TIMEOUT_MS })
      .catch(() => undefined);
    await this.page
      .locator('.dt-season-scrim')
      .waitFor({ state: 'detached', timeout: CLICK_TIMEOUT_MS })
      .catch(() => undefined);
    await this.page.waitForTimeout(SETTLE_MS);
  }

  private async click(loc: Locator, what: string): Promise<void> {
    try {
      await loc.click({ timeout: CLICK_TIMEOUT_MS });
    } catch (e) {
      const cover = await loc
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return top && top !== el && !el.contains(top)
            ? `${top.tagName.toLowerCase()}.${top.className}`
            : null;
        })
        .catch(() => null);
      throw new Error(
        `could not click ${what}: ${firstLine(e)}${cover ? ` (covered by ${cover})` : ''}`,
        { cause: e },
      );
    }
  }

  /** For `report`: the status text of the seat, or a note. */
  async statusFor(seat: SeatId): Promise<string> {
    return seat >= 0 ? await this.status(seat) : '(no seat)';
  }
}

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? 'error';
}
