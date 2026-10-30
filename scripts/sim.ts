/**
 * Headless bot simulator. Run: nice -n 19 npx tsx scripts/sim.ts --games 200 --seed 1 --seats 4
 * (`pnpm sim` once platform adds the script). Exit 0 = no violations, 1 = violations, 2 = bad usage.
 * Uses the toy ruleset until the Windamere ruleset (E2) lands.
 */
import { createGreedyBot, createRandomBot, runSim } from '../src/bots';
import { toyAdapter } from '../src/bots/toyAdapter';
import type { Bot } from '../src/bots';
import type { ToySeat, ToyTable } from '../src/engine/core/testing/toy';
import { toy } from '../src/engine/core/testing/helpers';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`--${name} needs a non-negative integer`);
    process.exit(2);
  }
  return n;
}

const games = arg('games', 100);
const seed = arg('seed', 1);
const seats = arg('seats', 4);
const maxActions = arg('max-actions', 5000);
if (toy.validateConfig({ seed, seats: Array.from({ length: seats }, () => ({ name: 'x' })) })) {
  console.error(`bad --seats ${seats}`);
  process.exit(2);
}

// --bots greedy,random,random: one name per seat (rotated each game); one name = every seat.
const makers: Record<string, () => Bot<ToySeat, ToyTable>> = {
  random: () => createRandomBot<ToySeat, ToyTable>(),
  greedy: () => createGreedyBot(toyAdapter),
};
const botIdx = process.argv.indexOf('--bots');
const names = (botIdx === -1 ? 'random' : (process.argv[botIdx + 1] ?? '')).split(',');
const made = names.map((n) => makers[n]?.());
if (made.some((b) => !b) || (names.length > 1 && names.length !== seats)) {
  console.error(`--bots needs 1 or ${seats} of: ${Object.keys(makers).join(', ')}`);
  process.exit(2);
}
const bots = made as Bot<ToySeat, ToyTable>[];

const { summary } = runSim(
  {
    engine: toy,
    bots: bots.length === 1 ? (bots[0] as Bot<ToySeat, ToyTable>) : bots,
    seats,
    maxActions,
  },
  games,
  seed,
);
const f = (x: number) => x.toFixed(2);
console.log(
  `games ${summary.games}, finished ${summary.finished}, violations ${summary.violations.length}`,
);
console.log(
  `actions/game mean ${f(summary.actions.mean)} min ${summary.actions.min} max ${summary.actions.max}`,
);
console.log(`score spread mean ${f(summary.spread.mean)} max ${summary.spread.max}`);
console.log(`mean score by seat  ${summary.meanScore.map(f).join('  ')}`);
console.log(
  `win rate by seat    ${summary.winRate.map((w) => `${(w * 100).toFixed(1)}%`).join('  ')}`,
);
for (const [n, w] of Object.entries(summary.winByBot)) {
  console.log(
    `bot ${n}: ${(w * 100).toFixed(1)}% wins per seat (fair ${(100 / seats).toFixed(1)}%)`,
  );
}
for (const v of summary.violations.slice(0, 10)) {
  console.log(`VIOLATION seed ${v.seed} ${v.violation.kind}: ${v.violation.message}`);
}
process.exit(summary.violations.length > 0 ? 1 : 0);
