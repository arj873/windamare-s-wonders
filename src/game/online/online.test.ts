// @vitest-environment jsdom
/**
 * The O1 flow on the real Windamere engine, no server: net's GameSession on a loopback (the
 * in-page dev server) on a FakeClock, two OnlineApps (two "tabs") with their own token stores.
 * Create room -> invite link -> nickname -> seats -> host starts -> per-seat table -> picks with
 * the waiting line -> reconnect banner -> chat.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_CARD } from '../../engine';
import { FakeClock } from '../../net/loopback';
import { clockMs } from '../../net/protocol';
import { sessionOptionsFrom } from '../../server/room';
import { clockText } from '../../ui/table/table';
import type { KeyStore } from '../../net/transport';
import { windamereBinding } from '../windamere';
import { OnlineApp, type OnlineEnv } from './app';
import { inPageBackend } from './devBackend';
import { DevServer } from './devServer';
import { bootOnline } from './index';
import { presence, roomLooks } from './netPlay';
import { seatColor } from '../../ui/online/lobbyModel';
import type { WwSeat, WwTable } from '../../engine';

type App = OnlineApp<WwSeat, WwTable>;

function memStore(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

/** Deterministic bytes for room codes, tokens and seeds. */
function seededBytes(seed = 7): (n: number) => Uint8Array {
  let x = seed;
  return (n) =>
    Uint8Array.from({ length: n }, () => {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      return x >>> 24;
    });
}

const apps: App[] = [];
afterEach(() => {
  for (const a of apps.splice(0)) a.dispose();
  document.body.replaceChildren();
});

function world() {
  const clock = new FakeClock(1_000_000);
  const server = new DevServer({
    clock,
    bytes: seededBytes(),
    session: { botDelayMs: 100, graceMs: 10_000 },
  });
  const backend = inPageBackend(server, clock);
  const { engine, present } = windamereBinding();
  const toasts: string[] = [];
  /** One reveal hook spy per env (per "tab"), in creation order. */
  const fxs: { onAction: ReturnType<typeof vi.fn>; skip: ReturnType<typeof vi.fn> }[] = [];
  const env = (nick = ''): OnlineEnv<WwSeat, WwTable> & { tokens: ReturnType<typeof memStore> } => {
    let name = nick;
    const fx = { onAction: vi.fn(), skip: vi.fn() };
    fxs.push(fx);
    return {
      backend,
      engine,
      present,
      fx,
      tokens: memStore(),
      clock,
      name: () => name,
      saveName: (n) => (name = n),
      href: 'http://localhost/src/game/online/dev.html',
      toast: (m) => void toasts.push(m),
      goHome: vi.fn(),
      random: () => 0.5,
      pingMs: 0,
      every: (fn) => {
        ticks.add(fn);
        return () => ticks.delete(fn);
      },
    };
  };
  /** The tables' timer ticks (NetPlay's `every`), run by hand. */
  const ticks = new Set<() => void>();
  const tick = () => ticks.forEach((fn) => fn());
  /** Each app gets its own box in the page, like a tab. */
  const mount = (app: App) => {
    apps.push(app);
    document.body.append(app.element);
    return app;
  };
  /** Let promises settle and deferred deliveries run. */
  const settle = async (ms = 0) => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      clock.advance(ms / 5);
    }
    clock.flush();
  };
  return { clock, server, backend, env, mount, settle, tick, toasts, fxs };
}

const q = (app: App, sel: string) => app.element.querySelector<HTMLElement>(sel);
const k = (app: App, key: string) => q(app, `[data-k="${key}"]`);

/** Host Ann creates; Bob opens the invite link and joins with a nickname. */
async function lobbyOfTwo() {
  const w = world();
  const ann = w.mount(await OnlineApp.create(w.env(), 'Ann'));
  await w.settle();
  const link = (k(ann, 'invite') as HTMLInputElement).value;
  const code = new URL(link).searchParams.get('room') ?? '';
  const bob = w.mount(new OnlineApp(w.env(), code));
  await bob.run();
  await w.settle();
  (k(bob, 'join-name') as HTMLInputElement).value = 'Bob';
  k(bob, 'join')?.click();
  await w.settle();
  return { w, ann, bob, code, link };
}

/** The game opens with the Great Work choice (a prompt group): take the first offer. */
function answerFirst(app: App): void {
  q(app, '.dt [data-act^="answer:"]')?.click();
}

/** Both humans answer the opening prompt; the bots answer after botDelayMs: now it's picks. */
async function toPicks(w: ReturnType<typeof world>, ...apps: App[]) {
  for (const a of apps) answerFirst(a);
  await w.settle(200);
}

/** The first playable card: select it, then its first legal use. */
function pickFirst(app: App): void {
  q(app, '.dt [data-act^="select:"][data-playable="true"]')?.click();
  q(app, '.dt [data-act^="pick:"]:not([disabled])')?.click();
}

describe('online room visit (O1)', () => {
  it('create -> invite -> nickname -> seats -> start -> per-seat table', async () => {
    const { w, ann, bob, code, link } = await lobbyOfTwo();
    expect(link).toBe(`http://localhost/src/game/online/dev.html?room=${code}`);
    expect(k(ann, 'room-code')?.textContent).toBe(code);
    // Joining auto-seats: Ann in seat 1, Bob in seat 2, two bot seats.
    for (const app of [ann, bob]) {
      const names = [...app.element.querySelectorAll('.ol-seat .ol-seat-label')].map(
        (e) => e.textContent,
      );
      expect(names).toEqual(['Ann', 'Bob', 'Bot', 'Bot']);
    }
    expect(k(bob, 'waiting-host')?.textContent).toContain('Waiting for Ann');
    // Host settings: a faster clock, one bot fewer. The guest sees the result.
    k(ann, 'timer-fast')?.click();
    await w.settle();
    k(ann, 'remove-bot')?.click();
    await w.settle();
    expect(k(bob, 'summary')?.textContent).toBe(
      'Online · 3 towns · 2 players + 1 bot · Fast clock',
    );
    // Chat in the lobby.
    const input = k(bob, 'chat-input') as HTMLInputElement;
    input.value = 'hi Ann';
    k(bob, 'chat-send')?.click();
    await w.settle();
    expect(q(ann, '.ol-chat-list')?.textContent).toContain('Bob hi Ann');

    k(ann, 'lobby-start')?.click();
    await w.settle();
    // Fast clock: the opening Great Work choice is a prompt, then the first pick (RULES.md
    // R15.3; lengths from net's clockMs so a retune does not break this), counted down from the
    // server's number between messages. The first pick of a Season also gets the Worker's
    // reading time for the Season card (R7 net #1), which the dev server copies.
    const bonusMs = sessionOptionsFrom({}).openingBonusMs ?? 0;
    expect(bonusMs).toBe(8_400);
    const promptMs = clockMs('fast', 'prompt', 0) ?? 0;
    const pickMs = (clockMs('fast', 'pick', 0) ?? 0) + bonusMs;
    expect(k(ann, 'online-table')).not.toBeNull();
    expect(ann.roomClient?.game?.view.phase.kind).toBe('prompt');
    expect(q(ann, '.dt-timer')?.textContent).toBe(clockText(promptMs));
    w.clock.advance(10_000);
    w.tick();
    expect(q(ann, '.dt-timer')?.textContent).toBe(clockText(promptMs - 10_000));
    await toPicks(w, ann, bob);
    expect(ann.roomClient?.game?.view.phase.kind).toBe('pick');
    expect(q(ann, '.dt-timer')?.textContent).toBe(clockText(pickMs));

    for (const [app, seat] of [
      [ann, 0],
      [bob, 1],
    ] as const) {
      const c = app.roomClient;
      if (!c?.game) throw new Error('no game');
      expect(c.mySeat).toBe(seat);
      const view = c.game.view;
      expect(view.view.viewer).toBe(seat);
      // Hidden information: only this seat's hand has faces; other hands are masked.
      for (const s of view.seats) {
        expect(s.hand.length).toBeGreaterThan(0);
        if (s.id === seat) expect(s.hand.every((card) => card.def !== HIDDEN_CARD)).toBe(true);
        else expect(s.hand.every((card) => card.def === HIDDEN_CARD)).toBe(true);
      }
      const shown = [...app.element.querySelectorAll('.dt [data-act^="select:"]')].map((e) =>
        Number((e as HTMLElement).dataset.card),
      );
      const own = view.seats[seat]?.hand.map((card) => card.id) ?? [];
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.sort()).toEqual(own.sort());
      // The chat moved into the table's dock.
      expect(q(app, '[data-k="chat-dock"] .ol-chat')).not.toBeNull();
    }
  });

  it('simultaneous picks: waiting line, locked pick, reveal moves both tables on', async () => {
    const { w, ann, bob } = await lobbyOfTwo();
    k(ann, 'lobby-start')?.click();
    await w.settle();
    await toPicks(w, ann, bob);
    // Bots pick after botDelayMs; then the game waits on the two humans.
    await w.settle(200);
    expect(k(ann, 'waiting-line')?.textContent).toBe('Waiting on 1 town: Bob');
    const turn = ann.roomClient?.game?.view.turn;
    pickFirst(ann);
    await w.settle();
    const annGame = ann.roomClient?.game;
    expect(annGame?.view.view.submitted[0]).toBe(true);
    // Ann's own pending pick comes back in her view (owner only) and her card shows as staged.
    const annPick = annGame?.view.seats[0]?.pick;
    expect(annPick).toEqual(expect.objectContaining({ card: expect.any(Number) }));
    expect(ann.netPlay?.current?.staged?.card.id).toBe(annPick?.card);
    expect(q(ann, '.dt-timer')?.textContent).toBe('✓');
    // Bob sees that Ann is done, never what she picked.
    const bobView = bob.roomClient?.game?.view;
    expect(bobView?.view.submitted[0]).toBe(true);
    expect(bobView?.seats[0]?.pick).toBeNull();
    expect(JSON.stringify(bobView)).not.toContain(`"card":${annPick?.card},"use"`);
    expect(k(bob, 'waiting-line')?.textContent).toBe('Your pick: everyone else is ready');
    const annFx = w.fxs[0];
    if (!annFx) throw new Error('no fx spy');
    const before = annFx.onAction.mock.calls.length;
    pickFirst(bob);
    await w.settle();
    // Everyone picked: revealed, next turn, both hands one card smaller.
    expect(ann.roomClient?.game?.view.turn).toBe((turn ?? 0) + 1);
    expect(bob.roomClient?.game?.view.lastReveal?.picks.length).toBe(4);
    // The reveal goes to the binding's fx hook (same seam as play.ts), keyed by actionKey, with
    // Ann's own view and the table's anchors.
    expect(annFx.onAction.mock.calls.length).toBeGreaterThan(before);
    const moment = annFx.onAction.mock.calls.at(-1)?.[0] as {
      key: string;
      view: { view: { viewer: number | null } };
      anchors: { root: HTMLElement };
    };
    expect(moment.key).toBe(ann.netPlay?.current?.actionKey);
    expect(moment.view.view.viewer).toBe(0);
    expect(moment.anchors.root.isConnected).toBe(true);
    // Never twice for the same action.
    const keys = annFx.onAction.mock.calls.map((c) => (c[0] as { key: string }).key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the first render of a table is not a reveal', async () => {
    const { w, ann } = await lobbyOfTwo();
    k(ann, 'lobby-start')?.click();
    await w.settle();
    expect(ann.netPlay?.current).not.toBeNull();
    expect(w.fxs[0]?.onAction).not.toHaveBeenCalled();
  });

  it('reconnect: banner while the link is down, same seat and view after', async () => {
    const { w, ann, bob, code } = await lobbyOfTwo();
    k(ann, 'lobby-start')?.click();
    await w.settle();
    await toPicks(w, ann, bob);
    const before = bob.roomClient?.game?.view.seats[1]?.hand.map((c) => c.id) ?? [];
    expect(before.length).toBeGreaterThan(0);
    // Ann's connection opened first.
    const annConn = w.server.conns(code)[0];
    if (annConn === undefined) throw new Error('no connection');
    w.server.cut(code, annConn);
    w.clock.flush();
    expect(ann.roomClient?.status).toBe('reconnecting');
    expect(k(ann, 'conn-banner')?.hidden).toBe(false);
    expect(k(ann, 'conn-banner')?.textContent).toContain('Reconnecting');
    // Bob's table shows Ann as offline.
    expect(k(bob, 'absent-0')?.textContent).toBe('Ann is offline');
    await w.settle(1000);
    expect(ann.roomClient?.status).toBe('open');
    expect(k(ann, 'conn-banner')?.hidden).toBe(true);
    expect(ann.roomClient?.mySeat).toBe(0);
    expect(k(bob, 'absent-0')).toBeNull();
    expect(bob.roomClient?.game?.view.seats[1]?.hand.map((c) => c.id)).toEqual(before);
  });

  it('a stored token goes straight in; an unknown room says so', async () => {
    const w = world();
    const env = w.env();
    const ann = w.mount(await OnlineApp.create(env, 'Ann'));
    await w.settle();
    const code = ann.roomId;
    ann.dispose();
    // Same "tab" (same token store): no join card, back in seat 1.
    const again = w.mount(new OnlineApp(env, code));
    await again.run();
    await w.settle();
    expect(k(again, 'join-card')).toBeNull();
    expect(again.roomClient?.mySeat).toBe(0);
    expect(again.roomClient?.isHost).toBe(true);

    const lost = w.mount(new OnlineApp(w.env(), 'ZZZZZZ'));
    await lost.run();
    expect(k(lost, 'notice')?.textContent).toContain('That room has closed');
  });

  it('a watcher without a seat sees no hand', async () => {
    const { w, ann, bob, code } = await lobbyOfTwo();
    const cy = w.mount(new OnlineApp(w.env(), code));
    await cy.run();
    await w.settle();
    k(cy, 'join-watch')?.click();
    await w.settle();
    expect(k(cy, 'watching')?.hidden).toBe(false);
    k(ann, 'lobby-start')?.click();
    await w.settle();
    await toPicks(w, ann, bob);
    const view = cy.roomClient?.game?.view;
    expect(view?.phase.kind).toBe('pick');
    expect(view?.view.viewer).toBeNull();
    expect(view?.seats.every((s) => s.hand.length > 0)).toBe(true);
    expect(view?.seats.every((s) => s.hand.every((c) => c.def === HIDDEN_CARD))).toBe(true);
    expect(view?.seats.every((s) => s.pick === null)).toBe(true);
    expect(q(cy, '.dt [data-act^="select:"]')).toBeNull();
    // ui's spectator layout (server's viewFor(state, 'spectator')): no hand row, a row of towns
    // to follow instead; following Bob's town shows it in the middle.
    expect(q(cy, '.dt-watch')).not.toBeNull();
    expect(q(cy, '.dt-hand')).toBeNull();
    k(cy, 'follow-1')?.click();
    expect(k(cy, 'follow-1')?.getAttribute('aria-checked')).toBe('true');
    expect(k(cy, 'you-watch')?.textContent).toBe('You can take a seat in the next game.');
    expect(k(ann, 'watchers')?.textContent).toBe('1 watching');
    // An unnamed watcher cannot chat.
    expect((k(cy, 'chat-input') as HTMLInputElement).disabled).toBe(true);
  });
});

/** Ann (host) and Bob in a started game on the Fast clock with one bot (3 towns). */
async function startedGame() {
  const t = await lobbyOfTwo();
  k(t.ann, 'timer-fast')?.click();
  await t.w.settle();
  k(t.ann, 'remove-bot')?.click();
  await t.w.settle();
  k(t.ann, 'lobby-start')?.click();
  await t.w.settle();
  return t;
}

/** Let the clock run: humans time out (R15.6 timeout pick), the bot plays, until game over. */
async function playToEnd(w: ReturnType<typeof world>, app: App): Promise<number> {
  let steps = 0;
  while (app.roomClient?.game?.view.phase.kind !== 'gameOver' && steps < 400) {
    await w.settle(30_000);
    steps++;
  }
  return steps;
}

describe('online room visit (O3)', () => {
  it('host sets a bot level and seat colours; the guest and the table follow', async () => {
    const { w, ann, bob } = await lobbyOfTwo();
    // Online bots default to Normal like hotseat's (net's own default is Easy): the host's
    // client fills the levels once, and the real session takes them.
    expect(ann.roomClient?.room?.config.botLevels).toEqual([
      'medium',
      'medium',
      'medium',
      'medium',
    ]);
    expect(k(bob, 'seat-3')?.textContent).toContain('a Normal bot plays it');
    // The real session accepts the lists and sends them back on every seat.
    const level = k(ann, 'level-2') as HTMLSelectElement;
    level.value = 'hard';
    level.dispatchEvent(new Event('change'));
    await w.settle();
    expect(bob.roomClient?.room?.seats.map((s) => s.botLevel)).toEqual([
      'medium',
      'medium',
      'hard',
      'medium',
    ]);
    expect(k(bob, 'seat-2')?.textContent).toContain('a Hard bot plays it');
    expect(k(bob, 'level-2')).toBeNull();
    // Ann takes Bob's colour: the two swap.
    k(ann, 'colour-0')?.click();
    k(ann, 'swatch-0-1')?.click();
    await w.settle();
    expect(bob.roomClient?.room?.seats.map((s) => s.colour)).toEqual([1, 0, 2, 3]);
    expect(k(bob, 'seat-0')?.style.getPropertyValue('--seat')).toBe(seatColor(1).color);
    // Then a free one; removing the last seat trims the lists so net still takes the config.
    k(ann, 'colour-0')?.click();
    k(ann, 'swatch-0-6')?.click();
    await w.settle();
    k(ann, 'remove-bot')?.click();
    await w.settle();
    const seats = bob.roomClient?.room?.seats ?? [];
    expect(seats.map((s) => s.colour)).toEqual([6, 0, 2]);
    expect(seats.map((s) => s.botLevel)).toEqual(['medium', 'medium', 'hard']);
    // A new seat gets the online default too.
    k(ann, 'add-bot')?.click();
    await w.settle();
    expect(bob.roomClient?.room?.seats[3]?.botLevel).toBe('medium');
    k(ann, 'remove-bot')?.click();
    await w.settle();
    expect(w.toasts).toEqual([]);
    // In the game the table and the chat use the chosen colours.
    k(ann, 'lobby-start')?.click();
    await w.settle();
    const looks = roomLooks(bob.roomClient?.room ?? null, 3);
    expect(looks.map((l) => l.color)).toEqual([6, 0, 2].map((c) => seatColor(c).color));
    expect(looks.map((l) => l.bot)).toEqual([false, false, true]);
  });
});

describe('online ☰ menu (O4)', () => {
  it('How to play, Animations and Sound in the lobby and the game; All cards on the table', async () => {
    const w = world();
    const openRules = vi.fn();
    const destroy = vi.fn();
    const openCards = vi.fn();
    let muted = false;
    const sound = {
      get muted() {
        return muted;
      },
      setMuted: vi.fn((m: boolean) => void (muted = m)),
    };
    const env = { ...w.env(), help: { attach: () => ({ openRules, destroy }), openCards }, sound };
    const ann = w.mount(await OnlineApp.create(env, 'Ann'));
    await w.settle();
    const openMenu = () => q(ann, '.ww-menu-btn')?.click();
    openMenu();
    const labels = [...ann.element.querySelectorAll('.ww-menu-item, .ww-menu-label')].map(
      (e) => e.firstChild?.textContent,
    );
    // R8 #4: no New game or Bot speed online (the room owns those).
    expect(labels).toEqual(['How to play', 'Animations', 'Sound']);
    k(ann, 'item-0')?.click();
    expect(openRules).toHaveBeenCalledTimes(1);
    openMenu();
    k(ann, 'choice-2-off')?.click();
    expect(sound.setMuted).toHaveBeenLastCalledWith(true);
    k(ann, 'choice-1-off')?.click();
    expect(document.documentElement.classList.contains('no-anim')).toBe(true);
    k(ann, 'choice-1-on')?.click();
    expect(document.documentElement.classList.contains('no-anim')).toBe(false);
    // The same menu over the table, and the hand's "All cards" opens the card list.
    k(ann, 'lobby-start')?.click();
    await w.settle();
    answerFirst(ann);
    await w.settle(200);
    expect(q(ann, '.ww-menu-btn')).not.toBeNull();
    k(ann, 'catalog')?.click();
    expect(openCards).toHaveBeenCalledWith(ann.roomClient?.game?.view);
    ann.dispose();
    expect(destroy).toHaveBeenCalled();
  });
});

describe('online room visit (O2)', () => {
  it('final scores -> host Rematch -> everyone back in the lobby -> a second game', async () => {
    const { w, ann, bob } = await startedGame();
    const steps = await playToEnd(w, ann);
    expect(ann.roomClient?.game?.view.phase.kind).toBe('gameOver');
    expect(steps).toBeLessThan(400);
    await w.settle();
    expect(ann.roomClient?.room?.phase).toBe('over');
    // Final scores on both tables; only the host can take the room back to the lobby.
    for (const app of [ann, bob]) {
      expect(q(app, '.dt-result')).not.toBeNull();
      expect(k(app, 'online-table')?.classList.contains('is-over')).toBe(true);
    }
    expect(k(ann, 'rematch')).not.toBeNull();
    expect(k(bob, 'rematch')).toBeNull();
    // UX.md §6: the result buttons say where they go online.
    expect(k(ann, 'rematch')?.textContent).toBe('Back to lobby');
    expect(k(ann, 'new')?.textContent).toBe('Leave room');
    expect(k(bob, 'new')?.textContent).toBe('Leave room');
    expect(k(ann, 'waiting-line')?.textContent).toBe(
      'Game over. Back to lobby takes everyone there for the next game.',
    );
    expect(k(bob, 'waiting-line')?.textContent).toBe(
      'Game over. Waiting for Ann to go back to the lobby.',
    );
    // Timed-out humans were told (R15.6, net's "ran out of time" line).
    expect(w.toasts).toContain('Time’s up: a card was picked for you');

    const firstFx = w.fxs[0]?.onAction.mock.calls.length ?? 0;
    k(ann, 'rematch')?.click();
    await w.settle();
    for (const app of [ann, bob]) {
      expect(app.roomClient?.room?.phase).toBe('lobby');
      expect(app.netPlay).toBeNull();
      expect(k(app, 'online-table')).toBeNull();
      expect(k(app, 'room-code')).not.toBeNull();
      // Same seats, same settings, and the chat is back in the lobby column.
      const names = [...app.element.querySelectorAll('.ol-seat .ol-seat-label')].map(
        (e) => e.textContent,
      );
      expect(names).toEqual(['Ann', 'Bob', 'Bot']);
      expect(k(app, 'summary')?.textContent).toContain('Fast clock');
      expect(q(app, '.ol-chat-slot .ol-chat')).not.toBeNull();
      expect(q(app, '.ol-chat-list')?.textContent).toContain('Back to the lobby');
    }
    k(ann, 'lobby-start')?.click();
    await w.settle();
    for (const app of [ann, bob]) {
      expect(k(app, 'online-table')).not.toBeNull();
      expect(app.roomClient?.game?.view.phase.kind).toBe('prompt');
      expect(q(app, '.dt-result')).toBeNull();
    }
    // A fresh table: its first render is not a reveal.
    expect(w.fxs[0]?.onAction.mock.calls.length).toBe(firstFx);
  });

  it('host leaves the lobby: offline note, then Bob becomes host with the controls', async () => {
    const { w, ann, bob } = await lobbyOfTwo();
    ann.dispose(); // closes Ann's socket (her token is kept, as after a crash)
    await w.settle();
    expect(k(bob, 'config-note')?.textContent).toMatch(/Ann\) is offline/);
    expect(k(bob, 'lobby-start')).toBeNull();
    await w.settle(10_000); // graceMs
    expect(bob.roomClient?.isHost).toBe(true);
    expect(k(bob, 'lobby-start')).not.toBeNull();
    expect((k(bob, 'timer-fast') as HTMLButtonElement).disabled).toBe(false);
    expect(q(bob, '.ol-chat-list')?.textContent).toContain('Bob is now the host');
    // Ann's seat was freed after the grace period (lobby rule).
    const names = [...bob.element.querySelectorAll('.ol-seat .ol-seat-label')].map(
      (e) => e.textContent,
    );
    expect(names).toEqual(['Bot', 'Bob', 'Bot', 'Bot']);
  });

  it('host leaves at final scores: Bob can open the rematch once he becomes host', async () => {
    const { w, ann, bob } = await startedGame();
    await playToEnd(w, ann);
    await w.settle();
    ann.dispose();
    await w.settle(10_000);
    // FINDING (net): nextWakeAt() is null in phase 'over', so the host hand-off waits for the
    // next message from anyone; a chat line from Bob triggers it.
    const handedOver = bob.roomClient?.isHost === true;
    if (!handedOver) {
      (k(bob, 'chat-input') as HTMLInputElement).value = 'rematch?';
      k(bob, 'chat-send')?.click();
      await w.settle();
    }
    expect(bob.roomClient?.isHost).toBe(true);
    // The result dialog re-renders with Bob's Rematch button.
    expect(k(bob, 'rematch')).not.toBeNull();
    k(bob, 'rematch')?.click();
    await w.settle();
    expect(bob.roomClient?.room?.phase).toBe('lobby');
    expect(k(bob, 'lobby-start')).not.toBeNull();
  });

  it('kick: host confirms, the player gets the removed screen, the seat is free', async () => {
    const { w, ann, bob } = await lobbyOfTwo();
    k(ann, 'kick-seat-1')?.click();
    const confirm = document.querySelector<HTMLElement>('.ww-scrim .btn-primary');
    expect(confirm?.textContent).toBe('Remove');
    confirm?.click();
    await w.settle();
    expect(bob.roomClient?.fatal?.code).toBe('kicked');
    expect(k(bob, 'notice')?.textContent).toContain('The host removed you from the room.');
    const names = [...ann.element.querySelectorAll('.ol-seat .ol-seat-label')].map(
      (e) => e.textContent,
    );
    expect(names).toEqual(['Ann', 'Bot', 'Bot', 'Bot']);
    expect(q(ann, '.ol-chat-list')?.textContent).toContain('Bob was removed');
  });

  it('watch with a nickname in the lobby: no seat, but can chat', async () => {
    const { w, ann, code } = await lobbyOfTwo();
    const cy = w.mount(new OnlineApp(w.env(), code));
    await cy.run();
    await w.settle();
    (k(cy, 'join-name') as HTMLInputElement).value = 'Cy';
    k(cy, 'join-watch')?.click();
    await w.settle();
    expect(cy.roomClient?.mySeat).toBeNull();
    expect(k(cy, 'watching')?.hidden).toBe(false);
    expect((k(cy, 'chat-input') as HTMLInputElement).disabled).toBe(false);
    expect(k(ann, `spec-${cy.roomClient?.you?.member ?? ''}`)?.textContent).toContain('Cy');
    const seats = ann.roomClient?.room?.seats.map((s) => s.occupant !== null);
    expect(seats).toEqual([true, true, false, false]);
  });
});

describe('presence', () => {
  it('counts the towns still owed a pick, names the absent', async () => {
    const { w, ann, bob } = await lobbyOfTwo();
    k(ann, 'lobby-start')?.click();
    await w.settle();
    const game = ann.roomClient?.game;
    const room = ann.roomClient?.room ?? null;
    if (!game || !room) throw new Error('no game');
    const p = presence({ ...game, waiting: [0, 1, 2] }, room, 0);
    expect(p.line).toBe('Waiting on 2 towns: Bob and Bot 3');
    expect(presence({ ...game, waiting: [] }, room, 0).line).toBe('');
    const away = {
      ...room,
      seats: room.seats.map((s, i) => (i === 1 ? { ...s, status: 'bot' as const } : s)),
    };
    expect(presence(game, away, 0).absent.map((s) => s.name)).toEqual(['Bob']);
    void bob;
  });
});

describe('bootOnline (ui boot({ online }) adapter)', () => {
  it('create mounts the lobby into boot root; a bad code is a toast', async () => {
    const server = new DevServer({ bytes: seededBytes(3) });
    const toast = vi.fn();
    const online = bootOnline(windamereBinding(), {
      backend: inPageBackend(server),
      goHome: vi.fn(),
      toast,
    });
    const root = document.createElement('div');
    document.body.append(root);
    try {
      online.create('Ann', root);
      await vi.waitFor(() => expect(root.querySelector('[data-k="room-code"]')).not.toBeNull());
      const code = root.querySelector('[data-k="room-code"]')?.textContent ?? '';
      expect(online.launcher.current?.roomId).toBe(code);
      await vi.waitFor(() =>
        expect(root.querySelector('.ol-seat .ol-seat-label')?.textContent).toBe('Ann'),
      );
      online.join('not a code', '', root);
      await vi.waitFor(() => expect(toast).toHaveBeenCalled());
      expect(String(toast.mock.calls[0]?.[0])).toMatch(/not a room code/);
      // The lobby stays up after a bad code.
      expect(root.querySelector('[data-k="room-code"]')?.textContent).toBe(code);
    } finally {
      online.launcher.close();
      server.dispose();
    }
  });
});
