const { defineConfig } = require('@playwright/test');

// Independent invocations must never clear another run's disposable app data.
process.env.SUBCAST_BROWSER_RUN_ID ||= `${Date.now()}-${process.pid}`;
if (!/^[\w-]+$/.test(process.env.SUBCAST_BROWSER_RUN_ID)) throw new Error('Invalid browser run ID');
const artifacts = `test_results/browser/runs/${process.env.SUBCAST_BROWSER_RUN_ID}/artifacts`;
const runDir = `test_results/browser/runs/${process.env.SUBCAST_BROWSER_RUN_ID}`;

module.exports = defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.js',
  outputDir: artifacts,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Canvas and praise copy/paste share the Windows clipboard across tabs/files.
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${runDir}/report`, open: 'never' }],
    ['json', { outputFile: `${runDir}/results.json` }],
  ],
  use: {
    browserName: 'chromium',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    viewport: { width: 1920, height: 1080 },
    permissions: ['clipboard-read', 'clipboard-write'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
