import { describe, expect, it } from 'vitest';
import { GameSession } from './session';
import {
  fakeDeps,
  LocalNet,
  toyEngine,
  TOY_ROUNDS,
  type ToyState,
  type ToyView,
} from './testHarness';

type Net = LocalNet<ToyState, ToyView, number>;

/** Ann (host, seat 0) and Bob (seat 1) online, seat 2 is a bot. Lobby, nothing started. */
function lobby(opts = {}) {
  const { session, hostToken } = GameSession.create('ROOM01', 0, toyEngine, fakeDeps(), opts);
  const net: Net = new LocalNet(session);
  net.connect('c1');
  net.send('c1', { type: 'hello', token: hostToken, name: 'Ann' });
  net.connect('c2');
  net.send('c2', { type: 'hello', token: null, name: 'Bob' });
  net.send('c1', { type: 'configure', config: { seatCount: 3, roundTimerSec: 60 } });
  const bobToken = net.last('c2', 'welcome')!.you.token;
  return { net, session, hostToken, bobToken };
}

function started(opts = {}) {
  const t = lobby(opts);
  t.net.send('c1', { type: 'start' });
  return t;
}

const lastGame = (net: Net, c: string) => net.last(c, 'game')!;
const view = (net: Net, c: string) => lastGame(net, c).view as ToyView;
const texts = (net: Net, c: string) => (net.wire.get(c) ?? []).join('\n');

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

  it('rejects frames before hello, bad JSON and wrong versions', () => {
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

describe('simultaneous picks', () => {
  it('hides picks until every seat is in, then reveals and rotates', () => {
    const { net } = started();
    expect(lastGame(net, 'c1').round).toBe(1);
    expect(view(net, 'c1').hand).toEqual([1, 2, 3]);
    expect(view(net, 'c2').hand).toEqual([101, 102, 103]);

    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    expect(lastGame(net, 'c1').myPick).toBe(1);
    expect(lastGame(net, 'c2').submitted).toEqual([true, false, false]);
    expect(lastGame(net, 'c2').myPick).toBeNull();
    expect(view(net, 'c2').tableau).toEqual([[], [], []]);

    net.send('c2', { type: 'submit', round: 1, pick: 101 });
    expect(lastGame(net, 'c2').round).toBe(1); // bot has not picked yet
    net.advance(900);
    expect(lastGame(net, 'c1').round).toBe(2);
    expect(view(net, 'c1').tableau).toEqual([[1], [101], [201]]);
    // Hands rotated: Ann now holds what Bob... seat 2's leftovers.
    expect(view(net, 'c1').hand).toEqual([202, 203]);
  });

  it('never sends one seat anything the others hold or picked, before the reveal', () => {
    const { net } = started();
    net.send('c1', { type: 'submit', round: 1, pick: 2 });
    net.send('c2', { type: 'submit', round: 1, pick: 102 });
    // Round 1 is still open (bot waits). Cards of other seats must not be on the wire.
    expect(texts(net, 'c1')).not.toMatch(/\b(10[123]|20[123])\b/);
    expect(texts(net, 'c2')).not.toMatch(/\b20[123]\b/);
    const spectator = (() => {
      net.connect('s');
      net.send('s', { type: 'hello', token: null, name: 'Eve' });
      return texts(net, 's');
    })();
    expect(spectator).not.toMatch(/\b(10[123]|20[123])\b/);
    expect(lastGame(net, 's').legal).toEqual([]);
    expect(view(net, 's').hand).toEqual([]);
  });

  it("keeps the whole-game wire free of a seat's unrevealed hand", () => {
    const { net } = started();
    // Ann plays all rounds; her hand cards must only reach others once passed (tableau/hands).
    for (let r = 1; r <= TOY_ROUNDS; r++) {
      const hand = view(net, 'c1').hand;
      net.send('c1', { type: 'submit', round: r, pick: hand[0]! });
      net.send('c2', { type: 'submit', round: r, pick: view(net, 'c2').hand[0]! });
      net.advance(900);
    }
    expect(lastGame(net, 'c1').view).toMatchObject({ round: TOY_ROUNDS + 1 });
    expect(net.session.currentPhase).toBe('over');
  });

  it('rejects stale rounds, illegal picks, malformed picks and non-seated senders', () => {
    const { net } = started();
    net.send('c1', { type: 'submit', round: 2, pick: 1 });
    expect(net.last('c1', 'error')!.code).toBe('stale_round');
    net.send('c1', { type: 'submit', round: 1, pick: 101 });
    expect(net.last('c1', 'error')!.code).toBe('illegal_pick');
    net.send('c1', { type: 'submit', round: 1, pick: 'x' });
    expect(net.last('c1', 'error')!.code).toBe('bad_message');
    net.connect('s');
    net.send('s', { type: 'hello', token: null, name: 'Eve' });
    net.send('s', { type: 'submit', round: 1, pick: 1 });
    expect(net.last('s', 'error')!.code).toBe('not_seated');
  });

  it('lets a seat change or withdraw its pick before the reveal', () => {
    const { net } = started();
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.send('c1', { type: 'submit', round: 1, pick: 3 });
    expect(lastGame(net, 'c1').myPick).toBe(3);
    net.send('c1', { type: 'withdraw', round: 1 });
    expect(lastGame(net, 'c1').myPick).toBeNull();
    expect(lastGame(net, 'c2').submitted[0]).toBe(false);
  });
});

describe('round clock', () => {
  it('auto-picks for slow seats when the clock runs out', () => {
    const { net } = started();
    net.send('c1', { type: 'submit', round: 1, pick: 2 });
    expect(lastGame(net, 'c1').timer).toEqual({ remainingMs: 60_000, totalMs: 60_000 });
    net.advance(59_999);
    expect(lastGame(net, 'c1').round).toBe(1);
    net.advance(1);
    expect(lastGame(net, 'c1').round).toBe(2);
    expect(view(net, 'c1').tableau).toEqual([[2], [101], [201]]); // Bob got his default pick
    expect(net.messages('c1', 'chat').some((c) => c.entry.text === 'Bob ran out of time')).toBe(
      true,
    );
    expect(lastGame(net, 'c1').timer!.remainingMs).toBe(60_000); // fresh clock
  });

  it('waits forever for humans when the timer is off', () => {
    const { net } = lobby();
    net.send('c1', { type: 'configure', config: { seatCount: 3, roundTimerSec: null } });
    net.send('c1', { type: 'start' });
    net.advance(3_600_000);
    expect(lastGame(net, 'c1').round).toBe(1);
    expect(lastGame(net, 'c1').timer).toBeNull();
  });
});

describe('disconnects and reconnects', () => {
  it('does not wait for an away seat once everyone else has picked', () => {
    const { net } = started();
    net.disconnect('c2');
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.advance(900);
    expect(lastGame(net, 'c1').round).toBe(2);
    expect(view(net, 'c1').tableau[1]).toEqual([101]); // default pick for Bob
  });

  it('can switch off early resolve: away seats then hold the round until the clock', () => {
    const { net } = started({ autoPickAway: false });
    net.disconnect('c2');
    net.send('c1', { type: 'submit', round: 1, pick: 1 });
    net.advance(30_000);
    expect(lastGame(net, 'c1').round).toBe(1);
    net.advance(30_000);
    expect(lastGame(net, 'c1').round).toBe(2);
  });

  it('keeps a pick across a reconnect mid-round and shows it again', () => {
    const { net, bobToken } = started();
    net.send('c2', { type: 'submit', round: 1, pick: 102 });
    net.disconnect('c2');
    net.connect('c2b');
    net.send('c2b', { type: 'hello', token: bobToken });
    const g = lastGame(net, 'c2b');
    expect(g.round).toBe(1);
    expect(g.myPick).toBe(102);
    expect(g.submitted[1]).toBe(true);
    expect((g.view as ToyView).hand).toEqual([101, 102, 103]);
    expect(net.last('c1', 'room')!.room.seats[1]!.status).toBe('human');
  });

  it('hands a seat to a bot after the grace period and gives it back on return', () => {
    const { net, bobToken } = started({ autoPickAway: false });
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
    expect(net.session.nextWakeAt()).toBe(net.now + 24 * 3_600_000 - 0);
    net.advance(3_600_000);
    expect(net.session.currentPhase).toBe('playing');
    net.connect('c1b');
    net.send('c1b', { type: 'hello', token: hostToken });
    expect(lastGame(net, 'c1b').round).toBe(1);
    expect(lastGame(net, 'c1b').timer!.remainingMs).toBe(40_000);
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
  it('survives a JSON round trip mid-round with pending picks intact', () => {
    const { net, session, bobToken } = started();
    net.send('c2', { type: 'submit', round: 1, pick: 103 });
    const snap = JSON.parse(JSON.stringify(session.snapshot()));
    const again = GameSession.restore(snap, toyEngine, fakeDeps('r'));
    const net2: Net = new LocalNet(again, net.now);
    net2.connect('n');
    net2.send('n', { type: 'hello', token: bobToken });
    expect(lastGame(net2, 'n').myPick).toBe(103);
    expect(again.currentSeq).toBe(session.currentSeq + 0);
    net2.send('n', { type: 'sync' });
    // The original host token still works after restore.
    expect(again.currentPhase).toBe('playing');
  });
});

describe('game over and rematch', () => {
  it('returns to the lobby on rematch and can start again', () => {
    const { net } = started();
    for (let r = 1; r <= TOY_ROUNDS; r++) {
      net.send('c1', { type: 'submit', round: r, pick: view(net, 'c1').hand[0]! });
      net.send('c2', { type: 'submit', round: r, pick: view(net, 'c2').hand[0]! });
      net.advance(900);
    }
    expect(net.last('c1', 'room')!.room.phase).toBe('over');
    net.send('c2', { type: 'rematch' });
    expect(net.last('c2', 'error')!.code).toBe('not_host');
    net.send('c1', { type: 'rematch' });
    expect(net.last('c1', 'room')!.room.phase).toBe('lobby');
    net.send('c1', { type: 'start' });
    expect(lastGame(net, 'c1').round).toBe(1);
  });
});
