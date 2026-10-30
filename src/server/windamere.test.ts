import { describe, expect, it } from 'vitest';
import { GameSession } from '../net/session';
import { fakeDeps, LocalNet } from '../net/testHarness';
import { roomEngine } from './engine';

describe('the room server hosts the shipped Windamere engine', () => {
  it('builds the engine', () => {
    const e = roomEngine();
    expect(e.ruleset.minSeats).toBeGreaterThanOrEqual(2);
  });

  it('plays a whole game: one human, the rest bots, on the clock', () => {
    const engine = roomEngine();
    const { session, hostToken } = GameSession.create('WIND01', 0, engine, fakeDeps(), {
      botDelayMs: 0,
    });
    const net = new LocalNet(session);
    net.connect('a');
    net.send('a', { type: 'hello', token: hostToken, name: 'Ann' });
    net.send('a', { type: 'configure', config: { seatCount: 4, timer: 'fast' } });
    net.send('a', { type: 'start' });
    expect(net.last('a', 'error')).toBeUndefined();
    expect(session.currentPhase).toBe('playing');
    // Ann never acts: her turns time out (R15.6), the bots play. Walk the clock to the end.
    for (let i = 0; i < 400 && session.currentPhase === 'playing'; i++) net.advance(10_000);
    expect(session.currentPhase).toBe('over');
    const g = net.last('a', 'game')!;
    expect(g.view.result?.winners.length).toBeGreaterThan(0);
  });

  it('First game (R19, ENGINE §15.5): starts in the pick phase, no Honours, one Great Work each', () => {
    const engine = roomEngine();
    const { session, hostToken } = GameSession.create('WIND03', 0, engine, fakeDeps(), {
      botDelayMs: 0,
    });
    const net = new LocalNet(session);
    net.connect('a');
    net.send('a', { type: 'hello', token: hostToken, name: 'Ann' });
    net.send('a', {
      type: 'configure',
      config: { seatCount: 3, timer: 'relaxed', options: { firstGame: true } },
    });
    net.send('a', { type: 'start' });
    expect(net.last('a', 'error')).toBeUndefined();
    const v = net.last('a', 'game')!.view as unknown as {
      config: { options?: { firstGame?: boolean } };
      phase: { kind: string };
      table: { honours: unknown[] };
      seats: { data: { greatWork: unknown } }[];
    };
    expect(v.config.options?.firstGame).toBe(true);
    expect(v.phase.kind).toBe('pick'); // no Great Work choice (R19.4)
    expect(v.table.honours).toEqual([]);
    expect(v.seats.every((x) => typeof x.data.greatWork === 'string')).toBe(true);
    for (let i = 0; i < 400 && session.currentPhase === 'playing'; i++) net.advance(10_000);
    expect(session.currentPhase).toBe('over');

    // A misspelt option must not silently play the full game.
    const again = GameSession.create('WIND04', 0, engine, fakeDeps(), {}).session;
    const n2 = new LocalNet(again);
    n2.connect('a');
    n2.send('a', { type: 'hello', token: null, name: 'Ann' });
    n2.send('a', {
      type: 'configure',
      config: { seatCount: 3, timer: 'off', options: { firstGam: true } },
    });
    n2.send('a', { type: 'start' });
    expect(again.currentPhase).toBe('lobby');
  });

  it('leaks nothing: every seat sees only its own hand, pick and prompt data, all game long', () => {
    const engine = roomEngine();
    const { session, hostToken } = GameSession.create('WIND02', 0, engine, fakeDeps(), {
      botDelayMs: 0,
    });
    const net = new LocalNet(session);
    net.connect('a');
    net.send('a', { type: 'hello', token: hostToken, name: 'Ann' });
    net.connect('b');
    net.send('b', { type: 'hello', token: null, name: 'Bob' });
    net.send('a', { type: 'configure', config: { seatCount: 4, timer: 'normal' } });
    net.send('a', { type: 'start' });
    const seats: Record<string, number> = { a: 0, b: 1 };

    const faces = (x: unknown, path = '', out = new Map<number, string>()): Map<number, string> => {
      if (Array.isArray(x)) x.forEach((v, i) => faces(v, `${path}[${i}]`, out));
      else if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        if (typeof o['id'] === 'number' && typeof o['def'] === 'string' && o['id'] >= 0) {
          out.set(o['id'], path);
        }
        for (const [k, v] of Object.entries(o)) faces(v, `${path}.${k}`, out);
      }
      return out;
    };
    const check = () => {
      const st = session.fullState!;
      for (const [c, seat] of Object.entries(seats)) {
        const g = net.last(c, 'game')!;
        const secret = new Set<number>([
          ...st.deck.map((x) => x.id),
          ...st.box.map((x) => x.id),
          ...st.seats.filter((s) => s.id !== seat).flatMap((s) => s.hand.map((x) => x.id)),
        ]);
        // Recall (R15.8) is the owner's own memory of hands it passed: those faces are known to it.
        for (const r of st.seats[seat]!.recall) for (const k of r.cards) secret.delete(k.id);
        g.view.seats.forEach((s, i) => {
          if (i !== seat) expect(s.recall, `${c} sees seat ${i} recall`).toEqual([]);
        });
        for (const [id, at] of faces(g)) {
          expect(secret.has(id), `${c} saw card ${id} at ${at} (step ${steps})`).toBe(false);
        }
        g.view.seats.forEach((s, i) => {
          if (i !== seat) expect(s.pick).toBeNull();
        });
        expect(JSON.stringify(g)).not.toContain(String(st.config.seed));
        for (const a of g.legal) expect(a.seat).toBe(seat);
      }
    };
    let steps = 0;
    for (let i = 0; i < 600 && session.currentPhase === 'playing'; i++) {
      check();
      steps++;
      let acted = false;
      for (const c of ['a', 'b']) {
        const g = net.last(c, 'game')!;
        const a = g.waiting.includes(seats[c]!) ? g.legal[0] : undefined;
        if (a && a.type !== 'unpick') {
          net.send(
            c,
            a.type === 'pick'
              ? { type: 'pick', pick: a.pick }
              : { type: 'answer', prompt: a.prompt, answer: a.answer },
          );
          acted = true;
        }
      }
      net.advance(acted ? 300 : 1_000); // humans do not click faster than the rate limit
    }
    const errs = net.messages('a', 'error').slice(-2);
    const st = session.fullState!;
    expect(
      session.currentPhase,
      JSON.stringify({
        errs,
        r: st.round,
        t: st.turn,
        ph: st.phase,
        w: net.last('a', 'game')?.waiting,
      }),
    ).toBe('over');
    expect(steps).toBeGreaterThan(5);
  });

  it('opens with the Great Work group: every town answers at once, hidden, on a 60 s clock', () => {
    const { session, hostToken } = GameSession.create('WIND03', 0, roomEngine(), fakeDeps(), {
      botDelayMs: 1_000_000,
    });
    const net = new LocalNet(session);
    net.connect('a');
    net.send('a', { type: 'hello', token: hostToken, name: 'Ann' });
    net.connect('b');
    net.send('b', { type: 'hello', token: null, name: 'Bob' });
    net.send('a', { type: 'configure', config: { seatCount: 4, timer: 'normal' } });
    net.send('a', { type: 'start' });
    const ga = net.last('a', 'game')!;
    expect(ga.waiting).toEqual([0, 1, 2, 3]);
    expect(ga.timer).toEqual({ remainingMs: 60_000, totalMs: 60_000 });
    // Own offers only.
    const mine = ga.view.prompts.filter((p) => p.data !== null).map((p) => p.seat);
    expect(mine).toEqual([0]);
    const offer = ga.legal.find((x) => x.type === 'answer')!;
    net.send('a', { type: 'answer', prompt: offer.prompt, answer: offer.answer });
    expect(net.last('a', 'error')).toBeUndefined();
    // Ann's answer is hidden from Bob; the group is still open for the others.
    const gb = net.last('b', 'game')!;
    expect(gb.view.prompts.every((p) => p.answer === null)).toBe(true);
    expect(gb.waiting).toEqual([1, 2, 3]);
    expect(gb.view.prompts.find((p) => p.seat === 0)!.answered).toBe(true);
  });
});
