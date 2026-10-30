/**
 * Balance report on the real Windamere ruleset (docs/BALANCE.md, targets in
 * docs/design/research/balance-targets.md). Prints markdown tables to stdout.
 * Run: nice -n 19 pnpm exec tsx scripts/balance.ts --games 1000 --seed 1 [--seats 3,4,5,6,7]
 *   [--overlay docs/balance/experiments/<name>.json] [--sections 1,2,3] [--json <out.json>]
 * --overlay patches the shipped content in memory (scripts/balance-overlay.ts); the engine, the
 * metrics and the bots' Great Work rating all read the patched content. --json writes the
 * headline numbers for scripts/balance-diff.ts.
 */
import { writeFileSync } from 'node:fs';
import { createGreedyBot, createRandomBot, runSim, type Bot, type SimSummary } from '../src/bots';
import { rateGreatWork, windamereAdapter } from '../src/bots/windamereAdapter';
import { observeWindamere, SOURCES, sourcesOf, type Source } from '../src/bots/windamereMetrics';
import {
  compileContent,
  createWindamereEngine,
  windamereContent,
  type WwSeat,
  type WwState,
  type WwTable,
} from '../src/engine';
import { applyOverlay, loadOverlay } from './balance-overlay';

type B = Bot<WwSeat, WwTable>;
const argv = process.argv;
const argOf = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : (argv[i + 1] ?? def);
};
const games = Number(argOf('games', '1000'));
const seed = Number(argOf('seed', '1'));
const seatCounts = argOf('seats', '2,3,4,5,6,7').split(',').map(Number);
const sections = new Set(argOf('sections', '1,2,3').split(','));
const overlayPath = argOf('overlay', '');
const jsonPath = argOf('json', '');

const overlay = overlayPath ? loadOverlay(overlayPath) : null;
const content = overlay ? applyOverlay(windamereContent(), overlay) : windamereContent();
const windamereRules = compileContent(content);
const windamere = createWindamereEngine(content);

const SRCS = SOURCES;
const random = (): B => createRandomBot<WwSeat, WwTable>();
// The adapter rates Great Works from the shipped content; rate them from the overlay's instead.
const adapter = (focus?: string) => {
  const a = windamereAdapter(focus ? { focus } : {});
  return {
    ...a,
    rateAnswer: (...args: Parameters<NonNullable<typeof a.rateAnswer>>) =>
      args[2] === 'greatWork' && typeof args[3] === 'string'
        ? rateGreatWork(content, args[3])
        : (a.rateAnswer?.(...args) ?? null),
  };
};
const greedy = (): B => createGreedyBot(adapter(), 'greedy');
const KINDS_FOCUS = ['holding', 'hall', 'market', 'watch', 'lore'] as const;
const specialist = (k: string): B => createGreedyBot(adapter(k), `focus-${k}`);

const mean = (xs: number[] | undefined) =>
  xs && xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const pct = (x: number) => (Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const f1 = (x: number) => (Number.isNaN(x) ? 'n/a' : x.toFixed(1));
const quantile = (xs: number[] | undefined, q: number) => {
  if (!xs || xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
};

/**
 * R12.2's six score-sheet groups, which target S1 is written against: Town (R12.2a) is Hall +
 * Landmark + other card Renown. A tie for the largest goes to the group listed first.
 */
const GROUPS: Record<string, readonly Source[]> = {
  town: ['hall', 'landmark', 'otherCard'],
  greatWork: ['greatWork'],
  raids: ['valour'],
  lore: ['lore'],
  honours: ['honours'],
  purse: ['purse'],
};
function observe(s: WwState): Record<string, number[]> {
  const m = observeWindamere(windamereRules, s);
  const w = s.result?.winners[0];
  if (w === undefined) return m;
  const all = s.seats.map((x) => sourcesOf(windamereRules, s, x.id));
  const src = all[w] as Record<Source, number>;
  const sums = Object.entries(GROUPS).map(
    ([g, xs]) => [g, xs.reduce((a, x) => a + src[x], 0)] as const,
  );
  const top = sums.reduce((a, b) => (b[1] > a[1] ? b : a));
  for (const [g] of sums) (m[`winnerGroup.${g}`] ??= []).push(g === top[0] ? 1 : 0);
  // Where the margin comes from (R3): winner minus runner-up, per source.
  const total = (x: Record<Source, number>) => SRCS.reduce((a, c) => a + x[c], 0);
  const ru = all
    .map((x, i) => [i, total(x)] as const)
    .filter(([i]) => i !== w)
    .reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  for (const c of SRCS) (m[`gap.${c}`] ??= []).push(src[c] - (all[ru]?.[c] ?? 0));
  // Economy luck: Builds made by the winner minus the runner-up, and whether the winner built most.
  const builds = s.seats.map(() => 0);
  for (const e of s.log)
    if (e.kind === 'build' && e.seat !== null) builds[e.seat] = (builds[e.seat] ?? 0) + 1;
  (m['gap.builds'] ??= []).push((builds[w] ?? 0) - (builds[ru] ?? 0));
  (m.winnerMostBuilds ??= []).push((builds[w] ?? 0) >= Math.max(...builds) ? 1 : 0);
  // Payment (R6): goods bought from the bank per town, and coins paid per Build.
  let bank = 0;
  let paid = 0;
  let pays = 0;
  for (const e of s.log) {
    if (e.kind !== 'pay') continue;
    const d = e.data as { bank?: string[]; coins?: number } | undefined;
    bank += d?.bank?.length ?? 0;
    paid += d?.coins ?? 0;
    pays += 1;
  }
  (m.bankGoodsPerTown ??= []).push(bank / s.seats.length);
  if (pays > 0) (m.coinsPerBuild ??= []).push(paid / pays);
  return m;
}

function run(bots: B[] | B, seats: number): SimSummary {
  const t = Date.now();
  const { summary } = runSim(
    {
      engine: windamere,
      bots,
      seats,
      maxActions: 5000,
      observe,
    },
    games,
    seed,
  );
  console.error(`  seats ${seats}: ${games} games in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return summary;
}

const out = (s = '') => console.log(s);
out(
  `Generated by \`scripts/balance.ts --games ${games} --seed ${seed}${overlayPath ? ` --overlay ${overlayPath}` : ''}\` (seeds ${seed}..${seed + games - 1}).`,
);
if (overlay) out(`Overlay **${overlay.name ?? overlayPath}**: ${overlay.hypothesis ?? ''}`);
out();

/** Headline numbers per seat count, for --json and scripts/balance-diff.ts. */
const headline: Record<string, Record<string, number | string>> = {};
const gwPooled: Record<string, { held: number; ratio: number; tier4: number }> = {};
const ge = (xs: number[] | undefined, k: number) =>
  xs && xs.length ? xs.filter((x) => x >= k).length / xs.length : NaN;

// 1. Equal greedy bots: fairness, pace, categories, interaction.
const equal: Record<number, SimSummary> = {};
if (sections.has('1')) {
  out('## 1. Equal greedy bots (level 1)');
  out();
  for (const n of seatCounts) equal[n] = run(greedy(), n);

  out(
    '| seats | violations | picks/game | score mean | spread mean | winning score p95 | win seat 0..n-1 (fair 1/n) | max dev. from fair |',
  );
  out('|---|---|---|---|---|---|---|---|');
  for (const n of seatCounts) {
    const s = equal[n] as SimSummary;
    const dev = Math.max(...s.winRate.map((w) => Math.abs(w - 1 / n)));
    out(
      `| ${n} | ${s.violations.length} | ${f1(s.actions.mean)} | ${f1(mean(s.meanScore))} | ${f1(s.spread.mean)} | ${f1(quantile(s.metrics.winScore, 0.95))} | ${s.winRate.map((w) => (w * 100).toFixed(0)).join(' / ')} | ${(dev * 100).toFixed(1)} pts |`,
    );
  }
  out();
  out();
  out(
    '| seats | win score median | runner-up median | margin median % | blowouts (>=1.3x) | winner mean Renown by source (hall / landmark / other card / great work / valour / lore / honours / purse) |',
  );
  out('|---|---|---|---|---|---|');
  for (const n of seatCounts) {
    const m = (equal[n] as SimSummary).metrics;
    const cats = [
      'hall',
      'landmark',
      'otherCard',
      'greatWork',
      'valour',
      'lore',
      'honours',
      'purse',
    ]
      .map((c) => f1(mean(m[`winnerSrc.${c}`])))
      .join(' / ');
    out(
      `| ${n} | ${f1(quantile(m.winScore, 0.5))} | ${f1(quantile(m.runnerUpScore, 0.5))} | ${f1(quantile(m.marginPct, 0.5))} | ${pct(mean(m.blowout))} | ${cats} |`,
    );
  }
  out();
  out('Share of all Renown (all towns) by source:');
  out();
  out('| seats | hall | landmark | otherCard | greatWork | valour | lore | honours | purse |');
  out('|---|---|---|---|---|---|---|---|---|');
  for (const n of seatCounts) {
    const m = (equal[n] as SimSummary).metrics;
    const tot = SRCS.reduce((a, c) => a + mean(m[`townSrc.${c}`]), 0);
    out(`| ${n} | ${SRCS.map((c) => pct(mean(m[`townSrc.${c}`]) / tot)).join(' | ')} |`);
  }
  out();
  out("Winner's largest source (S1; target: none > 55% of winners, at least 4 sources >= 10%):");
  out();
  out('| seats | hall | landmark | otherCard | greatWork | valour | lore | honours | purse |');
  out('|---|---|---|---|---|---|---|---|---|');
  for (const n of seatCounts) {
    const m = (equal[n] as SimSummary).metrics;
    out(`| ${n} | ${SRCS.map((c) => pct(mean(m[`winnerLargest.${c}`]))).join(' | ')} |`);
  }
  out();
  out(
    "Winner's largest R12.2 score-sheet group (S1 as written; Town = Hall + Landmark + other cards):",
  );
  out();
  out(`| seats | ${Object.keys(GROUPS).join(' | ')} |`);
  out(
    `|---|${Object.keys(GROUPS)
      .map(() => '---')
      .join('|')}|`,
  );
  for (const n of seatCounts) {
    const m = (equal[n] as SimSummary).metrics;
    out(
      `| ${n} | ${Object.keys(GROUPS)
        .map((g) => pct(mean(m[`winnerGroup.${g}`])))
        .join(' | ')} |`,
    );
  }
  out();
  out("Where the margin comes from (R3): mean of winner's minus runner-up's Renown, by source:");
  out();
  out(`| seats | margin | ${SRCS.join(' | ')} | Builds gap | winner built most |`);
  out(`|---|---|${SRCS.map(() => '---').join('|')}|---|---|`);
  for (const n of seatCounts) {
    const m = (equal[n] as SimSummary).metrics;
    const gaps = SRCS.map((c) => mean(m[`gap.${c}`]));
    out(
      `| ${n} | ${f1(gaps.reduce((a, b) => a + b, 0))} | ${gaps.map(f1).join(' | ')} | ${f1(mean(m['gap.builds']))} | ${pct(mean(m.winnerMostBuilds))} |`,
    );
  }
  out();
  out('Interaction, Lore, Raids, trade (per town unless noted):');
  out();
  out(
    '| seats | net neighbour Renown share median (I1 target >= 10%) | Tolls Renown-equiv. per town | Lore run >= 3 (S3 target >= 25%) | run >= 5 (5-15%) | tier IV (S4 20-50%) | held Spring / Summer / Autumn / Winter (I3) | sales per game | sales from bank (seller out) | builds per town | Spend share Spring..Winter (P3) |',
  );
  out('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const n of seatCounts) {
    const m = (equal[n] as SimSummary).metrics;
    const held = ['spring', 'summer', 'autumn', 'winter']
      .map((s) => pct(mean(m[`held.${s}`])))
      .join(' / ');
    const spendShare = ['spring', 'summer', 'autumn', 'winter']
      .map((s) => {
        const b = m[`build.${s}`]?.length ?? 0;
        const sp = m[`spend.${s}`]?.length ?? 0;
        return pct(sp / Math.max(1, b + sp));
      })
      .join(' / ');
    out(
      `| ${n} | ${pct(quantile(m.nbrShare, 0.5))} | ${f1(mean(m.nbrTolls))} | ${pct(ge(m.loreRun, 3))} | ${pct(ge(m.loreRun, 5))} | ${pct(ge(m.tiers, 4))} | ${held} | ${f1((m.sale?.length ?? 0) / games)} | ${f1((m.saleShort?.length ?? 0) / games)} | ${f1(mean(m.builtPerTown))} | ${spendShare} |`,
    );
  }
  out();

  // 1b. Great Works (F2).
  out("### 1b. Great Works (F2: each wins fair x 0.75-1.25; chosen by greedy's rating rule)");
  out();
  out(
    'Pooled over the equal-greedy tables of all seat counts; fair = 1 / seats, so the ratio is wins per time held x seats of that game.',
  );
  out();
  const gwIds = [
    ...new Set(
      seatCounts.flatMap((n) =>
        Object.keys((equal[n] as SimSummary).metrics)
          .filter((k) => k.endsWith('.held'))
          .map((k) => k.split('.')[1] as string),
      ),
    ),
  ].sort();
  out('| Great Work | towns that held it | win ratio vs fair | tier IV |');
  out('|---|---|---|---|');
  for (const id of gwIds) {
    let held = 0,
      winsOverFair = 0,
      tier4 = 0,
      count = 0,
      tiers = 0;
    for (const n of seatCounts) {
      const m = (equal[n] as SimSummary).metrics;
      const h = m[`gw.${id}.held`]?.length ?? 0;
      held += h;
      winsOverFair += (m[`gw.${id}.won`] ?? []).reduce((a, b) => a + b, 0) * n; // vs fair 1/n
      tier4 += (m[`gw.${id}.tiers`] ?? []).filter((t) => t >= 4).length;
      tiers += (m[`gw.${id}.tiers`] ?? []).reduce((a, b) => a + b, 0);
      count += h;
    }
    out(
      `| ${id} | ${held} towns total | ${count ? (winsOverFair / count).toFixed(2) : 'n/a'}x | ${count ? pct(tier4 / count) : 'n/a'} (mean tiers ${count ? (tiers / count).toFixed(1) : 'n/a'}) |`,
    );
    if (count) gwPooled[id] = { held, ratio: winsOverFair / count, tier4: tier4 / count };
  }
  out();
  out('F3 (choice rate when offered) is not measured: the offers leave the state once chosen.');
  out();

  for (const n of seatCounts) {
    const s = equal[n] as SimSummary;
    const m = s.metrics;
    const largest = SRCS.map((c) => [c, mean(m[`winnerLargest.${c}`])] as const);
    const top = largest.reduce((a, b) => (b[1] > a[1] ? b : a));
    const groups = Object.keys(GROUPS).map((g) => [g, mean(m[`winnerGroup.${g}`])] as const);
    const gTop = groups.reduce((a, b) => (b[1] > a[1] ? b : a));
    const tot = SRCS.reduce((a, c) => a + mean(m[`townSrc.${c}`]), 0);
    const spendShare = (season: string) => {
      const b = m[`build.${season}`]?.length ?? 0;
      const sp = m[`spend.${season}`]?.length ?? 0;
      return sp / Math.max(1, b + sp);
    };
    headline[n] = {
      violations: s.violations.length,
      seatMaxDev: Math.max(...s.winRate.map((w) => Math.abs(w - 1 / n))),
      winScoreMedian: quantile(m.winScore, 0.5),
      scoreMean: mean(s.meanScore),
      marginMedianPct: quantile(m.marginPct, 0.5),
      blowout: mean(m.blowout),
      s1GroupTop: gTop[0],
      s1GroupTopShare: gTop[1],
      s1Groups10: groups.filter(([, v]) => v >= 0.1).length,
      ...Object.fromEntries(groups.map(([g, v]) => [`group.${g}`, v])),
      ...Object.fromEntries(SRCS.map((c) => [`gap.${c}`, mean(m[`gap.${c}`])])),
      gapBuilds: mean(m['gap.builds']),
      winnerMostBuilds: mean(m.winnerMostBuilds),
      bankGoodsPerTown: mean(m.bankGoodsPerTown),
      coinsPerBuild: mean(m.coinsPerBuild),
      buildsPerTown: mean(m.builtPerTown),
      s1Top: top[0],
      s1TopShare: top[1],
      s1Sources10: largest.filter(([, v]) => v >= 0.1).length,
      ...Object.fromEntries(largest.map(([c, v]) => [`largest.${c}`, v])),
      ...Object.fromEntries(SRCS.map((c) => [`share.${c}`, mean(m[`townSrc.${c}`]) / tot])),
      loreRun3: ge(m.loreRun, 3),
      loreRun5: ge(m.loreRun, 5),
      tier4: ge(m.tiers, 4),
      nbrShareMedian: quantile(m.nbrShare, 0.5),
      heldSpring: mean(m['held.spring']),
      spendSpring: spendShare('spring'),
      spendSummer: spendShare('summer'),
      spendAutumn: spendShare('autumn'),
    };
  }
}

// 2. Skill signal: one greedy among random bots.
if (sections.has('2')) {
  out('## 2. Greedy vs random (K1; target: >= 83% at 3 seats, >= 3x fair = 60% at 5 seats)');
  out();
  out('| seats | greedy win share | fair | ratio | random win share per seat |');
  out('|---|---|---|---|---|');
  for (const n of seatCounts) {
    const s = run([greedy(), ...Array.from({ length: n - 1 }, random)], n);
    const g = s.winByBot.greedy ?? NaN;
    out(
      `| ${n} | ${pct(g * 1)} | ${pct(1 / n)} | ${((g * n) / 1).toFixed(2)}x | ${pct(s.winByBot.random ?? NaN)} |`,
    );
    (headline[n] ??= {}).k1Ratio = g * n;
  }
  out();
  out('(greedy holds one seat per game, rotating, so its win share is wins per game it played.)');
  out();
}

// 3. Strategies: one specialist per plan plus general greedy where seats allow.
if (sections.has('3')) {
  out('## 3. Specialist strategies (S2; target: each wins fair x 0.6-1.5)');
  out();
  const strategyNames = ['greedy', ...KINDS_FOCUS.map((k) => `focus-${k}`)];
  const make = (name: string): B => (name === 'greedy' ? greedy() : specialist(name.slice(6)));
  const combos = (xs: string[], k: number): string[][] =>
    k === 0 ? [[]] : xs.flatMap((x, i) => combos(xs.slice(i + 1), k - 1).map((c) => [x, ...c]));
  out(`| seats | ${strategyNames.join(' | ')} |`);
  out(`|---|${strategyNames.map(() => '---').join('|')}|`);
  for (const n of seatCounts) {
    // Fewer seats than strategies: every n-subset gets a share of the games, results pooled.
    const rosters = n < strategyNames.length ? combos(strategyNames, n) : [strategyNames];
    const per = Math.max(50, Math.ceil(games / rosters.length));
    const wins: Record<string, number> = {};
    const played: Record<string, number> = {};
    for (const names of rosters) {
      const roster = names.map(make);
      while (roster.length < n) roster.push(random());
      const { summary: s } = runSim(
        { engine: windamere, bots: roster, seats: n, maxActions: 5000 },
        per,
        seed,
      );
      for (const name of [...names, 'random']) {
        if (s.winByBot[name] === undefined) continue;
        const held = name === 'random' ? n - names.length : 1;
        wins[name] = (wins[name] ?? 0) + (s.winByBot[name] ?? 0) * held * per;
        played[name] = (played[name] ?? 0) + held * per;
      }
    }
    const cells = strategyNames.map((name) => {
      const w = (wins[name] ?? 0) / (played[name] ?? 1);
      if (played[name]) (headline[n] ??= {})[`s2.${name}`] = w * n;
      return played[name] ? `${pct(w)} (${(w * n).toFixed(2)}x)` : '-';
    });
    out(
      `| ${n} (${rosters.length} roster${rosters.length > 1 ? 's' : ''} x ${per} games) | ${cells.join(' | ')} |`,
    );
  }
  out();
  out('Cell = win share per seat held, and that share as a multiple of fair (1/seats).');
}

if (jsonPath) {
  const doc = {
    overlay: overlayPath || null,
    name: overlay?.name ?? 'baseline',
    games,
    seed,
    seats: headline,
    greatWorks: gwPooled,
  };
  writeFileSync(jsonPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.error(`  wrote ${jsonPath}`);
}
