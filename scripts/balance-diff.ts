/**
 * Before/after table from `scripts/balance.ts --json` files (docs/BALANCE.md, L2 experiments).
 * Run: pnpm exec tsx scripts/balance-diff.ts <baseline.json> <experiment.json> [more.json ...]
 * One markdown table per experiment: each cell is "baseline -> experiment" for that seat count.
 */
import { readFileSync } from 'node:fs';

interface Doc {
  overlay: string | null;
  name: string;
  games: number;
  seed: number;
  seats: Record<string, Record<string, number | string>>;
  greatWorks: Record<string, { held: number; ratio: number; tier4: number }>;
}

const [basePath, ...expPaths] = process.argv.slice(2);
if (!basePath || expPaths.length === 0) {
  console.error('usage: balance-diff.ts <baseline.json> <experiment.json> [...]');
  process.exit(2);
}
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Doc;
const base = load(basePath);

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const num = (x: number) => x.toFixed(1);
const short: Record<string, string> = {
  town: 'Town',
  raids: 'Raids',
  greatWork: 'GW',
  hall: 'Hall',
  landmark: 'Lmk',
  otherCard: 'Other',
  valour: 'Val',
  lore: 'Lore',
  honours: 'Hon',
  purse: 'Purse',
};

/** [label, target, cell formatter for one seat row] */
const ROWS: [string, string, (r: Record<string, number | string>) => string][] = [
  [
    'S1 winner top R12.2 group',
    '<= 55%',
    (r) => `${short[r.s1GroupTop as string] ?? r.s1GroupTop} ${pct(r.s1GroupTopShare as number)}`,
  ],
  ['S1 groups >= 10% of winners', '>= 4', (r) => String(r.s1Groups10)],
  [
    'winner top of 8 sources',
    '<= 55%',
    (r) => `${short[r.s1Top as string] ?? r.s1Top} ${pct(r.s1TopShare as number)}`,
  ],
  ['sources >= 10% of winners', 'report', (r) => String(r.s1Sources10)],
  ['Great Work share of all Renown', 'report', (r) => pct(r['share.greatWork'] as number)],
  ['Hall share of all Renown', 'report', (r) => pct(r['share.hall'] as number)],
  ['S4 tier IV', '20-50%', (r) => pct(r.tier4 as number)],
  ['S3 Lore run >= 3', '>= 25%', (r) => pct(r.loreRun3 as number)],
  ['S3 Lore run >= 5', '5-15%', (r) => pct(r.loreRun5 as number)],
  ['R3 margin median', '<= 10%', (r) => `${num(r.marginMedianPct as number)}%`],
  ['R3 blowouts', '<= 10%', (r) => pct(r.blowout as number)],
  [
    'winner - runner-up: GW / Hall / Honours / Lore',
    'report',
    (r) =>
      ['greatWork', 'hall', 'honours', 'lore'].map((c) => num(r[`gap.${c}`] as number)).join(' / '),
  ],
  [
    'Builds: winner - runner-up / winner built most',
    'report',
    (r) =>
      r.gapBuilds === undefined
        ? 'n/a'
        : `${num(r.gapBuilds as number)} / ${pct(r.winnerMostBuilds as number)}`,
  ],
  ['I1 neighbour share median', '>= 10%', (r) => pct(r.nbrShareMedian as number)],
  ['F1 max seat deviation', '<= 3 pts', (r) => `${num((r.seatMaxDev as number) * 100)}`],
  ['winning score median', 'report', (r) => num(r.winScoreMedian as number)],
  [
    'P3 Spend share Spring / Summer / Autumn',
    '<= 25%',
    (r) => [r.spendSpring, r.spendSummer, r.spendAutumn].map((x) => pct(x as number)).join(' / '),
  ],
  ['violations', '0', (r) => String(r.violations)],
];

function f2(d: Doc): string {
  const rs = Object.values(d.greatWorks).map((g) => g.ratio);
  const out = rs.filter((x) => x < 0.75 || x > 1.25).length;
  return `${out} of ${rs.length} out; ${Math.min(...rs).toFixed(2)}-${Math.max(...rs).toFixed(2)}x`;
}

const seatsOf = (d: Doc) => Object.keys(d.seats).sort((a, b) => Number(a) - Number(b));
for (const p of expPaths) {
  const exp = load(p);
  const seats = seatsOf(exp).filter((n) => base.seats[n]);
  console.log(`### ${exp.name} (${exp.overlay ?? 'no overlay'})`);
  console.log();
  if (exp.games !== base.games || exp.seed !== base.seed)
    console.log(
      `(warning: baseline ${base.games} games seed ${base.seed}, experiment ${exp.games} seed ${exp.seed})\n`,
    );
  console.log(`| metric | target | ${seats.map((n) => `${n} seats`).join(' | ')} |`);
  console.log(`|---|---|${seats.map(() => '---').join('|')}|`);
  for (const [label, target, cell] of ROWS) {
    const cells = seats.map((n) => {
      const a = cell(base.seats[n] as Record<string, number | string>);
      const b = cell(exp.seats[n] as Record<string, number | string>);
      return a === b ? a : `${a} -> **${b}**`;
    });
    console.log(`| ${label} | ${target} | ${cells.join(' | ')} |`);
  }
  const f2cells = [`${f2(base)} -> **${f2(exp)}**`, ...seats.slice(1).map(() => '')];
  console.log(`| F2 Great Works outside 0.75-1.25x (pooled) | 0 | ${f2cells.join(' | ')} |`);
  console.log();
}
