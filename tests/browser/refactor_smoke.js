async (page) => {
    const base = 'http://127.0.0.1:8817';
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const viewers = [];
    const freshScripts = route => route.continue();
    await page.context().route("**/static/js/**", freshScripts);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(`${base}/static/editor.html`);
        await page.waitForFunction(() => typeof canvas !== 'undefined' && canvas && projectData?.slides?.length && myEditorId && lockedSlides[activeSlideId]?.ownerId === myEditorId);
        const freshId = await page.evaluate(async () => {
            const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `refactor-smoke-${Date.now()}` }) });
            if (!response.ok) throw Error('test project creation failed');
            const created = await response.json();
            const projectId = created.id || created.project?.id;
            if (!projectId) throw Error(`missing test project id: ${JSON.stringify(created)}`);
            await fetch(`/api/projects/${projectId}/select`, { method: 'POST' });
            return projectId;
        });
        await page.waitForFunction(projectId => projectData?.id === projectId && canvas && lockedSlides[activeSlideId]?.ownerId === myEditorId, freshId);
        const id = await page.evaluate(() => projectData.id);
        const oldZoom = await page.evaluate(() => canvasZoom);
        await page.evaluate(() => {
            projectData.slides.find(s => s.id === activeSlideId).slideType = 'praise';
            const text = new fabric.Textbox('smoke fixture', { left: 76.8, top: 43.2, width: 500, fontSize: 40, fill: '#ffffff', originalId: 'smoke-text', originalVwSize: '4vw' });
            canvas.add(text);
            text.set('text', 'refactor-autosave-contract');
            canvas.fire('object:modified', { target: text });
        });
        await page.waitForFunction(async projectId => {
            const data = await (await fetch(`/api/projects/${projectId}/export`)).json();
            return data.slides.some(slide => slide.elements.some(element => element.content === 'refactor-autosave-contract'));
        }, id);
        await page.waitForFunction(() => !isSlideDirty);
        check(Math.abs(await page.evaluate(() => canvasZoom) - oldZoom) < 0.00001, 'autosave changed zoom');
        await page.evaluate(() => {
            const text = canvas.getObjects().find(obj => ['text', 'textbox'].includes(obj.type));
            text.set('text', 'refactor-manual-contract');
            canvas.setActiveObject(text);
            setSlideDirty(true);
            document.getElementById('btn-save').click();
        });
        await page.waitForFunction(async projectId => {
            const data = await (await fetch(`/api/projects/${projectId}/export`)).json();
            return data.slides.some(slide => slide.elements.some(element => element.content === 'refactor-manual-contract'));
        }, id);
        check(await page.evaluate(() => canvas.getActiveObject()?.text === 'refactor-manual-contract'), 'manual save lost selection');
        check(Math.abs(await page.evaluate(() => canvasZoom) - oldZoom) < 0.00001, 'manual save changed zoom');
        const originalSlideId = await page.evaluate(() => activeSlideId);
        await page.evaluate(() => addSlide());
        await page.waitForFunction(() => projectData.slides.length > 1 && !isSlideDirty);
        const nextId = await page.evaluate(id => projectData.slides.find(slide => slide.id !== id).id, originalSlideId);
        await page.evaluate(id => selectSlideForEdit(id), originalSlideId);
        await page.waitForFunction(id => activeSlideId === id && lockedSlides[id]?.ownerId === myEditorId, originalSlideId);
        await page.evaluate(id => {
            canvas.getObjects().find(obj => obj.type === 'textbox').set('text', 'refactor-switch-contract');
            setSlideDirty(true);
            selectSlideForEdit(id);
        }, nextId);
        await page.waitForFunction(id => activeSlideId === id && !isSlideDirty, nextId);
        check(await page.evaluate(async ({ projectId, slideId }) => {
            const data = await (await fetch(`/api/projects/${projectId}/export`)).json();
            return data.slides.find(slide => slide.id === slideId).elements.some(element => element.content === 'refactor-switch-contract');
        }, { projectId: id, slideId: originalSlideId }), 'switch lost last edit');
        await page.evaluate(id => selectSlideForEdit(id), originalSlideId);
        await page.waitForFunction(id => activeSlideId === id && lockedSlides[id]?.ownerId === myEditorId, originalSlideId);
        await page.evaluate(() => {
            canvas.getObjects().find(obj => obj.type === 'textbox').set('text', 'refactor-manual-contract');
            setSlideDirty(true);
            saveSlideData();
        });
        await page.waitForFunction(() => !isSlideDirty && document.getElementById('status-text').innerText === '저장 완료');
        check(await page.evaluate(() => window.projectData === projectData && window.activeSlideId === activeSlideId), 'shared editor state diverged');
        const liveId = await page.evaluate(() => activeSlideId);
        await page.evaluate(slideId => ws.send(JSON.stringify({ type: 'SLIDE_CHANGE', slideId })), liveId);
        for (const channel of ['broadcast', 'stage', 'monitor', 'monitor_preview']) {
            const viewer = await page.context().newPage();
            viewers.push(viewer);
            viewer.on('pageerror', error => errors.push(`${channel}: ${error.message}`));
            await viewer.goto(`${base}/static/viewer.html?channel=${channel}`);
            await viewer.waitForFunction(() => typeof projectData !== 'undefined' && projectData?.slides?.length && canvas);
        }
        const [broadcast, stage, monitor, preview] = viewers;
        const layout = { x: 10, y: 60, width: 70, height: 25, fontSize: '4vw', fontColor: '#123456', hasBgBar: false };
        await page.evaluate(value => savePraiseBroadcastLayoutDirect(value, false), layout);
        await broadcast.waitForFunction(() => projectData.settings.praiseBroadcastLayout?.x === 10 && canvas.getObjects().some(obj => obj.text === 'refactor-manual-contract' && obj.fill === '#123456'));
        await stage.waitForFunction(() => canvas.getObjects().some(obj => obj.text === 'refactor-manual-contract'));
        check(await stage.evaluate(() => canvas.getObjects().find(obj => obj.text === 'refactor-manual-contract').fill !== '#123456'), 'stage adopted broadcast formatting');
        const monitorSettings = await page.evaluate(async () => (await (await fetch('/api/v1/monitor/settings')).json()).data);
        monitorSettings.currentBox.fontSize = 37;
        monitorSettings.currentBox.textColor = '#abcdef';
        const response = await page.evaluate(async settings => {
            const result = await fetch('/api/v1/monitor/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
            localStorage.setItem('subcast_monitor_settings', JSON.stringify(settings));
            const bc = new BroadcastChannel('subcast_monitor_channel');
            bc.postMessage({ type: 'MONITOR_LAYOUT_UPDATE', settings });
            bc.close();
            return result.status;
        }, monitorSettings);
        check(response === 200, 'monitor setting PUT failed');
        await monitor.waitForFunction(() => document.getElementById('monitor-current-text').style.fontSize === '37px');
        await preview.waitForFunction(() => monitorViewerSettings.currentBox.fontSize === 37);
        const draft = JSON.parse(JSON.stringify(monitorSettings));
        draft.currentBox.fontSize = 43;
        await page.evaluate(settings => {
            const bc = new BroadcastChannel('subcast_monitor_channel');
            bc.postMessage({ type: 'MONITOR_PREVIEW_UPDATE', settings });
            bc.close();
        }, draft);
        await preview.waitForFunction(() => monitorViewerSettings.currentBox.fontSize === 43);
        check(await monitor.evaluate(() => monitorViewerSettings.currentBox.fontSize === 37), 'preview changed live monitor');
        await monitor.reload();
        await monitor.waitForFunction(() => monitorViewerSettings.currentBox.fontSize === 37 && document.getElementById('monitor-current-text').style.fontSize === '37px');
        await page.reload();
        await page.waitForFunction(() => typeof canvas !== 'undefined' && canvas?.getObjects().some(obj => obj.text === 'refactor-manual-contract'));
        const result = await page.evaluate(() => ({
            savedText: canvas.getObjects().find(obj => obj.text === 'refactor-manual-contract').text,
            slideType: projectData.slides.find(s => s.id === activeSlideId).slideType,
            layout: projectData.settings.praiseBroadcastLayout,
            thumbnailsPresent: projectData.slides.some(s => s.thumbnail?.startsWith('data:image/jpeg'))
        }));
        check(errors.length === 0, `page errors: ${errors.join('; ')}`);
        check(result.slideType === 'praise' && result.thumbnailsPresent, 'metadata or thumbnail did not persist');
        return { checks: ['autosave disk persistence', 'manual button persistence and selection', 'zoom restoration', 'broadcast rendering', 'stage formatting isolation', 'monitor layout via HTTP/storage/BroadcastChannel', 'preview isolation', 'reload persistence and initial monitor DOM style', 'dirty switch disk persistence', 'shared editor state'], result, pageErrors: errors };
    } finally {
        for (const viewer of viewers) await viewer.close();
        await page.context().unroute("**/static/js/**", freshScripts);
    }
}
