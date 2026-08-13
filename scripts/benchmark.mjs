import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const cliPath = path.join(repoRoot, 'apps', 'cli', 'dist', 'index.js');

const SCENARIOS = [
  { id: 'open-settings', prompt: 'Open Settings' },
  { id: 'reply-message', prompt: 'reply to Alice' },
  {
    id: 'photo-cleanup',
    prompt: 'Delete screenshots older than 30 days and disconnect the photo service',
  },
  { id: 'launch-camera', prompt: 'open camera' },
  { id: 'toggle-dark-mode', prompt: 'toggle dark mode' },
  { id: 'flight-search', prompt: 'find me flights to Tokyo under $500' },
  { id: 'weekend-trip', prompt: 'plan a weekend trip to Kyoto' },
];

const BACKEND_INFO = {
  deterministic: {
    networkDependency: false,
    cost: '$0 (local heuristic)',
    model: 'deterministic-keyword',
  },
  apple: {
    networkDependency: false,
    cost: '$0 (on-device FoundationModels)',
    model: 'apple:system-language-model',
  },
  openai: {
    networkDependency: true,
    cost: 'per-token (OpenAI-compatible API key required)',
    model: 'gpt (OpenAI-compatible)',
  },
};

function enabledBackends() {
  const backends = ['deterministic'];
  if (process.env.ATHENA_COMPARE_LIVE === '1') backends.push('apple');
  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.ATHENA_OPENAI_API_KEY;
  if (openaiKey) backends.push('openai');
  return backends;
}

function runOnce(backend, prompt, execute) {
  return new Promise((resolve) => {
    const args = ['run', prompt, '--backend', backend, '--json'];
    if (!execute) args.push('--dry-run');
    const started = performance.now();
    execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: 300000, maxBuffer: 64 * 1024 * 1024, env: process.env },
      (error, stdout, stderr) => {
        const latencyMs = Math.round(performance.now() - started);
        let json = null;
        let parseError = null;
        try {
          const trimmed = stdout.trim();
          const start = trimmed.indexOf('{');
          json = start >= 0 ? JSON.parse(trimmed.slice(start)) : null;
        } catch (e) {
          parseError = String(e);
        }
        resolve({ backend, prompt, latencyMs, json, error: error?.message ?? null, stderr: stderr?.slice(-500) ?? null, parseError });
      }
    );
  });
}

export function deriveMetrics(run) {
  const r = run.json;
  if (!r) {
    return {
      ok: false,
      kind: 'error',
      extractionSuccess: false,
      planValid: false,
      executionSuccess: false,
      clarification: run.error ?? run.parseError ?? 'no output',
      latencyMs: run.latencyMs,
      goals: [],
    };
  }
  const kind = r.kind;
  const steps = r.plan?.steps ?? [];
  const executed = r.executed ?? [];
  const goals = (r.plan?.steps ?? []).map((s) => s.capabilityId).filter(Boolean);
  const extractionSuccess = kind !== 'clarificationRequired' && kind !== 'error';
  const planValid =
    kind === 'plan' ||
    kind === 'executed' ||
    kind === 'executionPlan' ||
    kind === 'executionFailed';
  const executionSuccess =
    kind === 'executed' && executed.length > 0 && executed.every((s) => s.success);
  const clarification = kind === 'clarificationRequired' ? r.reason : kind === 'executionFailed' ? r.error : undefined;
  return {
    ok: r.success !== false,
    kind,
    extractionSuccess,
    planValid,
    executionSuccess,
    clarification,
    latencyMs: run.latencyMs,
    goals,
    steps: steps.length,
    executedSteps: executed.length,
    executedSuccess: executed.filter((s) => s.success).length,
  };
}

export function aggregate(backend, rows) {
  const n = rows.length;
  const rate = (pred) => (n === 0 ? 0 : rows.filter(pred).length / n);
  return {
    backendId: backend,
    model: BACKEND_INFO[backend]?.model ?? backend,
    networkDependency: BACKEND_INFO[backend]?.networkDependency ?? null,
    cost: BACKEND_INFO[backend]?.cost ?? null,
    scenarios: n,
    extractionSuccessRate: rate((r) => r.extractionSuccess),
    planValidityRate: rate((r) => r.planValid),
    executionSuccessRate: rate((r) => r.executionSuccess),
    clarificationRate: rate((r) => r.kind === 'clarificationRequired'),
    avgLatencyMs: n === 0 ? 0 : Math.round(rows.reduce((s, r) => s + r.latencyMs, 0) / n),
    avgStepLatencyMs: n === 0 ? 0 : Math.round(rows.reduce((s, r) => s + r.latencyMs, 0) / n),
    raw: rows,
  };
}

export function recommend(agg) {
  const ranked = [...agg].sort((a, b) => {
    if (b.planValidityRate !== a.planValidityRate) return b.planValidityRate - a.planValidityRate;
    if (b.executionSuccessRate !== a.executionSuccessRate)
      return b.executionSuccessRate - a.executionSuccessRate;
    if (a.networkDependency !== b.networkDependency) return a.networkDependency ? -1 : 1;
    return a.backendId.localeCompare(b.backendId);
  });
  return ranked[0]?.backendId ?? null;
}

function parseArgs() {
  const opts = {
    execute: false,
    backends: null,
    scenarios: path.join(repoRoot, 'benchmarks', 'benchmark-7.json'),
    json: path.join(repoRoot, 'benchmarks', 'benchmark-results.json'),
    md: path.join(repoRoot, 'benchmarks', 'benchmark-results.md'),
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') opts.execute = true;
    else if (a === '--backends') opts.backends = argv[++i];
    else if (a === '--scenarios') opts.scenarios = argv[++i];
    else if (a === '--json') opts.json = argv[++i];
    else if (a === '--md') opts.md = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.error(
        'Usage: node scripts/benchmark.mjs [--execute] [--backends apple,deterministic,openai] [--scenarios path] [--json path] [--md path]'
      );
      process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const execute = opts.execute || process.env.ATHENA_BENCH_EXECUTE === '1';
  let backends = opts.backends ? opts.backends.split(',').map((s) => s.trim()) : enabledBackends();
  const mode = execute ? 'execution (simulator)' : 'dry-run (reason-only)';

  let scenarios = SCENARIOS;
  try {
    const loaded = JSON.parse(await fs.readFile(opts.scenarios, 'utf8'));
    if (Array.isArray(loaded) && loaded.length) scenarios = loaded;
  } catch {
    /* fall back to built-in SCENARIOS */
  }

  console.error(`Benchmark mode: ${mode}`);
  console.error(`Backends: ${backends.join(', ')}`);
  console.error(`Scenarios: ${scenarios.length}`);

  const report = { generatedAt: new Date().toISOString(), mode, backends, scenarios: [], results: {} };

  for (const backend of backends) {
    const rows = [];
    for (const scenario of scenarios) {
      const run = await runOnce(backend, scenario.prompt, execute);
      const m = deriveMetrics(run);
      rows.push({ scenarioId: scenario.id, prompt: scenario.prompt, ...m });
      console.error(`  [${backend}] ${scenario.id}: ${m.kind} (${m.latencyMs}ms)`);
    }
    report.results[backend] = aggregate(backend, rows);
    report.scenarios.push(...rows.map((r) => r.scenarioId));
  }
  report.scenarios = [...new Set(report.scenarios)];

  const aggList = backends.map((b) => report.results[b]);
  report.recommendation = {
    defaultBackend: recommend(aggList),
    rationale:
      'Ranked by plan validity rate, then execution success rate, then preference for offline/zero-cost backends.',
  };

  const outDir = path.join(repoRoot, 'benchmarks');
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = opts.json ?? path.join(outDir, 'benchmark-results.json');
  const mdPath = opts.md ?? path.join(outDir, 'benchmark-results.md');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, toMarkdown(report, aggList));

  console.error(`\nWrote ${jsonPath}\nWrote ${mdPath}`);
  console.log(`Recommended default backend: ${report.recommendation.defaultBackend}`);
}

export function toMarkdown(report, agg) {
  const lines = [];
  lines.push('# Athena Reasoning-Backend Benchmark');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Scenarios: ${report.scenarios.join(', ')}`);
  lines.push('');
  lines.push('## Per-backend summary');
  lines.push('');
  lines.push(
    '| Backend | Model | Network | Cost | Extraction | Plan valid | Exec success | Clarify rate | Avg latency |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of agg) {
    const pct = (x) => `${Math.round(x * 100)}%`;
    lines.push(
      `| ${a.backendId} | ${a.model} | ${a.networkDependency ? 'yes' : 'no'} | ${a.cost} | ${pct(
        a.extractionSuccessRate
      )} | ${pct(a.planValidityRate)} | ${pct(a.executionSuccessRate)} | ${pct(
        a.clarificationRate
      )} | ${a.avgLatencyMs}ms |`
    );
  }
  lines.push('');
  lines.push('## Scenario detail');
  lines.push('');
  for (const backend of report.backends) {
    lines.push(`### ${backend}`);
    lines.push('');
    lines.push('| Scenario | Kind | Extract | Plan valid | Exec success | Steps | Latency |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const row of report.results[backend].raw) {
      const yesNo = (b) => (b ? '✓' : '✗');
      lines.push(
        `| ${row.scenarioId} | ${row.kind} | ${yesNo(row.extractionSuccess)} | ${yesNo(
          row.planValid
        )} | ${yesNo(row.executionSuccess)} | ${row.executedSuccess}/${row.executedSteps} | ${
          row.latencyMs
        }ms |`
      );
    }
    lines.push('');
  }
  lines.push('## Recommendation');
  lines.push('');
  lines.push(
    `Default backend: **${report.recommendation.defaultBackend}** — ${report.recommendation.rationale}`
  );
  lines.push('');
  return lines.join('\n');
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
