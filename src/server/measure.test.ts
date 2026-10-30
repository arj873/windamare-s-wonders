import { describe, expect, it } from 'vitest';
import { GameSession } from '../net/session';
import { fakeDeps, LocalNet } from '../net/testHarness';
import { roomEngine } from './engine';

/**
 * N6: the worker saves the whole session as one `ctx.storage.put('session', text)`. On a
 * SQLite-backed Durable Object "Key and value combined cannot exceed 2 MB"
 * (https://developers.cloudflare.com/durable-objects/platform/limits/, read 2026-10-30); the old
 * KV-backed classes allow only 128 KiB, so wrangler.jsonc must keep `new_sqlite_classes`.
 * Measured 2026-10-30: 3 towns about 70 KB, 7 towns about 141 KB at game end. The budget below is
 * a quarter of the limit, so growth fails here long before it fails in production.
 */
const LIMIT_BYTES = 2 * 1024 * 1024;
const BUDGET_BYTES = LIMIT_BYTES / 4;

describe('room storage size (N6)', () => {
  for (const towns of [3, 7]) {
    it(`a ${towns}-town game stays under a quarter of the 2 MB value limit, all game long`, () => {
      const { session, hostToken } = GameSession.create(`SZ${towns}`, 0, roomEngine(), fakeDeps(), {
        botDelayMs: 0,
      });
      const net = new LocalNet(session);
      net.connect('a');
      net.send('a', { type: 'hello', token: hostToken, name: 'Ann' });
      net.send('a', { type: 'configure', config: { seatCount: towns, timer: 'fast' } });
      net.send('a', { type: 'start' });
      let max = 0;
      for (let i = 0; i < 600 && session.currentPhase === 'playing'; i++) {
        net.advance(10_000);
        max = Math.max(max, new TextEncoder().encode(JSON.stringify(session.snapshot())).length);
      }
      expect(session.currentPhase).toBe('over');
      expect(max).toBeGreaterThan(10_000);
      expect(max).toBeLessThan(BUDGET_BYTES);
    });
  }

  it('the room Durable Object class is SQLite-backed', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('wrangler.jsonc', 'utf8')).toContain('new_sqlite_classes');
  });
});
