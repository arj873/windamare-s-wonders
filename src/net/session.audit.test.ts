/**
 * QA audit of the room session (Q0): can a client see or change another seat's pick, submit
 * twice or late, stall or lock out the table? `it.fails` = a known finding (docs/AUDIT.md); the
 * owning lane removes the marker with the fix.
 */
import { describe, expect, it } from 'vitest';
import type { DraftEngine } from './engineApi';
import { LIMITS } from './protocol';
import { GameSession } from './session';
import { fakeDeps, LocalNet, toyEngine, type ToyState, type ToyView } from './testHarness';

type Net = LocalNet<ToyState, ToyView, number>;

/** Ann (host, seat 0), Bob (seat 1), Cy (seat 2) online; lobby. */
function lobby3(opts = {}, engine: DraftEngine<ToyState, ToyView, number> = toyEngine) {
  const { session, hostToken } = GameSession.create('ROOM01', 0, engine, fakeDeps(), opts);
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

const errors = (net: Net, c: string) => net.messages(c, 'error').map((e) => e.code);
const game = (net: Net, c: string) => net.last(c, 'game')!;
const wire = (net: Net, c: string) => (net.wire.get(c) ?? []).join('\n');

describe('hidden picks', () => {
  it("a seat's pick is not on any other connection's wire until the reveal", () => {
    const { net } = lobby3();
    net.connect('spec');
    net.send('spec', { type: 'hello', token: null }); // no name: stays a spectator
    net.send('c1', { type: 'start' });
    const bobCard = (game(net, 'c2').view as ToyView).hand[1]!; // 102, only Bob's hand has it
    net.send('c2', { type: 'submit', round: 1, pick: bobCard });
    expect(net.last('c2', 'game')!.myPick).toBe(bobCard);
    for (const c of ['c1', 'c3', 'spec']) {
      expect(wire(net, c), c).not.toContain(String(bobCard));
      expect(net.last(c, 'game')!.myPick, c).toBeNull();
    }
    // Everybody else sees only that Bob is in.
    expect(game(net, 'c1').submitted).toEqual([false, true, false]);
  });

  it('a reconnecting client is not handed anyone else’s pending pick', () => {
    const { net, bobToken } = lobby3();
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.disconnect('c2'); // Cy has not picked, so the round stays open
    net.connect('c9');
    net.send('c9', { type: 'hello', token: bobToken });
    const text = wire(net, 'c9');
    expect(text).not.toContain('"myPick":1,');
    expect(game(net, 'c9').myPick).toBeNull();
    expect(game(net, 'c9').submitted).toEqual([true, false, false]);
  });

  it('a wrong or foreign token never yields someone else’s seat', () => {
    const { net, session } = lobby3();
    net.send('c1', { type: 'start' });
    net.connect('evil');
    net.send('evil', { type: 'hello', token: 'x'.repeat(40), name: 'Eve' });
    expect(net.last('evil', 'game')!.myPick).toBeNull();
    net.send('evil', { type: 'submit', round: 1, pick: 1 });
    expect(errors(net, 'evil')).toContain('not_seated');
    expect(session.fullState).not.toBeNull();
  });

  it('a spectator cannot submit or withdraw', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'start' });
    net.connect('spec');
    net.send('spec', { type: 'hello', token: null });
    net.send('spec', { type: 'submit', round: 1, pick: 1 });
    net.send('spec', { type: 'withdraw', round: 1 });
    expect(errors(net, 'spec')).toEqual(['not_seated', 'not_seated']);
  });

  it('a seat cannot submit another seat’s card', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'submit', round: 1, pick: 101 }); // Bob's card
    expect(errors(net, 'c1')).toEqual(['illegal_pick']);
    expect(game(net, 'c1').submitted).toEqual([false, false, false]);
  });
});

describe('submit timing', () => {
  it('rejects a submit for a round that already resolved, and one for the future', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'start' });
    for (const [c, p] of [
      ['c1', 1],
      ['c2', 101],
      ['c3', 201],
    ] as const) {
      net.send(c, { type: 'submit', round: 1, pick: p });
    }
    expect(game(net, 'c1').round).toBe(2);
    net.send('c1', { type: 'submit', round: 1, pick: 2 });
    net.send('c1', { type: 'submit', round: 99, pick: 2 });
    net.send('c1', { type: 'submit', round: 2, pick: 1 }); // already played card
    expect(errors(net, 'c1')).toEqual(['stale_round', 'stale_round', 'illegal_pick']);
  });

  it('a second submit replaces the first, never adds a second card', () => {
    const { net, session } = lobby3();
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.send('c1', { type: 'submit', round: 1, pick: 2 });
    net.send('c2', { type: 'submit', round: 1, pick: 101 });
    net.send('c3', { type: 'submit', round: 1, pick: 201 });
    expect(session.fullState!.tableau[0]).toEqual([2]);
  });

  it('a late submit after the game is over is refused', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'start' });
    for (let r = 1; r <= 3; r++) {
      for (const c of ['c1', 'c2', 'c3']) {
        const hand = (game(net, c).view as ToyView).hand;
        net.send(c, { type: 'submit', round: r, pick: hand[0]! });
      }
    }
    expect(net.last('c1', 'room')!.room.phase).toBe('over');
    net.send('c1', { type: 'submit', round: 4, pick: 1 });
    net.send('c1', { type: 'withdraw', round: 4 });
    expect(errors(net, 'c1')).toEqual(['wrong_phase', 'wrong_phase']);
  });

  it('a flood of submits is rate limited', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'start' });
    for (let i = 0; i < 40; i++) net.send('c1', { type: 'submit', round: 1, pick: 1 });
    expect(errors(net, 'c1')).toContain('rate_limited');
  });
});

describe('stalling the table', () => {
  it('an idle connected player cannot hold the round past the clock', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.send('c2', { type: 'submit', round: 1, pick: 101 });
    net.advance(61_000);
    expect(game(net, 'c1').round).toBe(2);
  });

  it('withdraw/submit toggling does not extend the clock', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.send('c2', { type: 'submit', round: 1, pick: 101 });
    for (let t = 0; t < 5; t++) {
      net.advance(10_000);
      net.send('c3', { type: 'submit', round: 1, pick: 201 });
      net.send('c3', { type: 'withdraw', round: 1 });
    }
    net.advance(11_000);
    expect(game(net, 'c1').round).toBe(2);
  });

  it('the host can unblock a no-timer table by kicking the idle seat', () => {
    const { net } = lobby3();
    net.send('c1', { type: 'configure', config: { seatCount: 3, roundTimerSec: null } });
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.send('c2', { type: 'submit', round: 1, pick: 101 });
    net.advance(3_600_000);
    expect(game(net, 'c1').round).toBe(1);
    net.send('c1', { type: 'kick', member: 'm3' });
    net.advance(2_000);
    expect(game(net, 'c1').round).toBe(2);
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

  // FINDING Q0-N2: a second hello on the same socket creates a second member that shares the
  // socket; closing the socket only detaches the newest, so the first stays "connected" forever.
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

  // FINDING Q0-N4: engine.create / botPick / resolveRound exceptions escape `receive`.
  it.fails('an engine that rejects the table size does not throw out of the session', () => {
    const picky: DraftEngine<ToyState, ToyView, number> = {
      ...toyEngine,
      create(names, seed) {
        if (names.length > 2) throw new Error('this game takes 2 seats');
        return toyEngine.create(names, seed);
      },
    };
    const { net } = lobby3({}, picky);
    expect(() => net.send('c1', { type: 'start' })).not.toThrow();
    expect(net.last('c1', 'room')!.room.phase).toBe('lobby');
  });
});

describe('determinism', () => {
  const play = (order: string[]) => {
    const { net, session } = lobby3();
    net.send('c1', { type: 'start' });
    const cards: Record<string, number> = { c1: 1, c2: 101, c3: 201 };
    for (const c of order) net.send(c, { type: 'submit', round: 1, pick: cards[c]! });
    return JSON.stringify(session.fullState);
  };

  it('same seed + same picks = same state, whatever order they arrive in', () => {
    const a = play(['c1', 'c2', 'c3']);
    expect(play(['c3', 'c2', 'c1'])).toBe(a);
    expect(play(['c2', 'c3', 'c1'])).toBe(a);
  });

  it('a snapshot restored mid-round continues to the same state', () => {
    const { net, session } = lobby3();
    net.send('c1', { type: 'start' });
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    const snap = JSON.parse(JSON.stringify(session.snapshot()));
    const revived = GameSession.restore(snap, toyEngine, fakeDeps());
    const net2: Net = new LocalNet(revived, net.now);
    net2.connect('c2');
    net2.send('c2', { type: 'hello', token: net.last('c2', 'welcome')!.you.token });
    net2.send('c2', { type: 'submit', round: 1, pick: 101 });
    net.send('c2', { type: 'submit', round: 1, pick: 101 });
    net.advance(61_000);
    net2.advance(61_000);
    expect(JSON.stringify(revived.fullState)).toBe(JSON.stringify(session.fullState));
  });
});
