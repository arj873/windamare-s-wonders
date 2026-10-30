/**
 * QA audit of the room session (Q0): can a client see or change another seat's pick, submit
 * twice or late, stall or lock out the table? `it.fails` = a known finding (docs/AUDIT.md); the
 * owning lane removes the marker with the fix.
 */
import { describe, expect, it } from 'vitest';
import type { DraftView } from '../engine';
import { toy } from '../engine/core/testing/helpers';
import type { ToySeat, ToyTable } from '../engine/core/testing/toy';
import { LIMITS } from './protocol';
import { GameSession } from './session';
import { fakeDeps, LocalNet } from './testHarness';

type Net = LocalNet<ToySeat, ToyTable>;
type View = DraftView<ToySeat, ToyTable>;

/** Ann (host, seat 0), Bob (seat 1), Cy (seat 2) online; lobby. */
function lobby3() {
  const { session, hostToken } = GameSession.create('ROOM01', 0, toy, fakeDeps());
  const net: Net = new LocalNet(session);
  net.connect('c1');
  net.send('c1', { type: 'hello', token: hostToken, name: 'Ann' });
  for (const [c, name] of [
    ['c2', 'Bob'],
    ['c3', 'Cy'],
  ] as const) {
    net.connect(c);
    net.send(c, { type: 'hello', token: null, name });
  }
  net.send('c1', { type: 'configure', config: { seatCount: 3, roundTimerSec: 60 } });
  const token = (c: string) => net.last(c, 'welcome')!.you.token;
  return { net, session, hostToken, bobToken: token('c2'), cyToken: token('c3') };
}
function started() {
  const t = lobby3();
  t.net.send('c1', { type: 'start' });
  return t;
}

const errors = (net: Net, c: string) => net.messages(c, 'error').map((e) => e.code);
const view = (net: Net, c: string) => net.last(c, 'game')!.view as View;
const hand = (net: Net, c: string, seat: number) => view(net, c).seats[seat]!.hand;
const sell = (net: Net, c: string, seat: number, i = 0) => ({
  card: hand(net, c, seat)[i]!.id,
  use: 'sell',
});
const wire = (net: Net, c: string) => (net.wire.get(c) ?? []).join('\n');
const stage = (net: Net) => {
  const s = net.session.fullState!;
  return `${s.round}:${s.turn}`;
};

/** Every seat sells its first card. */
function allPick(net: Net, order = ['c1', 'c2', 'c3']) {
  const seats: Record<string, number> = { c1: 0, c2: 1, c3: 2 };
  for (const c of order) net.send(c, { type: 'pick', pick: sell(net, c, seats[c]!) });
}

describe('hidden picks', () => {
  it("a seat's pick and hand are not on any other connection's wire before the reveal", () => {
    const { net } = started();
    net.connect('spec');
    net.send('spec', { type: 'hello', token: null }); // no name: stays a spectator
    const bobHand = hand(net, 'c2', 1).map((c) => c.id);
    net.send('c2', { type: 'pick', pick: sell(net, 'c2', 1) });
    expect(view(net, 'c2').seats[1]!.pick).not.toBeNull();
    for (const c of ['c1', 'c3', 'spec']) {
      expect(view(net, c).seats[1]!.pick, c).toBeNull();
      for (const id of bobHand)
        expect(wire(net, c), `${c} sees ${id}`).not.toMatch(new RegExp(`"id":${id}[,}]`));
    }
    expect(view(net, 'c1').view.submitted).toEqual([false, true, false]);
  });

  it('a reconnecting client is not handed anyone else’s pending pick', () => {
    const { net, bobToken } = started();
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0) });
    net.disconnect('c2'); // Cy has not picked, so the turn stays open
    net.connect('c9');
    net.send('c9', { type: 'hello', token: bobToken });
    expect(view(net, 'c9').seats[0]!.pick).toBeNull();
    expect(view(net, 'c9').view.submitted).toEqual([true, false, false]);
  });

  it('a wrong token never yields a seat', () => {
    const { net } = started();
    net.connect('evil');
    net.send('evil', { type: 'hello', token: 'x'.repeat(40), name: 'Eve' });
    net.send('evil', { type: 'pick', pick: { card: 0, use: 'sell' } });
    expect(errors(net, 'evil')).toContain('not_seated');
  });

  it('a spectator cannot pick, unpick or answer', () => {
    const { net } = started();
    net.connect('spec');
    net.send('spec', { type: 'hello', token: null });
    net.send('spec', { type: 'pick', pick: { card: 0, use: 'sell' } });
    net.send('spec', { type: 'unpick' });
    net.send('spec', { type: 'answer', prompt: 0, answer: null });
    expect(errors(net, 'spec')).toEqual(['not_seated', 'not_seated', 'not_seated']);
  });

  it('a seat cannot pick a card from another seat’s hand', () => {
    const { net } = started();
    const bobsCard = hand(net, 'c2', 1)[0]!.id;
    net.send('c1', { type: 'pick', pick: { card: bobsCard, use: 'sell' } });
    expect(errors(net, 'c1')).toEqual(['illegal_action']);
    expect(view(net, 'c1').view.submitted).toEqual([false, false, false]);
  });

  it('a seat cannot answer a prompt that is not its own', () => {
    const { net, session } = lobby3();
    net.send('c1', {
      type: 'configure',
      config: { seatCount: 3, roundTimerSec: 60, options: { opening: true } },
    });
    net.send('c1', { type: 'start' });
    const head = session.fullState!.prompts[0]!;
    expect(head.seat).toBe(0);
    net.send('c2', { type: 'answer', prompt: head.id, answer: 'coins' });
    expect(errors(net, 'c2')).toEqual(['illegal_action']);
    expect(session.fullState!.prompts[0]!.id).toBe(head.id);
  });
});

describe('pick timing', () => {
  it('a pick after the turn resolved is judged against the new hands', () => {
    const { net } = started();
    const old = sell(net, 'c1', 0);
    allPick(net);
    expect(stage(net)).toBe('0:1');
    // Hands passed: Ann's old card now sits in another seat's hand.
    net.send('c1', { type: 'pick', pick: old });
    expect(errors(net, 'c1')).toEqual(['illegal_action']);
  });

  it('a second pick replaces the first, never adds a second card', () => {
    const { net, session } = started();
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0, 0) });
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0, 1) });
    expect(session.fullState!.seats[0]!.pick!.card).toBe(hand(net, 'c1', 0)[1]!.id);
  });

  it('picks and unpicks after the game is over are refused', () => {
    const { net } = started();
    for (let i = 0; i < 20 && net.session.currentPhase === 'playing'; i++) {
      for (const [c, seat] of [
        ['c1', 0],
        ['c2', 1],
        ['c3', 2],
      ] as const) {
        const g = net.last(c, 'game')!;
        const a = g.legal.find((x) => x.type === 'pick' || x.type === 'answer');
        if (a?.type === 'pick') net.send(c, { type: 'pick', pick: a.pick });
        if (a?.type === 'answer')
          net.send(c, { type: 'answer', prompt: a.prompt, answer: a.answer });
        void seat;
      }
    }
    expect(net.session.currentPhase).toBe('over');
    net.send('c1', { type: 'pick', pick: { card: 0, use: 'sell' } });
    net.send('c1', { type: 'unpick' });
    expect(errors(net, 'c1').slice(-2)).toEqual(['wrong_phase', 'wrong_phase']);
  });

  it('a flood of picks is rate limited', () => {
    const { net } = started();
    for (let i = 0; i < 40; i++) net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0) });
    expect(errors(net, 'c1')).toContain('rate_limited');
  });
});

describe('stalling the table', () => {
  it('an idle connected player cannot hold the turn past the clock', () => {
    const { net } = started();
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0) });
    net.send('c2', { type: 'pick', pick: sell(net, 'c2', 1) });
    net.advance(61_000);
    expect(stage(net)).not.toBe('0:0');
  });

  it('pick/unpick toggling does not extend the clock', () => {
    const { net } = started();
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0) });
    net.send('c2', { type: 'pick', pick: sell(net, 'c2', 1) });
    for (let t = 0; t < 5; t++) {
      net.advance(10_000);
      net.send('c3', { type: 'pick', pick: sell(net, 'c3', 2) });
      net.send('c3', { type: 'unpick' });
    }
    net.advance(11_000);
    expect(stage(net)).not.toBe('0:0');
  });

  it('the host can unblock a no-timer table by kicking the idle seat', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'configure', config: { seatCount: 3, roundTimerSec: null } });
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0) });
    net.send('c2', { type: 'pick', pick: sell(net, 'c2', 1) });
    net.advance(3_600_000);
    expect(stage(net)).toBe('0:0');
    net.send('c1', { type: 'kick', member: 'm3' });
    net.advance(2_000);
    expect(stage(net)).not.toBe('0:0');
  });

  // FINDING Q0-N1: `hello` is neither rate limited nor does it evict connected members.
  it.fails(
    'one socket cannot fill the room with throwaway members and lock out real joiners',
    () => {
      const { net } = lobby3();
      net.connect('flood');
      for (let i = 0; i < LIMITS.members + 10; i++) {
        net.send('flood', { type: 'hello', token: null, name: `F${i}` });
      }
      net.connect('late');
      net.send('late', { type: 'hello', token: null, name: 'Late' });
      expect(errors(net, 'late')).not.toContain('room_full');
      expect(net.last('late', 'welcome')).toBeDefined();
    },
  );

  // FINDING Q0-N2: a second hello on one socket makes a second member sharing the socket;
  // closing the socket only detaches the newest, so the first stays "connected" forever.
  it.fails('closing a socket disconnects every member that said hello on it', () => {
    const { net } = lobby3();
    net.connect('dual');
    net.send('dual', { type: 'hello', token: null, name: 'Dee' });
    net.send('dual', { type: 'hello', token: null, name: 'Eli' });
    net.disconnect('dual');
    const members = net.last('c1', 'room')!.room.members;
    expect(
      members.filter((m) => m.name === 'Dee' || m.name === 'Eli').map((m) => m.connected),
    ).toEqual([false, false]);
  });

  // FINDING Q0-N3: the host is never replaced, so a host who leaves strands the room.
  it.fails('a room can still be started when the host never comes back', () => {
    const { net } = lobby3();
    net.disconnect('c1');
    net.advance(10 * 60_000);
    net.send('c2', { type: 'start' });
    net.send('c3', { type: 'start' });
    expect(net.last('c2', 'room')!.room.phase).toBe('playing');
  });

  it('a table size the ruleset rejects gets bad_config, not an exception (Q0-N4, fixed)', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'configure', config: { seatCount: 8, roundTimerSec: 60 } });
    expect(() => net.send('c1', { type: 'start' })).not.toThrow();
    expect(errors(net, 'c1')).toContain('bad_config');
    expect(net.session.currentPhase).toBe('lobby');
  });
});

describe('determinism', () => {
  const play = (order: string[]) => {
    const { net, session } = started();
    allPick(net, order);
    return JSON.stringify(session.fullState);
  };

  it('same seed + same picks = same state, whatever order they arrive in', () => {
    const a = play(['c1', 'c2', 'c3']);
    expect(play(['c3', 'c2', 'c1'])).toBe(a);
    expect(play(['c2', 'c3', 'c1'])).toBe(a);
  });

  it('a snapshot restored mid-turn continues to the same state', () => {
    const { net, session } = started();
    net.send('c1', { type: 'pick', pick: sell(net, 'c1', 0) });
    const snap = JSON.parse(JSON.stringify(session.snapshot()));
    const revived = GameSession.restore(snap, toy, fakeDeps());
    const net2: Net = new LocalNet(revived, net.now);
    net2.connect('c2');
    net2.send('c2', { type: 'hello', token: net.last('c2', 'welcome')!.you.token });
    const p = sell(net, 'c2', 1);
    net.send('c2', { type: 'pick', pick: p });
    net2.send('c2', { type: 'pick', pick: p });
    net.advance(61_000);
    net2.advance(61_000);
    expect(JSON.stringify(revived.fullState)).toBe(JSON.stringify(session.fullState));
  });
});
