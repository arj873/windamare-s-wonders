/** F6: how long reveals take on real events (4 towns, shipped content, random games). */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../engine/core';
import { createWindamereEngine } from '../../engine/game/engine';
import { latestEvents } from '../../engine/game/events';
import { planReveal } from './plan';
import { revealDuration } from './reveal';

const engine = createWindamereEngine();

/** Reveal length in ms of every action that had events, over `games` random 4-town games. */
function revealTimes(games: number, speed = 1): number[] {
  const out: number[] = [];
  for (let g = 0; g < games; g++) {
    const rng = new Rng(500 + g);
    let s = engine.createGame({
      seed: 500 + g,
      seats: [0, 1, 2, 3].map((i) => ({ name: `T${i}` })),
    });
    while (s.phase.kind !== 'gameOver') {
      const seat = rng.pick(engine.waitingOn(s));
      const legal = engine.legalActions(s, seat).filter((a) => a.type !== 'unpick');
      const r = engine.applyAction(s, rng.pick(legal));
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      const events = latestEvents(engine.viewFor(s, 0));
      if (events.length) out.push(revealDuration(planReveal(events), speed));
    }
  }
  return out;
}

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)]!;

describe('reveal timing', () => {
  // Before F6 (sequential beats, longer steps): median 3950 ms, p90 7000, max 10260 (486 actions).
  const t = revealTimes(6);

  it('a typical turn reveals in about 1.5-2 s, the long ones under 4 s', () => {
    expect(t.length).toBeGreaterThan(400);
    expect(pct(t, 0.5)).toBeLessThanOrEqual(2000);
    expect(pct(t, 0.9)).toBeLessThanOrEqual(3200);
    expect(pct(t, 1)).toBeLessThanOrEqual(4500);
  });

  it('Fast halves it', () => {
    const fast = revealTimes(1, 2);
    const normal = revealTimes(1, 1);
    expect(pct(fast, 0.5)).toBeCloseTo(pct(normal, 0.5) / 2, 5);
  });
});
