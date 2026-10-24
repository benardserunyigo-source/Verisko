#!/usr/bin/env node
// Run existing behavioral tests without exposing the private pricing input.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...process.env };
const budgetFile = env.VERISKO_PRICING_BUDGET_FILE || path.join(root, '.cfo-audit-20261018/private-budget.json');
if (!env.VERISKO_PRICING_BUDGET && fs.existsSync(budgetFile)) {
  env.VERISKO_PRICING_BUDGET = fs.readFileSync(budgetFile, 'utf8');
}
if (!env.VERISKO_PRICING_BUDGET) {
  console.error('Private pricing input is unavailable. Set VERISKO_PRICING_BUDGET_FILE or VERISKO_PRICING_BUDGET. No complete-suite claim can be made.');
  process.exit(2);
}
try { JSON.parse(env.VERISKO_PRICING_BUDGET); }
catch { console.error('Private pricing input is not valid JSON.'); process.exit(2); }
const run = spawnSync('npm', ['test', '--prefix', path.join(root, 'sales-app')], {
  env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
if (run.error) { console.error('Could not start the test runner.'); process.exit(2); }
// Only summary counters are printed; test diagnostics can contain private inputs.
const output = `${run.stdout || ''}\n${run.stderr || ''}`;
const summaries = output.split('\n').filter(line => /^(?:ℹ |# )(?:tests |suites |pass |fail |cancelled |skipped |todo |duration_ms )/.test(line));
for (const line of summaries) console.log(line);
if (run.status !== 0) console.error('Portal tests failed. Reproduce the relevant test locally and inspect diagnostics privately.');
else if (!summaries.length) console.error('Runner exited successfully but summary counters were not recognized; inspect the runner before claiming test counts.');
process.exit(run.status ?? 2);
