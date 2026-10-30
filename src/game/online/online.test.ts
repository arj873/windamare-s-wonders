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
import type { KeyStore } from '../../net/transport';
import { windamereBinding } from '../windamere';
import { OnlineApp, type OnlineEnv } from './app';
import { inPageBackend } from './devBackend';
import { DevServer } from './devServer';
import { presence } from './netPlay';
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
  const env = (nick = ''): OnlineEnv<WwSeat, WwTable> & { tokens: ReturnType<typeof memStore> } => {
    let name = nick;
    return {
      backend,
      engine,
      present,
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
  return { clock, server, backend, env, mount, settle, tick, toasts };
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
    // Fast clock: the opening Great Work choice is a prompt (60 s x 0.5), then the first pick
    // gets 90 s x 0.5 (RULES.md R15.3), counted down from the server's number.
    expect(k(ann, 'online-table')).not.toBeNull();
    expect(ann.roomClient?.game?.view.phase.kind).toBe('prompt');
    expect(q(ann, '.dt-timer')?.textContent).toBe('0:30');
    w.clock.advance(10_000);
    w.tick();
    expect(q(ann, '.dt-timer')?.textContent).toBe('0:20');
    await toPicks(w, ann, bob);
    expect(ann.roomClient?.game?.view.phase.kind).toBe('pick');
    expect(q(ann, '.dt-timer')?.textContent).toBe('0:45');

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
    pickFirst(bob);
    await w.settle();
    // Everyone picked: revealed, next turn, both hands one card smaller.
    expect(ann.roomClient?.game?.view.turn).toBe((turn ?? 0) + 1);
    expect(bob.roomClient?.game?.view.lastReveal?.picks.length).toBe(4);
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
