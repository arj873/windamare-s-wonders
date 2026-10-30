import { describe, expect, it } from 'vitest';
import type { DraftView } from '../engine';
import { toy } from '../engine/core/testing/helpers';
import type { ToySeat, ToyTable } from '../engine/core/testing/toy';
import { GameSession, type SessionOptions } from './session';
import { fakeDeps, LocalNet } from './testHarness';

type Net = LocalNet<ToySeat, ToyTable>;
type View = DraftView<ToySeat, ToyTable>;

/** Ann (host, seat 0) and Bob (seat 1) online, seat 2 is a bot. Lobby, nothing started. */
function lobby(opts: Partial<SessionOptions> = {}, options?: Record<string, number | boolean>) {
  const { session, hostToken } = GameSession.create('ROOM01', 0, toy, fakeDeps(), {
    openingBonusMs: 0,
    ...opts,
  });
  const net: Net = new LocalNet(session);
  net.connect('c1');
  net.send('c1', { type: 'hello', token: hostToken, name: 'Ann' });
  net.connect('c2');
  net.send('c2', { type: 'hello', token: null, name: 'Bob' });
  net.send('c1', {
    type: 'configure',
    config: { seatCount: 3, timer: 'normal', ...(options ? { options } : {}) },
  });
  const bobToken = net.last('c2', 'welcome')!.you.token;
  return { net, session, hostToken, bobToken };
}

function started(opts: Partial<SessionOptions> = {}, options?: Record<string, number | boolean>) {
  const t = lobby(opts, options);
  t.net.send('c1', { type: 'start' });
  return t;
}

const game = (net: Net, c: string) => net.last(c, 'game')!;
const view = (net: Net, c: string) => game(net, c).view as View;
const seatOf = (net: Net, c: string) => view(net, c).view.viewer!;
const handOf = (net: Net, c: string) => view(net, c).seats[seatOf(net, c)]!.hand;
const sell = (net: Net, c: string, i = 0) => ({ card: handOf(net, c)[i]!.id, use: 'sell' });
const phase = (net: Net) => net.session.currentPhase;

/** Seat `c` answers whatever the game asks of it; true if it acted. */
function play(net: Net, c: string): boolean {
  const g = game(net, c);
  const a = g.waiting.includes(seatOf(net, c)) ? g.legal[0] : undefined;
  if (!a) return false;
  if (a.type === 'pick') net.send(c, { type: 'pick', pick: sell(net, c) });
  else if (a.type === 'answer') {
    net.send(c, { type: 'answer', prompt: a.prompt, answer: a.answer });
  } else return false;
  return true;
}

/** Both humans act until the game ends; bots follow on the clock. */
function playOut(net: Net) {
  for (let i = 0; i < 200 && phase(net) === 'playing'; i++) {
    const acted = play(net, 'c1') || play(net, 'c2');
    if (!acted) net.advance(900);
  }
}

/** Every card id in a message that carries a real face (id >= 0). */
function cardIds(x: unknown, out = new Set<number>()): Set<number> {
  if (Array.isArray(x)) x.forEach((v) => cardIds(v, out));
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o['id'] === 'number' && typeof o['def'] === 'string' && o['id'] >= 0) {
      out.add(o['id']);
    }
    Object.values(o).forEach((v) => cardIds(v, out));
  }
  return out;
}

describe('lobby', () => {
  it('auto-seats named members in order and the rest are bots', () => {
    const { net } = lobby();
    const room = net.last('c1', 'room')!.room;
    expect(room.seats.map((s) => s.occupant)).toEqual(['m1', 'm2', null]);
    expect(room.seats.map((s) => s.status)).toEqual(['human', 'human', 'bot']);
  });

  it('only the host may start; start needs a seated member', () => {
    const { net } = lobby();
    net.send('c2', { type: 'start' });
    expect(net.last('c2', 'error')!.code).toBe('not_host');
    net.send('c1', { type: 'start' });
    expect(net.last('c1', 'room')!.room.phase).toBe('playing');
  });

  it('refuses a config the engine rejects', () => {
    const { net } = lobby({}, { rounds: -3 });
    net.send('c1', { type: 'start' });
    expect(net.last('c1', 'error')!.code).toBe('bad_config');
    expect(phase(net)).toBe('lobby');
  });

  it('rejects frames before hello, bad JSON, wrong versions and unknown keys', () => {
    const { session } = lobby();
    const net: Net = new LocalNet(session);
    net.connect('x');
    net.sendRaw('x', JSON.stringify({ v: 1, type: 'sync' }));
    expect(net.last('x', 'error')!.code).toBe('not_joined');
    net.sendRaw('x', 'not json');
    expect(net.last('x', 'error')!.code).toBe('bad_message');
    net.sendRaw('x', JSON.stringify({ v: 2, type: 'sync' }));
    expect(net.last('x', 'error')!.code).toBe('version_mismatch');
    expect(net.closed.get('x')).toBe(4000);
    net.sendRaw('x', JSON.stringify({ v: 1, type: 'start', extra: 1 }));
    expect(net.last('x', 'error')!.code).toBe('bad_message');
  });

  it('makes nicknames unique', () => {
    const { net } = lobby();
    net.connect('c3');
    net.send('c3', { type: 'hello', token: null, name: 'ann' });
    expect(net.last('c3', 'room')!.room.members.map((m) => m.name)).toEqual([
      'Ann',
      'Bob',
      'ann 2',
    ]);
  });
});

describe('simultaneous picks (real engine, toy ruleset)', () => {
  it('hides a pick until the last seat is in, then reveals it', () => {
    const { net } = started();
    expect(game(net, 'c1').waiting).toEqual([0, 1, 2]);
    net.send('c1', { type: 'pick', pick: sell(net, 'c1') });
    expect(view(net, 'c1').seats[0]!.pick).not.toBeNull(); // own pick, so a reconnect shows it
    expect(view(net, 'c2').seats[0]!.pick).toBeNull();
    expect(view(net, 'c2').view.submitted).toEqual([true, false, false]);
    expect(game(net, 'c2').waiting).toEqual([1, 2]);

    net.send('c2', { type: 'pick', pick: sell(net, 'c2') });
    expect(view(net, 'c1').turn).toBe(0); // the bot has not acted yet
    net.advance(900);
    expect(view(net, 'c1').turn).toBe(1);
    expect(view(net, 'c1').lastReveal!.picks.map((p) => p.seat)).toEqual([0, 1, 2]);
  });

  it('never sends a seat anything it must not know, over a whole game', () => {
    const { net, session } = started({}, { opening: true });
    const connOf: Record<string, number> = { c1: 0, c2: 1 };
    const check = () => {
      const st = session.fullState!;
      for (const [c, seat] of Object.entries(connOf)) {
        const g = game(net, c);
        const ids = cardIds(g);
        expect(ids.size).toBeGreaterThan(0); // the scan does find faces
        const secret = new Set<number>([
          ...st.deck.map((x) => x.id),
          ...st.seats.filter((s) => s.id !== seat).flatMap((s) => s.hand.map((x) => x.id)),
          ...st.seats
            .filter((s) => s.id !== seat)
            .flatMap((s) => s.zones['stash'] ?? [])
            .map((x) => x.id),
        ]);
        for (const id of ids) expect(secret.has(id), `${c} saw card ${id}`).toBe(false);
        const v = g.view as View;
        v.seats.forEach((s, i) => {
          if (i !== seat) expect(s.pick).toBeNull();
        });
        expect(v.config.seed).not.toBe(st.config.seed);
        expect(v.rng).toEqual([0, 0, 0, 0]);
        // Only this seat's own moves are offered.
        for (const a of g.legal) expect(a.seat).toBe(seat);
        if (st.prompts[0] && st.prompts[0].seat !== seat) {
          expect(v.prompts[0]!.data).toBeNull();
        }
      }
    };
    for (let i = 0; i < 200 && phase(net) === 'playing'; i++) {
      check();
      if (!(play(net, 'c1') || play(net, 'c2'))) net.advance(900);
    }
    expect(phase(net)).toBe('over');
    // A spectator learns no more than an opponent.
    net.connect('s');
    net.send('s', { type: 'hello', token: null, name: 'Eve' });
    const sv = game(net, 's');
    expect(sv.legal).toEqual([]);
    expect(sv.view.seats.every((s) => s.pick === null)).toBe(true);
    expect(sv.view.deck.every((c) => c.id < 0)).toBe(true);
  });

  it('refuses illegal, malformed and unauthorised picks', () => {
    const { net } = started();
    net.send('c1', { type: 'pick', pick: { card: 9999, use: 'sell' } });
    expect(net.last('c1', 'error')!.code).toBe('illegal_action');
    net.send('c1', { type: 'pick', pick: { card: 'x', use: 'sell' } as never });
    expect(net.last('c1', 'error')!.code).toBe('bad_message');
    net.sendRaw(
      'c1',
      JSON.stringify({ v: 1, type: 'pick', pick: { card: 1, use: 'sell', seat: 1 } }),
    );
    expect(net.last('c1', 'error')!.code).toBe('bad_message');
    net.connect('s');
    net.send('s', { type: 'hello', token: null, name: 'Eve' });
    net.send('s', { type: 'pick', pick: { card: 0, use: 'sell' } });
    expect(net.last('s', 'error')!.code).toBe('not_seated');
  });

  it('lets a seat change or withdraw its pick before the reveal', () => {
    const { net } = started();
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0) });
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 1) });
    expect(view(net, 'c1').seats[0]!.pick!.card).toBe(handOf(net, 'c1')[1]!.id);
    net.send('c1', { type: 'unpick' });
    expect(view(net, 'c1').seats[0]!.pick).toBeNull();
    expect(view(net, 'c2').view.submitted[0]).toBe(false);
  });

  it('runs prompts: only the prompted seat sees the options and answers', () => {
    const { net } = started({}, { opening: true });
    const first = game(net, 'c1').waiting;
    expect(first).toEqual([0]);
    expect(view(net, 'c2').prompts[0]!.data).toBeNull();
    net.send('c2', { type: 'answer', prompt: view(net, 'c1').prompts[0]!.id, answer: 'none' });
    expect(net.last('c2', 'error')!.code).toBe('illegal_action');
    net.send('c1', { type: 'answer', prompt: view(net, 'c1').prompts[0]!.id, answer: 'coins' });
    expect(game(net, 'c1').waiting).toEqual([1]);
  });
});

describe('clock', () => {
  it('adds the Season card time to the first pick clock only (R7 net #1)', () => {
    const { net } = started({ openingBonusMs: 8_400 });
    expect(game(net, 'c1').timer).toEqual({ remainingMs: 53_400, totalMs: 53_400 });
    net.send('c1', { type: 'pick', pick: sell(net, 'c1') });
    net.send('c2', { type: 'pick', pick: sell(net, 'c2') });
    net.advance(1_000);
    expect(game(net, 'c1').timer!.totalMs).toBe(40_000);
  });

  it('plays the engine default for slow seats when the clock runs out', () => {
    const { net } = started();
    net.send('c1', { type: 'pick', pick: sell(net, 'c1') });
    expect(game(net, 'c1').timer).toEqual({ remainingMs: 45_000, totalMs: 45_000 });
    net.advance(44_999);
    expect(view(net, 'c1').turn).toBe(0);
    net.advance(1);
    expect(view(net, 'c1').turn).toBe(1);
    expect(net.messages('c1', 'chat').some((c) => c.entry.text === 'Bob ran out of time')).toBe(
      true,
    );
    expect(game(net, 'c1').timer!.totalMs).toBe(40_000); // turn 2's clock is shorter (R15.3)
  });

  it('waits for humans when the timer is off', () => {
    const { net } = lobby();
    net.send('c1', { type: 'configure', config: { seatCount: 3, timer: 'off' } });
    net.send('c1', { type: 'start' });
    net.advance(3_600_000);
    expect(view(net, 'c1').turn).toBe(0);
    expect(game(net, 'c1').timer).toBeNull();
  });
});

describe('disconnects and reconnects', () => {
  it('waits the away wait (R15.5), not the whole clock, for an away seat', () => {
    const { net } = started();
    net.disconnect('c2');
    net.send('c1', { type: 'pick', pick: sell(net, 'c1') });
    net.advance(900); // the bot acts; from now only Bob is outstanding
    net.advance(14_999);
    expect(view(net, 'c1').turn).toBe(0);
    net.advance(1);
    expect(view(net, 'c1').turn).toBe(1);
  });

  it('the away wait never runs past the clock, and works with the clock off', () => {
    const { net } = started({ awayWaitMs: 1_000_000, graceMs: 1_000_000 });
    net.disconnect('c2');
    net.send('c1', { type: 'pick', pick: sell(net, 'c1') });
    net.advance(44_999);
    expect(view(net, 'c1').turn).toBe(0);
    net.advance(1);
    expect(view(net, 'c1').turn).toBe(1);

    const off = lobby();
    off.net.send('c1', { type: 'configure', config: { seatCount: 3, timer: 'off' } });
    off.net.send('c1', { type: 'start' });
    off.net.disconnect('c2');
    off.net.send('c1', { type: 'pick', pick: sell(off.net, 'c1') });
    off.net.advance(900 + 15_000);
    expect(view(off.net, 'c1').turn).toBe(1);
  });

  it('a seat that comes back during the away wait is waited for', () => {
    const { net, bobToken } = started();
    net.disconnect('c2');
    net.send('c1', { type: 'pick', pick: sell(net, 'c1') });
    net.advance(10_000);
    net.connect('c2b');
    net.send('c2b', { type: 'hello', token: bobToken });
    net.advance(20_000);
    expect(view(net, 'c1').turn).toBe(0); // Bob is here and has not picked: wait for the clock
  });

  it('keeps a pick across a reconnect mid-round and shows it again', () => {
    const { net, bobToken } = started();
    const pick = sell(net, 'c2');
    net.send('c2', { type: 'pick', pick });
    net.disconnect('c2');
    net.connect('c2b');
    net.send('c2b', { type: 'hello', token: bobToken });
    const v = view(net, 'c2b');
    expect(v.seats[1]!.pick).toEqual(pick);
    expect(v.view.submitted[1]).toBe(true);
    expect(net.last('c1', 'room')!.room.seats[1]!.status).toBe('human');
  });

  it('hands a seat to a bot after the grace period and gives it back on return', () => {
    const { net, bobToken } = started();
    net.disconnect('c2');
    expect(net.last('c1', 'room')!.room.seats[1]!.status).toBe('away');
    net.advance(60_000);
    expect(net.last('c1', 'room')!.room.seats[1]!.status).toBe('bot');
    net.connect('c2b');
    net.send('c2b', { type: 'hello', token: bobToken });
    expect(net.last('c2b', 'room')!.room.seats[1]!.status).toBe('human');
    expect(net.messages('c2b', 'welcome')[0]!.chat.some((c) => /took over/.test(c.text))).toBe(
      true,
    );
  });

  it('replaces an older socket of the same member', () => {
    const { net, bobToken } = started();
    net.connect('c2b');
    net.send('c2b', { type: 'hello', token: bobToken });
    expect(net.closed.get('c2')).toBe(4003);
  });

  it('pauses with nobody connected, then resumes with the clock where it stood', () => {
    const { net, hostToken } = started();
    net.advance(20_000);
    net.disconnect('c1');
    net.disconnect('c2');
    net.advance(3_600_000);
    expect(phase(net)).toBe('playing');
    net.connect('c1b');
    net.send('c1b', { type: 'hello', token: hostToken });
    expect(view(net, 'c1b').turn).toBe(0);
    expect(game(net, 'c1b').timer!.remainingMs).toBe(25_000);
  });

  it('expires an empty room after the idle period', () => {
    const { net, session } = lobby();
    net.disconnect('c1');
    net.disconnect('c2');
    expect(session.isExpired(net.now + 23 * 3_600_000)).toBe(false);
    expect(session.isExpired(net.now + 24 * 3_600_000)).toBe(true);
    net.now += 25 * 3_600_000;
    net.connect('late');
    net.send('late', { type: 'hello', token: null, name: 'Zed' });
    expect(net.last('late', 'error')!.code).toBe('room_expired');
    expect(net.closed.get('late')).toBe(4004);
  });
});

describe('snapshot', () => {
  it('survives a JSON round trip mid-round with pending picks intact, and plays on', () => {
    const { net, session, bobToken, hostToken } = started();
    net.send('c2', { type: 'pick', pick: sell(net, 'c2') });
    const snap = JSON.parse(JSON.stringify(session.snapshot()));
    const again = GameSession.restore(snap, toy, fakeDeps('r'));
    const net2: Net = new LocalNet(again, net.now);
    net2.connect('n');
    net2.send('n', { type: 'hello', token: bobToken });
    expect(view(net2, 'n').seats[1]!.pick).not.toBeNull();
    net2.connect('h');
    net2.send('h', { type: 'hello', token: hostToken });
    for (let i = 0; i < 200 && again.currentPhase === 'playing'; i++) {
      if (!(play(net2, 'h') || play(net2, 'n'))) net2.advance(900);
    }
    expect(again.currentPhase).toBe('over');
  });
});

describe('game over and rematch', () => {
  it('ends with a result, returns to the lobby on rematch and can start again', () => {
    const { net } = started();
    playOut(net);
    expect(net.last('c1', 'room')!.room.phase).toBe('over');
    expect(view(net, 'c1').result!.winners.length).toBeGreaterThan(0);
    net.send('c2', { type: 'rematch' });
    expect(net.last('c2', 'error')!.code).toBe('not_host');
    net.send('c1', { type: 'rematch' });
    expect(net.last('c1', 'room')!.room.phase).toBe('lobby');
    net.send('c1', { type: 'start' });
    expect(view(net, 'c1').round).toBe(0);
  });
});

describe('hardening (audit Q0-N1..N4)', () => {
  it('one socket cannot fill the room with throwaway members (N1)', () => {
    const { net } = lobby();
    net.connect('flood');
    for (let i = 0; i < 50; i++) net.send('flood', { type: 'hello', token: null, name: `F${i}` });
    expect(net.session.room().members.length).toBeLessThanOrEqual(4); // Ann, Bob, one flooder
    net.connect('late');
    net.send('late', { type: 'hello', token: null, name: 'Late' });
    expect(net.last('late', 'welcome')).toBeDefined();
  });

  it('a second hello on a bound socket needs the same token (N2)', () => {
    const { net, bobToken } = lobby();
    net.send('c2', { type: 'hello', token: null, name: 'Eli' });
    expect(net.last('c2', 'error')!.code).toBe('bad_message');
    net.send('c2', { type: 'hello', token: bobToken });
    expect(net.last('c2', 'welcome')).toBeDefined();
    net.disconnect('c2');
    const members = net.session.room().members;
    expect(members.filter((m) => m.connected).map((m) => m.name)).toEqual(['Ann']);
  });

  it('passes the host on after the grace period (N3)', () => {
    const { net } = lobby();
    net.disconnect('c1');
    net.advance(59_999);
    expect(net.session.room().host).toBe('m1');
    net.advance(1);
    expect(net.session.room().host).toBe('m2');
    net.send('c2', { type: 'start' });
    expect(net.last('c2', 'room')!.room.phase).toBe('playing');
  });

  it('carries a bot level and a distinct colour per seat (N4)', () => {
    const { net, session } = lobby();
    net.send('c1', {
      type: 'configure',
      config: { seatCount: 3, timer: 'off', botLevels: ['easy', 'easy', 'hard'], colours: [2, 0] },
    });
    const seats = session.room().seats;
    expect(seats.map((x) => x.botLevel)).toEqual(['easy', 'easy', 'hard']);
    expect(seats.map((x) => x.colour)).toEqual([2, 0, 1]); // unchosen seats take the free slots
    net.send('c1', { type: 'configure', config: { seatCount: 3, timer: 'off', colours: [1, 1] } });
    expect(net.last('c1', 'error')!.code).toBe('bad_message');
    net.send('c1', {
      type: 'configure',
      config: { seatCount: 3, timer: 'off', botLevels: ['god' as 'easy'] },
    });
    expect(net.last('c1', 'error')!.code).toBe('bad_message');
    expect(session.room().seats[2]!.botLevel).toBe('hard');
  });

  it('turns an engine that throws or a bad seat count into bad_config (N4)', () => {
    const { net, session } = lobby();
    net.send('c1', { type: 'configure', config: { seatCount: 9, timer: 'off' } });
    expect(net.last('c1', 'error')!.code).toBe('bad_message'); // protocol bound
    net.send('c1', { type: 'configure', config: { seatCount: 8, timer: 'off' } });
    expect(net.last('c1', 'error')!.code).toBe('bad_config'); // toy ruleset seats 2..5
    expect(session.room().config.seatCount).toBe(3);

    const throwing = {
      ...toy,
      createGame: () => {
        throw new Error('boom');
      },
      ruleset: toy.ruleset,
    };
    const t = GameSession.create('R2', 0, throwing as typeof toy, fakeDeps());
    const n2: Net = new LocalNet(t.session);
    n2.connect('a');
    n2.send('a', { type: 'hello', token: t.hostToken, name: 'Ann' });
    expect(() => n2.send('a', { type: 'start' })).not.toThrow();
    expect(n2.last('a', 'error')!.code).toBe('bad_config');
    expect(t.session.currentPhase).toBe('lobby');
  });
});
