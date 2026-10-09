const { test, expect, openEditor } = require('./fixtures');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { request } = require('@playwright/test');
const repoRoot = path.resolve(__dirname, '../..');

const projectId = 'proj_browser';
const projectIds = new WeakMap();

function meetingProject() {
  return {
    id: projectId, name: '예배 준비 검증',
    settings: { targetWidth: 1920, targetHeight: 1080, currentLiveSlideId: 'praise_a' },
    slides: [
      { id: 'praise_a', name: '찬양 A', slideType: 'praise', isPraise: true, elements: [{ id: 'a', type: 'text', content: '첫 가사', x: 10, y: 20, width: 80, height: 25, style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial' } }] },
      { id: 'blank', name: '빈 화면', slideType: 'blank', elements: [] },
      { id: 'bible', name: '성경', elements: [{ id: 'verse', type: 'text', content: '태초에 하나님이', x: 10, y: 20, width: 80, height: 25, style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial' } }] },
      { id: 'praise_b', name: '찬양 B', slideType: 'praise', isPraise: true, elements: [{ id: 'b', type: 'text', content: '다음 가사', x: 10, y: 20, width: 80, height: 25, style: { fontSize: '4vw', fontColor: '#ffffff', fontFamily: 'Arial' } }] },
    ], templates: [], customFonts: [],
  };
}

async function seed(app, data = meetingProject()) {
  const id = await app.seedProject(data);
  projectIds.set(app, id);
  return id;
}

async function project(app) {
  return app.exportProject(projectIds.get(app));
}

async function presenter(page, app) {
  await page.goto(`${app.url}/static/presenter.html`);
  await expect(page.locator('#status-text')).toHaveText('연결됨');
}

async function output(context, app, channel) {
  const page = await context.newPage();
  await page.goto(`${app.url}/static/viewer.html?channel=${channel}`);
  await expect(page.locator('body')).not.toHaveClass(/system-disconnected/);
  return page;
}

async function live(page, slideId) {
  await page.locator(`#slide-item-${slideId}`).click();
  await expect(page.locator(`#slide-item-${slideId}`)).toHaveClass(/live/);
}

async function outputTexts(page) {
  return page.evaluate(() => canvas.getObjects().filter(object => object.text).map(object => object.text));
}

async function secondComputerContext(testInfo) {
  const dataDir = testInfo.outputPath('second-computer-data');
  await fs.mkdir(dataDir, { recursive: true });
  const readyPath = path.join(dataDir, 'ready.json');
  const python = process.env.SUBCAST_TEST_PYTHON || path.join(repoRoot, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const child = spawn(python, [path.join(__dirname, 'server.py'), '--data-dir', dataDir, '--port', '0'], {
    cwd: repoRoot, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'],
  });
  let api;
  try {
    await expect.poll(async () => {
      try {
        const ready = JSON.parse(await fs.readFile(readyPath, 'utf8'));
        const response = await fetch(`http://127.0.0.1:${ready.port}/api/system/version`, { signal: AbortSignal.timeout(1000) });
        return response.ok ? ready.port : false;
      } catch { return false; }
    }, { timeout: 30_000 }).not.toBe(false);
    const ready = JSON.parse(await fs.readFile(readyPath, 'utf8'));
    api = await request.newContext({ baseURL: `http://127.0.0.1:${ready.port}` });
    return {
      api,
      async close() {
        await api.dispose();
        if (child.exitCode === null && child.signalCode === null) {
          await new Promise(resolve => {
            const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 10_000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
            child.kill();
          });
        }
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

test('SC-17-01 prepared service remains intact after backend restart', async ({ page, app }) => {
  await seed(app);
  await openEditor(page);
  await expect(page.locator('.slide-item')).toHaveCount(4);
  await app.restart();
  await page.reload();
  await expect(page.locator('.slide-item')).toHaveCount(4);
  const restored = await project(app);
  expect(restored.slides.map(slide => slide.id)).toEqual(['praise_a', 'blank', 'bible', 'praise_b']);
  expect(restored.slides[0].elements[0].content).toBe('첫 가사');
  expect(restored.slides[2].elements[0].content).toBe('태초에 하나님이');
});

test('SC-17-02 live service slide changes reach output and monitor current/next', async ({ page, context, app }) => {
  await seed(app);
  await presenter(page, app);
  const viewer = await output(context, app, 'obs');
  const monitor = await context.newPage();
  await monitor.goto(`${app.url}/static/monitor.html?channel=monitor`);
  await expect(monitor.locator('#monitor-current-text')).toContainText('첫 가사');
  await live(page, 'blank');
  await expect.poll(() => outputTexts(viewer)).toEqual([]);
  await expect(monitor.locator('#monitor-viewer-container')).toBeHidden();
  await live(page, 'bible');
  await expect.poll(() => outputTexts(viewer)).toEqual(['태초에 하나님이']);
  await expect(monitor.locator('#monitor-viewer-container')).toBeHidden();
  await expect.poll(() => outputTexts(monitor)).toEqual(['태초에 하나님이']);
  await live(page, 'praise_b');
  await expect.poll(() => outputTexts(viewer)).toEqual(['다음 가사']);
  await expect(monitor.locator('#monitor-current-text')).toContainText('다음 가사');
  await expect.poll(async () => (await project(app)).settings.currentLiveSlideId).toBe('praise_b');
  await viewer.close();
  await monitor.close();
});

test('SC-17-03 exported project imports on an isolated second computer', async ({ app }, testInfo) => {
  await seed(app);
  const exported = await project(app);
  const secondApp = await secondComputerContext(testInfo);
  try {
    const imported = await secondApp.api.post('/api/projects/import', {
      multipart: { file: { name: 'service.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) } },
    });
    expect(imported.ok(), await imported.text()).toBeTruthy();
    const importedId = (await imported.json()).projects[0].id;
    await secondApp.api.post(`/api/projects/${importedId}/select`);
    await expect.poll(async () => (await (await secondApp.api.get(`/api/projects/${importedId}/export`)).json()).slides.map(slide => slide.id))
      .toEqual(['praise_a', 'blank', 'bible', 'praise_b']);
    const restored = await (await secondApp.api.get(`/api/projects/${importedId}/export`)).json();
    expect(restored.slides[2].elements[0].content).toBe('태초에 하나님이');
    await app.restart();
    expect((await project(app)).slides[0].elements[0].content).toBe('첫 가사');
  } finally {
    await secondApp.close();
  }
});

test('SC-17-04 connection loss and recovery restores the server saved state', async ({ page, app }) => {
  await seed(app);
  await openEditor(page);
  await app.stop();
  await expect(page.locator('#autosave-status-text')).toContainText('연결 끊김');
  await app.start();
  await expect(page.locator('#status-text')).toHaveText('연결됨', { timeout: 20_000 });
  await expect(page.locator('.slide-item')).toHaveCount(4);
  const restored = await project(app);
  expect(restored.slides[0].elements[0].content).toBe('첫 가사');
  expect(restored.settings.currentLiveSlideId).toBe('praise_a');
});
