# Change Design: CHG-031-fix-monitor-viewport-transform-scaling

## 1. 개요 (Overview)
개별 px 계산 방식 대신 고정 768px x 432px 스테이지 래퍼(`#monitor-stage-wrapper`)를 100% 비율로 배치하고, 부모 컨테이너 크기에 맞춰 CSS `transform: scale(scale)`로 통합 스케일링을 수행하여 서브픽셀 오차 및 최소 폰트 크기 클리핑 현상을 완벽하게 제거합니다.

## 2. 세부 설계 (Detailed Design)

### A. DOM 구조 재설계 (`monitor.html` / `viewer.html`)
- `#monitor-viewer-container` 내부를 768px x 432px 크기의 고정 스테이지 `#monitor-stage-wrapper`로 감쌉니다:

```html
<div id="monitor-viewer-container" style="position: absolute; top:0; left:0; width:100vw; height:100vh; background:#000000; overflow:hidden; z-index: 1000;">
    <div id="monitor-stage-wrapper" style="position: absolute; width: 768px; height: 432px; top: 50%; left: 50%; transform-origin: center center; overflow: hidden; background: transparent;">
        <div id="monitor-current-card" class="monitor-card current-card">
            <div id="monitor-current-text"></div>
        </div>
        <div id="monitor-next-card" class="monitor-card next-card">
            <div id="monitor-next-text"></div>
        </div>
    </div>
</div>
```

### B. `viewer.js` 스케일 연산 설계
- `renderMonitorViewerLayout()`에서 카드 좌표/크기를 768x432 기준 고정 픽셀로 설정:
  - `curCard.style.left = `${(cur.leftPct / 100) * 768}px`;`
  - `curCard.style.top = `${(cur.topPct / 100) * 432}px`;`
  - `curCard.style.width = `${(cur.widthPct / 100) * 768}px`;`
  - `curCard.style.height = `${(cur.heightPct / 100) * 432}px`;`
  - `curText.style.fontSize = `${cur.fontSize || 28}px`;`
- 부모 뷰포트 크기(`windowW`, `windowH`) 대비 축소 배율 `scale` 산출:
  ```javascript
  const targetRatio = 16 / 9;
  const windowRatio = windowW / windowH;
  let scale = windowRatio > targetRatio ? windowH / 432 : windowW / 768;
  const stageWrapper = document.getElementById("monitor-stage-wrapper");
  if (stageWrapper) {
      stageWrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  ```

이 설계를 통해 가상 스테이지 안에서는 768x432 기준 1:1 무결점 상태가 보장되고, 외부 뷰포트 크기에 맞춰 `transform: scale(scale)`로 픽셀 퍼펙트 통합 스케일링이 이루어집니다.
