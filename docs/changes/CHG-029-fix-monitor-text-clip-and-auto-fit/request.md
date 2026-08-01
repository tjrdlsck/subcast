# Change Request: CHG-029-fix-monitor-text-clip-and-auto-fit

## 1. 요청 배경 (Background)
모니터링 화면에서 '밀', '빌'처럼 한글 'ㄹ' 받침이 들어간 3단 조합 문자(초성+중성+종성) 렌더링 시, 폰트 바운딩 박스 하단 획(Descender Line)이 `overflow: hidden` 클리핑 영역 경계에 걸려 아랫부분이 잘리는 현상이 지속됨.

## 2. 요청 상세 (Requirements)
1. **한글 3단 조합 및 디센더 획 클리핑 완벽 해소**:
   - `line-height: 1.5`로 폰트 수직 렌더링 높이를 확장하고, `padding-bottom: 8px` 하단 안심 버퍼(Safety Buffer)와 `margin: auto 0` 수직 정렬 보정을 적용하여 타이트한 카드에서도 글자 아래쪽 획이 100% 온전히 렌더링되도록 구현.
2. **자동 레이아웃 조절 및 가독성 확보**:
   - 부모 모니터 카드 영역 내부에서 텍스트가 아무리 타이트하게 갇혀도 글자가 깎이거나 절단되지 않고 자연스럽게 감싸지도록 레이아웃 구조 보정.
