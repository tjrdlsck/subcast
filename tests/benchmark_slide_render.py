"""Generate browser benchmarks using a real exported slide deck."""

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "frontend/js/modules/editor-slides.js"
PRESENTER_SOURCE = "frontend/js/presenter.js"


def make_page(deck: dict, source: str, label: str) -> str:
    data = json.dumps(deck, ensure_ascii=False).replace("<", "\\u003c")
    return f"""<!doctype html><html><body><div id=\"slide-list\"></div>
<div id="slide-sorter-grid"></div><div id="sorter-slide-count"></div>
<script>
let projectData = {data};
let activeSlideId = projectData.slides[0].id;
let selectedSlideIds = [activeSlideId];
let lockedSlides = {{}};
let myEditorId = null;
let isLockRequested = false;
let ws = null;
let canvas = null;
let canvasZoom = 1;
const BASE_WIDTH = 768;
const BASE_HEIGHT = 432;
function checkIsLockedByOthers(id) {{ return !!lockedSlides[id]; }}
function releaseActiveLock() {{}}
function loadSlideToCanvas() {{}}
function setControlsState() {{}}
function isSlideDirty() {{ return false; }}
</script><script>{source}</script><script>
window.addEventListener('load', () => {{
    try {{
        const ids = projectData.slides.map(s => s.id);
        const durations = {{}};
        const timed = (name, fn) => {{
            const start = performance.now();
            fn();
            durations[name] = +(performance.now() - start).toFixed(2);
        }};
        timed('initialRenderMs', () => renderSlides());
        const list = document.getElementById('slide-list');
        if (list.children.length !== ids.length) throw Error('initial card count');
        const firstCard = document.getElementById(`slide-item-${{ids[0]}}`);
        timed('twentySelectionsMs', () => {{
            for (let i = 0; i < 20; i++) selectSlideForEdit(ids[i % 2 ? 100 : 200]);
        }});
        if (!document.getElementById(`slide-item-${{activeSlideId}}`).classList.contains('editing')) throw Error('selection class');
        const target = ids[100];
        lockedSlides[target] = {{editorName: 'tester'}};
        timed('lockUpdateMs', () => {{
            if (typeof updateSlideListItem === 'function') updateSlideListItem(target);
            else renderSlides();
        }});
        if (!document.getElementById(`slide-item-${{target}}`).classList.contains('locked')) throw Error('lock class');
        const lockedActiveId = activeSlideId;
        document.getElementById(`slide-item-${{target}}`).click();
        if (activeSlideId !== lockedActiveId) throw Error('locked slide click');
        delete lockedSlides[target];
        if (typeof updateSlideListItem === 'function') updateSlideListItem(target);
        else renderSlides();
        if (document.getElementById(`slide-item-${{target}}`).classList.contains('locked')) throw Error('unlock class');
        timed('twentyThumbnailUpdatesMs', () => {{
            for (let i = 0; i < 20; i++) {{
                const slide = projectData.slides[100 + i];
                if (typeof updateSlideListItem === 'function') updateSlideListItem(slide.id);
                else renderSlides();
            }}
        }});
        projectData.slides[100].thumbnail = projectData.slides[101].thumbnail;
        if (typeof updateSlideListItem === 'function') updateSlideListItem(ids[100]);
        else renderSlides();
        if (document.getElementById(`slide-item-${{ids[100]}}`).querySelector('img').src !== projectData.slides[100].thumbnail) throw Error('thumbnail update');
        durations.cardPreserved = firstCard === document.getElementById(`slide-item-${{ids[0]}}`);
        document.getElementById(`slide-item-${{ids[1]}}`).click();
        document.getElementById(`slide-item-${{ids[2]}}`).dispatchEvent(new MouseEvent('click', {{bubbles: true, ctrlKey: true}}));
        if (selectedSlideIds.length !== 2) throw Error('multi selection');
        document.getElementById(`slide-item-${{ids[4]}}`).dispatchEvent(new MouseEvent('click', {{bubbles: true, shiftKey: true}}));
        if (selectedSlideIds.length !== 3) throw Error('range selection');
        isSlideSorterOpen = true;
        renderSlideSorter();
        timed('twentySorterSelectionsMs', () => {{
            for (let i = 0; i < 20; i++) document.getElementById(`sorter-card-${{ids[100 + i % 2]}}`).click();
        }});
        if (!document.getElementById(`sorter-card-${{activeSlideId}}`).classList.contains('editing')) throw Error('sorter selection');
        isSlideSorterOpen = false;
        projectData.slides.reverse();
        renderSlides();
        if (list.firstElementChild.id !== `slide-item-${{ids[ids.length - 1]}}`) throw Error('reorder render');
        durations.slideCount = ids.length;
        durations.label = {json.dumps(label)};
        document.body.innerHTML = `<pre id=\"results\">${{JSON.stringify(durations)}}</pre>`;
    }} catch (error) {{
        document.body.innerHTML = `<pre id=\"results\">${{JSON.stringify({{error: String(error), label: {json.dumps(label)}}})}}</pre>`;
    }}
}});
</script></body></html>"""


def make_presenter_page(deck: dict, source: str, label: str) -> str:
    data = json.dumps(deck, ensure_ascii=False).replace("<", "\\u003c")
    return f"""<!doctype html><html><body>
<div id="slide-list"></div><div id="slide-count"></div>
<div id="live-status-badge"></div><div id="slide-indicator"></div>
<script>{source}</script><script>
window.onload = () => {{
    try {{
        projectData = {data};
        projectData.settings.currentLiveSlideId = null;
        const ids = projectData.slides.map(s => s.id);
        const durations = {{}};
        const timed = (name, fn) => {{
            const start = performance.now();
            fn();
            durations[name] = +(performance.now() - start).toFixed(2);
        }};
        timed('initialRenderMs', () => renderDeck());
        if (document.getElementById('slide-list').children.length !== ids.length) throw Error('card count');
        timed('twoHundredActiveUpdatesMs', () => {{
            for (let i = 0; i < 200; i++) updateSlideActiveState(null, ids[100 + i % 2], false);
        }});
        document.getElementById(`slide-item-${{ids[1]}}`).click();
        document.getElementById(`slide-item-${{ids[2]}}`).click();
        if (document.getElementById(`slide-item-${{ids[1]}}`).classList.contains('selected')) throw Error('previous selection');
        if (!document.getElementById(`slide-item-${{ids[2]}}`).classList.contains('selected')) throw Error('current selection');
        const card = document.getElementById(`slide-item-${{ids[100]}}`);
        lockedSlides[ids[100]] = 'tester';
        timed('lockUpdateMs', () => {{
            if (typeof updateDeckItem === 'function') updateDeckItem(ids[100]);
            else renderDeck();
        }});
        if (!document.getElementById(`slide-item-${{ids[100]}}`).classList.contains('locked')) throw Error('lock class');
        delete lockedSlides[ids[100]];
        if (typeof updateDeckItem === 'function') updateDeckItem(ids[100]);
        else renderDeck();
        if (document.getElementById(`slide-item-${{ids[100]}}`).classList.contains('locked')) throw Error('unlock class');
        projectData.slides[100].thumbnail = projectData.slides[101].thumbnail;
        if (typeof updateDeckItem === 'function') updateDeckItem(ids[100]);
        else renderDeck();
        if (document.getElementById(`slide-item-${{ids[100]}}`).querySelector('img').src !== projectData.slides[100].thumbnail) throw Error('thumbnail update');
        durations.cardPreserved = card === document.getElementById(`slide-item-${{ids[100]}}`);
        durations.slideCount = ids.length;
        durations.label = {json.dumps(label)};
        document.body.innerHTML = `<pre id="results">${{JSON.stringify(durations)}}</pre>`;
    }} catch (error) {{
        document.body.innerHTML = `<pre id="results">${{JSON.stringify({{error: String(error), label: {json.dumps(label)}}})}}</pre>`;
    }}
}};
</script></body></html>"""


def main() -> None:
    deck_path = Path(sys.argv[1]).resolve()
    deck = json.loads(deck_path.read_text(encoding="utf-8"))
    original = subprocess.check_output(["git", "show", f"HEAD:{SOURCE}"], cwd=ROOT).decode("utf-8")
    current = (ROOT / SOURCE).read_text(encoding="utf-8")
    original_presenter = subprocess.check_output(["git", "show", f"HEAD:{PRESENTER_SOURCE}"], cwd=ROOT).decode("utf-8")
    current_presenter = (ROOT / PRESENTER_SOURCE).read_text(encoding="utf-8")
    output_dir = ROOT / ".slide_perf"
    output_dir.mkdir(exist_ok=True)
    for label, source in (("before", original), ("after", current)):
        page = output_dir / f"{label}.html"
        page.write_text(make_page(deck, source, label), encoding="utf-8")
        print(f"{label}: {page.as_uri()}")
    for label, source in (("presenter_before", original_presenter), ("presenter_after", current_presenter)):
        page = output_dir / f"{label}.html"
        page.write_text(make_presenter_page(deck, source, label), encoding="utf-8")
        print(f"{label}: {page.as_uri()}")


if __name__ == "__main__":
    main()
