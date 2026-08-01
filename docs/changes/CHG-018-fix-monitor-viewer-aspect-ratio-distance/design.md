# Technical Design: CHG-018-fix-monitor-viewer-aspect-ratio-distance

- **Change ID**: `CHG-018-fix-monitor-viewer-aspect-ratio-distance`
- **Date**: 2026-08-01
- **Status**: APPROVED

## 1. 수식 분석 및 기술 설계
에디터 캔버스의 기본 해상도 $W_{base} = 768$, $H_{base} = 432$ ($16:9$, $1.777...$)입니다.
모니터링 페이지(`monitor.html`)가 실행되는 브라우저 창의 뷰포트 크기를 $W_{win}$, $H_{win}$이라 할 때, 16:9 스테이지 영역의 크기($W_{stage}, H_{stage}$) 및 오프셋($L_{stage}, T_{stage}$)은 다음과 같이 계산됩니다:

$$\text{Aspect Ratio } R_{target} = \frac{16}{9} \approx 1.777778$$
$$\text{Window Ratio } R_{win} = \frac{W_{win}}{H_{win}}$$

- **Case 1: $R_{win} > R_{target}$** (좌우 Pillarbox 발생)
  $$H_{stage} = H_{win}$$
  $$W_{stage} = H_{stage} \times R_{target}$$
  $$L_{stage} = \frac{W_{win} - W_{stage}}{2}$$
  $$T_{stage} = 0$$

- **Case 2: $R_{win} \le R_{target}$** (상하 Letterbox 발생)
  $$W_{stage} = W_{win}$$
  $$H_{stage} = \frac{W_{stage}}{R_{target}}$$
  $$L_{stage} = 0$$
  $$T_{stage} = \frac{H_{win} - H_{stage}}{2}$$

- **스케일 계수 $\text{scale}$**:
  $$\text{scale} = \frac{W_{stage}}{768}$$

## 2. 요소 배치 연산식
`monitor-current-card`, `monitor-next-card`, 및 커스텀 요소들의 절대 PX 위치/크기는 뷰포트 전체가 아닌 **스테이지($W_{stage}, H_{stage}, L_{stage}, T_{stage}$)**를 기준으로 배치합니다:

$$\text{leftPx} = L_{stage} + \left(\frac{\text{leftPct}}{100} \times W_{stage}\right)$$
$$\text{topPx} = T_{stage} + \left(\frac{\text{topPct}}{100} \times H_{stage}\right)$$
$$\text{widthPx} = \frac{\text{widthPct}}{100} \times W_{stage}$$
$$\text{heightPx} = \frac{\text{heightPct}}{100} \times H_{stage}$$
$$\text{fontSizePx} = \text{fontSize} \times \text{scale}$$

이 16:9 스테이지 투영 알고리즘을 `viewer.js` 내의 `renderMonitorViewerLayout()` 및 `renderMonitorCustomElements()`에 적용합니다.
