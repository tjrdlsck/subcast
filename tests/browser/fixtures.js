const { test: base, expect, request } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const fabricPath = path.join(root, 'test_results/browser/cache/fabric.min.js');
const fabricHash = 'f3a3763020189d69b8d2b64197172682b6d90f8f90fcac52d799b0cf64a9870a';

function initialProject() {
  return {
    id: 'proj_browser', name: '브라우저 테스트',
    settings: { targetWidth: 1920, targetHeight: 1080, currentLiveSlideId: 'slide_a' },
    slides: ['첫 번째 테스트 자막', '두 번째 테스트 자막'].map((text, i) => ({
      id: i ? 'slide_b' : 'slide_a', name: `슬라이드 ${i + 1}`, elements: [{
        id: `text_${i}`, type: 'text', content: text,
        x: 10, y: 40, width: 80, height: 20,
        style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial' },
      }],
    })),
    templates: [], customFonts: [],
  };
}

const test = base.extend({
  app: async ({}, use, testInfo) => {
    const dataDir = testInfo.outputPath('app-data');
    await fs.mkdir(path.join(dataDir, 'data/projects'), { recursive: true });
    await fs.writeFile(path.join(dataDir, 'data/projects/proj_browser.json'), JSON.stringify(initialProject()));
    await fs.writeFile(path.join(dataDir, 'data/active_project_id.txt'), 'proj_browser');
    let child;
    let port = 0;
    let log = '';
    let api;
    const python = process.env.SUBCAST_TEST_PYTHON || path.join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const stop = async () => {
      if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
      const stopped = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Isolated backend did not stop; forced termination requested'));
        }, 10_000);
        child.once('exit', () => { clearTimeout(timeout); resolve(); });
      });
      child.kill();
      await stopped;
    };
    const start = async () => {
      const readyPath = path.join(dataDir, 'ready.json');
      await fs.rm(readyPath, { force: true });
      child = spawn(python, [path.join(__dirname, 'server.py'), '--data-dir', dataDir, '--port', String(port)], {
        cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let spawnError;
      child.once('error', error => { spawnError = error; });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk.toString(); });
      await expect.poll(async () => {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null) throw new Error(`Test server exited (${child.exitCode}):\n${log}`);
        try {
          const ready = JSON.parse(await fs.readFile(readyPath, 'utf8'));
          const response = await fetch(`http://127.0.0.1:${ready.port}/api/system/version`, { signal: AbortSignal.timeout(1000) });
          if (!response.ok) return false;
          port = ready.port;
          return true;
        } catch { return false; }
      }, { timeout: 30_000, message: 'Isolated backend must become ready' }).toBe(true);
    };
    try {
      await start();
      const url = `http://127.0.0.1:${port}`;
      api = await request.newContext({ baseURL: url });
      const app = {
        url, dataDir, request: api, videoPath: path.join(dataDir, 'sample.mp4'),
        async seedProject(project) {
          const response = await api.post('/api/projects/import', {
            multipart: { file: { name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) } },
          });
          expect(response.ok(), await response.text()).toBeTruthy();
          const imported = await response.json();
          const id = imported.projects[0].id;
          const selected = await api.post(`/api/projects/${id}/select`);
          expect(selected.ok(), await selected.text()).toBeTruthy();
          return id;
        },
        async exportProject(id = 'proj_browser') {
          const response = await api.get(`/api/projects/${id}/export`);
          expect(response.ok(), await response.text()).toBeTruthy();
          return response.json();
        },
        async stop() { await stop(); },
        async start() { await start(); },
        async restart() { await stop(); await start(); },
      };
      await use(app);
    } finally {
      try {
        await stop();
      } finally {
        await fs.writeFile(testInfo.outputPath('server.log'), log);
        await testInfo.attach('backend log', { path: testInfo.outputPath('server.log'), contentType: 'text/plain' });
        if (api) await api.dispose();
      }
    }
  },
  baseURL: async ({ app }, use) => { await use(app.url); },
  diagnostics: [async ({ context, app }, use, testInfo) => {
    const fabric = await fs.readFile(fabricPath).catch(() => {
      throw new Error('Run npm run test:browser:setup before browser tests.');
    });
    expect(createHash('sha256').update(fabric).digest('hex'), 'Fabric cache checksum').toBe(fabricHash);
    // Use the same pinned CDN script; no mocks for application APIs or WebSockets.
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js', route => route.fulfill({ body: fabric, contentType: 'application/javascript' }));
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await context.route('**/api/system/check-update', async route => {
      const response = await app.request.get('/api/system/version');
      const { version } = await response.json();
      await route.fulfill({ json: { has_update: false, current_version: version, latest_version: version } });
    });
    await context.route('**/api/system/auto-update', route => route.fulfill({ status: 403, json: { detail: 'Installer execution is disabled in browser regression tests.' } }));
    const events = [];
    const errors = [];
    const attachPage = page => {
      page.on('pageerror', error => { errors.push(error.message); events.push({ type: 'pageerror', url: page.url(), message: error.message }); });
      page.on('console', message => { if (message.type() === 'error') events.push({ type: 'console', url: page.url(), message: message.text() }); });
      page.on('requestfailed', req => events.push({ type: 'requestfailed', url: req.url(), message: req.failure()?.errorText }));
    };
    context.pages().forEach(attachPage);
    context.on('page', attachPage);
    try {
      await use();
      if (testInfo.status === 'passed') expect(errors, 'Unexpected browser JavaScript errors').toEqual([]);
    } finally {
      if (testInfo.status !== 'passed' || errors.length) {
        for (const [i, page] of context.pages().entries()) {
          if (!page.isClosed()) {
            const screenshot = testInfo.outputPath(`screen-${i}.png`);
            await page.screenshot({ path: screenshot }).then(() => testInfo.attach(`screen ${i}: ${page.url()}`, { path: screenshot, contentType: 'image/png' })).catch(() => {});
          }
        }
      }
      await testInfo.attach('browser diagnostics', { body: Buffer.from(JSON.stringify(events, null, 2)), contentType: 'application/json' });
    }
  }, { auto: true }],
});

async function openEditor(page) {
  await page.goto('/static/editor.html');
  await expect(page.locator('#btn-add-slide')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => Boolean(activeSlideId && myEditorId && lockedSlides[activeSlideId]?.ownerId === myEditorId))).toBe(true);
}

module.exports = { test, expect, openEditor };
