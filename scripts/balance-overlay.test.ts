import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkContent, windamereContent } from '../src/engine';
import { applyOverlay, loadOverlay } from './balance-overlay';

const base = windamereContent();
const renown = (specs: readonly { type: string; amount?: unknown }[]) =>
  specs.reduce((a, e) => a + (e.type === 'renown' ? (e.amount as number) : 0), 0);

describe('balance overlays', () => {
  it('an empty overlay is the shipped content', () => {
    expect(applyOverlay(base, {})).toEqual(base);
  });

  it('patches every Great Work, then by id', () => {
    const c = applyOverlay(base, {
      greatWorks: {
        '*': { thresholdDelta: [1, 2, 3, 4], tierRenownDelta: [0, 0, 0, -3] },
        'the-coinwell': { tierRenown: [null, 5, null, 0] },
      },
    });
    // Expectations come from the shipped content, so a design re-tune does not break this test.
    const was = (id: string) => base.greatWorks.find((g) => g.id === id)?.tiers ?? [];
    const now = (id: string) => c.greatWorks.find((g) => g.id === id)?.tiers ?? [];
    const spire = 'the-stonewrights-spire';
    expect(now(spire).map((t) => t.threshold)).toEqual(
      was(spire).map((t, i) => t.threshold + (i + 1)),
    );
    expect(now(spire).map((t) => renown(t.reward))).toEqual(
      was(spire).map((t, i) => Math.max(0, renown(t.reward) - (i === 3 ? 3 : 0))),
    );
    const coin = 'the-coinwell';
    const coinRenown = was(coin).map((t) => renown(t.reward));
    // '*' runs first (tier IV -3), then the coinwell's own patch sets tiers II and IV.
    expect(now(coin).map((t) => renown(t.reward))).toEqual([coinRenown[0], 5, coinRenown[2], 0]);
    // Effects other than Renown stay next to the new Renown.
    expect(now(coin)[1]?.reward.filter((e) => e.type !== 'renown')).toEqual(
      was(coin)[1]?.reward.filter((e) => e.type !== 'renown'),
    );
  });

  it('moves Spend labour to coins and leaves other bands alone', () => {
    const c = applyOverlay(base, { cardSpend: { labourDelta: -1 } });
    for (const [i, card] of c.cards.entries()) {
      const was = base.cards[i]?.spend ?? {};
      if (!was.labour) expect(card.spend).toEqual(was);
      else {
        expect(card.spend.labour ?? 0).toBe(was.labour - 1);
        expect(card.spend.coins ?? 0).toBe((was.coins ?? 0) + 1);
      }
    }
  });

  it('adds coins to the Spend bands of the chosen kinds only', () => {
    const c = applyOverlay(base, { cardSpend: { coinsDelta: 1, kinds: ['market'] } });
    for (const [i, card] of c.cards.entries()) {
      const was = base.cards[i]?.spend ?? {};
      if (card.kind !== 'market') expect(card.spend).toEqual(was);
      else expect(card.spend).toEqual({ ...was, coins: (was.coins ?? 0) + 1 });
    }
  });

  it('rejects unknown ids', () => {
    expect(() => applyOverlay(base, { greatWorks: { 'no-such-work': {} } })).toThrow(/unknown/);
    expect(() => applyOverlay(base, { cards: { 'no-such-card': {} } })).toThrow(/unknown/);
  });

  it('every committed experiment gives valid content', () => {
    const dir = fileURLToPath(new URL('../docs/balance/experiments', import.meta.url));
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const c = applyOverlay(base, loadOverlay(join(dir, f)));
      expect(checkContent(c), f).toEqual([]);
    }
  });
});
