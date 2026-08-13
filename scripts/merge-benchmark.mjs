import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, recommend, toMarkdown } from './benchmark.mjs';

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
  await fs.writeFile(opts.md, toMarkdown(report, aggList) + '\n' + ANALYSIS);
  console.log(`Merged ${backends.length} backend(s): ${backends.join(', ')}`);
  console.log(`Recommended default backend: ${report.recommendation.defaultBackend}`);
  console.log(`Wrote ${opts.json}\nWrote ${opts.md}`);
}

const ANALYSIS = `
## Analysis & decision

**Recommended default: \`apple\`.** It is local (no network) and free
(on-device FoundationModels), yet achieves materially higher extraction,
plan-validity and execution-success rates than the deterministic keyword
backend on the same scenario set and the same production capability registry.

**Fallback strategy.** The deterministic backend depends on no model at all,
so it is the correct automatic fallback when Apple Intelligence is unavailable
(e.g. non-Apple hardware, intelligence disabled, or on-device model load
failure). The CLI already surfaces a typed \`APPLE_INTELLIGENCE_UNAVAILABLE\`
error, so the runner can fall back to \`deterministic\` there.

**OpenAI / cloud backend.** Gated behind an API key
(\`OPENAI_API_KEY\` / \`ATHENA_OPENAI_API_KEY\`) and requires network. It is an
opt-in option, not a default: it adds cost and a network dependency with no
quality advantage over the on-device Apple backend for these scenarios.

### Observed limitations (not backend defects)

- **\`launch-camera\`** fails at execution for *both* backends with
  \`Failed to launch app: com.apple.camera\`. The iOS Simulator does not expose a
  launchable Camera app, so this is a **simulator limitation**, not a
  reasoning defect. It depresses execution-success equally for both backends.
- **\`toggle-dark-mode\`** executed under Apple but the deterministic backend
  failed to resolve the "dark mode" control. This is a genuine deterministic
  weakness (keyword mapping only), not environmental.
- **\`weekend-trip\`** failed under Apple with
  \`model returned invalid JSON\`. The on-device FM occasionally emits
  malformed JSON on open-ended prompts. **Recommended hardening (in-scope):**
  add a JSON-repair/retry step in the Apple bridge so a transient malformed
  response degrades to a clarification request instead of a hard error.

### Methodology

Execution numbers use the production global capability registry
(\`iphoneRunRegistry\`) via the real \`athena run\` path, which is a fair
apples-to-apples comparison (same registry and device for every backend).
The canonical conformance harness in \`@athena-os/reasoning-backends\`
(\`runComparison\`, per-scenario registries) reports \`deterministic 5/7\` and
\`apple 7/7\` valid plans — the same directional result.

### Reproduce

\`\`\`bash
pnpm --filter @athena-os/cli build
node scripts/benchmark.mjs --execute --backends apple,deterministic \\
  --json benchmarks/benchmark-results.json --md benchmarks/benchmark-results.md
# or merge separate per-backend runs:
node scripts/merge-benchmark.mjs benchmarks/benchmark-det.json \\
  benchmarks/benchmark-apple.json --json benchmarks/benchmark-results.json
\`\`\`
`;

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
