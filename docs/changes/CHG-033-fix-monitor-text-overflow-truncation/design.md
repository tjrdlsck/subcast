# Technical Design: CHG-033-fix-monitor-text-overflow-truncation

## 1. 기술적 변경 구조 (Architecture & CSS/JS Design)

### (1) Flex Box & Multi-line Ellipsis 구조 개선
- 부모 `.monitor-card`는 Flexbox 수직 중앙 정렬(`justify-content: center; align-items: center;`)을 유지하되, 내부 텍스트 래퍼 `.monitor-card-text`에 다음과 같은 안전한 CSS Truncation 및 Display 속성을 적용합니다.
  ```css
  .monitor-card-text {
      display: -webkit-box !important;
      -webkit-box-orient: vertical !important;
      -webkit-line-clamp: 2 !important; /* 모니터 설정 박스 높이에 맞춘 줄수 경계 또는 auto overflow clamp */
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
      white-space: pre-wrap !important;
      line-height: 1.20 !important;
      max-height: 100% !important;
  }
  ```

### (2) Dynamic Font Scale Down / Line Clamp 보정 (`viewer.js`)
- 텍스트 길이가 매우 길 경우, 생략(`...`)표시 전 또는 생략 표출 시 폰트를 최대 2단계까지 미세 축소하여 가독성을 보장하고 가려짐을 근본 차단합니다.
- `scrollHeight`가 `clientHeight`를 초과할 경우 `overflow: hidden; text-overflow: ellipsis;`가 동작하여 말줄임표가 표출되도록 안전 래핑합니다.

## 2. 모듈 간 영향 및 데이터 흐름
- `viewer.js`의 `renderMonitorViewerLayout()` 실행 시 설정된 `maxHeight` 범위 내에서 안전 클리핑/말줄임이 처리됩니다.
