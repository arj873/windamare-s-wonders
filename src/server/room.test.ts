import { describe, expect, it } from 'vitest';
import type { DraftView } from '../engine';
import type { ToySeat, ToyTable } from '../engine/core/testing/toy';
import { SERVER_LIMITS } from './limits';
import { roomFetch } from './room';
import { FakeRuntime, type FakeSocket } from './testRuntime';

type View = DraftView<ToySeat, ToyTable>;

async function room() {
  const rt = new FakeRuntime({ botDelayMs: 0 });
  const core = await rt.load();
  const created = await core.create('ABC234');
  const host = (await rt.connect())!;
  await rt.send(host, { type: 'hello', token: created!.hostToken, name: 'Ann' });
  const bob = (await rt.connect('2.2.2.2'))!;
  await rt.send(bob, { type: 'hello', token: null, name: 'Bob' });
  await rt.send(host, { type: 'configure', config: { seatCount: 3, roundTimerSec: 60 } });
  return { rt, host, bob, hostToken: created!.hostToken, bobToken: bob.last('welcome')!.you.token };
}

const view = (s: FakeSocket) => s.last('game')!.view as View;
const sellFirst = (s: FakeSocket) => {
  const v = view(s);
  return { card: v.seats[v.view.viewer!]!.hand[0]!.id, use: 'sell' };
};

describe('RoomCore', () => {
  it('creates a room once per code and reports a summary', async () => {
    const rt = new FakeRuntime();
    const core = await rt.load();
    expect(await core.info()).toBeNull();
    expect(await core.create('ABC234')).not.toBeNull();
    expect(await core.create('ABC234')).toBeNull();
    expect(await core.info()).toMatchObject({ roomId: 'ABC234', phase: 'lobby', connected: 0 });
  });

  it('refuses sockets for a room that does not exist', async () => {
    const rt = new FakeRuntime();
    const core = await rt.load();
    expect(await core.admit('1.1.1.1')).toEqual([404, 'no such room']);
    const res = await roomFetch(core, new Request('https://room.internal/info'), async () => {
      throw new Error('no upgrade');
    });
    expect(res.status).toBe(404);
  });

  it('plays a turn with bot help; each socket gets only its own view', async () => {
    const { rt, host, bob } = await room();
    await rt.send(host, { type: 'start' });
    await rt.send(host, { type: 'pick', pick: sellFirst(host) });
    expect(view(bob).seats[0]!.pick).toBeNull();
    await rt.send(bob, { type: 'pick', pick: sellFirst(bob) });
    await rt.advance(0);
    expect(view(host).turn).toBe(1);
    // Nothing of Bob's hand is in anything the host socket ever received.
    const hostWire = host.sent.join('\n');
    const bobHandIds = view(bob).seats[1]!.hand.map((c) => c.id);
    const seenByHost = new Set<number>();
    for (const m of host.of('game')) {
      for (const s of (m.view as View).seats) {
        if (s.id === 1) s.hand.forEach((c) => seenByHost.add(c.id));
      }
    }
    expect([...seenByHost].every((id) => id < 0)).toBe(true);
    expect(hostWire).not.toContain('"token":"' + bob.last('welcome')!.you.token);
    expect(bobHandIds.length).toBeGreaterThan(0);
  });

  it('survives hibernation mid-round: the pending pick and the alarm are restored', async () => {
    const { rt, host, bob } = await room();
    await rt.send(host, { type: 'start' });
    const pick = sellFirst(bob);
    await rt.send(bob, { type: 'pick', pick });
    await rt.hibernate();
    await rt.send(bob, { type: 'sync' });
    expect(view(bob).seats[1]!.pick).toEqual(pick);
    expect(rt.alarmAt).not.toBeNull();
    await rt.send(host, { type: 'pick', pick: sellFirst(host) });
    await rt.advance(0);
    expect(view(host).turn).toBe(1);
  });

  it('after eviction the sockets are gone: seats go away, then to bots, then come back', async () => {
    const { rt, bobToken } = await room();
    await rt.send((await rt.connect('3.3.3.3'))!, { type: 'hello', token: null, name: 'Cy' });
    await rt.evict();
    const sock = (await rt.connect('2.2.2.2'))!;
    await rt.send(sock, { type: 'hello', token: bobToken });
    expect(sock.last('welcome')!.room.members.find((m) => m.name === 'Bob')!.connected).toBe(true);
    expect(sock.last('welcome')!.room.members.find((m) => m.name === 'Ann')!.connected).toBe(false);
  });

  it('rate limits a flooding socket, then closes it', async () => {
    const { rt, bob } = await room();
    const burst = Math.ceil(SERVER_LIMITS.frame.burst);
    for (let i = 0; i < burst + SERVER_LIMITS.frameStrikes + 2; i++)
      await rt.send(bob, { type: 'sync' });
    expect(bob.closedWith?.code).toBe(1008);
  });

  it('rejects binary and oversized frames', async () => {
    const { rt, bob } = await room();
    await rt.core.message(bob, new ArrayBuffer(4));
    expect(bob.last('error')!.code).toBe('bad_message');
    await rt.core.message(bob, 'x'.repeat(SERVER_LIMITS.messageChars + 1));
    expect(bob.last('error')!.code).toBe('bad_message');
  });

  it('expires an idle room, closes sockets and clears storage', async () => {
    const { rt, host, bob } = await room();
    await rt.disconnect(host);
    await rt.disconnect(bob);
    await rt.advance(24 * 3_600_000 + 1);
    expect(rt.stored).toBeUndefined();
    expect(rt.alarmAt).toBeNull();
    expect(await rt.core.info()).toBeNull();
  });
});
