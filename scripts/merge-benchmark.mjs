import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, recommend, toMarkdown, BACKEND_INFO } from './benchmark.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function parseArgs() {
  const opts = {
    inputs: [],
    json: path.join(repoRoot, 'benchmarks', 'benchmark-results.json'),
    md: path.join(repoRoot, 'benchmarks', 'benchmark-results.md'),
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = argv[++i];
    else if (a === '--md') opts.md = argv[++i];
    else opts.inputs.push(a);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  if (opts.inputs.length === 0) {
    console.error('Usage: node scripts/merge-benchmark.mjs <file1.json> [file2.json ...] [--json out] [--md out]');
    process.exit(1);
  }

  const mergedResults = {};
  let mode = 'unknown';
  const scenarios = [];
  for (const input of opts.inputs) {
    const data = JSON.parse(await fs.readFile(input, 'utf8'));
    if (data.mode) mode = data.mode;
    for (const [backendId, agg] of Object.entries(data.results ?? {})) {
      mergedResults[backendId] = agg;
      for (const r of agg.raw ?? []) if (!scenarios.includes(r.scenarioId)) scenarios.push(r.scenarioId);
    }
  }

  const backends = Object.keys(mergedResults);
  const aggList = backends.map((b) => mergedResults[b]);
  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    backends,
    scenarios,
    results: mergedResults,
    recommendation: {
      defaultBackend: recommend(aggList),
      rationale:
        'Ranked by plan validity rate, then execution success rate, then preference for offline/zero-cost backends.',
    },
  };

  await fs.mkdir(path.dirname(opts.json), { recursive: true });
  await fs.writeFile(opts.json, JSON.stringify(report, null, 2));
  await fs.writeFile(opts.md, toMarkdown(report, aggList));
  console.log(`Merged ${backends.length} backend(s): ${backends.join(', ')}`);
  console.log(`Recommended default backend: ${report.recommendation.defaultBackend}`);
  console.log(`Wrote ${opts.json}\nWrote ${opts.md}`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
