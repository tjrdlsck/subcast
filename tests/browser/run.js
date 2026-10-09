const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { writeCoverage } = require('./coverage');

const root = path.resolve(__dirname, '../..');
async function main() {
  const args = process.argv.slice(2);
  const cli = require.resolve('@playwright/test/cli');
  if (args[0] === '--report') {
    const latest = JSON.parse(await fs.readFile(path.join(root, 'test_results/browser/last-run.json'), 'utf8'));
    const child = spawn(process.execPath, [cli, 'show-report', latest.report], { cwd: root, stdio: 'inherit' });
    child.on('exit', code => { process.exitCode = code ?? 1; });
    child.on('error', error => { console.error(error); process.exitCode = 1; });
    return;
  }
  const runId = `${Date.now()}-${process.pid}`;
  const runDir = path.join(root, 'test_results/browser/runs', runId);
  const child = spawn(process.execPath, [cli, 'test', ...args], {
    cwd: root, stdio: 'inherit', env: { ...process.env, SUBCAST_BROWSER_RUN_ID: runId },
  });
  const code = await new Promise((resolve, reject) => { child.on('exit', value => resolve(value ?? 1)); child.on('error', reject); });
  const results = path.join(runDir, 'results.json');
  if (!args.includes('--list') && await fs.stat(results).catch(() => null)) {
    await writeCoverage(results);
    await fs.writeFile(path.join(root, 'test_results/browser/last-run.json'), JSON.stringify({
      runId, exitCode: code, results, report: path.join(runDir, 'report'), coverage: path.join(runDir, 'coverage.md'),
    }, null, 2));
  }
  process.exitCode = code;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
