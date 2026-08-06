# Design Document: CHG-038 찬양 슬라이드 2분할 레이아웃 적용 및 성경/일반 슬라이드 1분할 단일 레이아웃 자동 분기

## 1. 찬양 슬라이드 감지 헬퍼 함수 (`isPraiseSlide`)

```javascript
function isPraiseSlide(slide) {
    if (!slide) return false;
    if (slide.slideType === 'praise' || slide.isPraise === true) return true;
    if (slide.id && typeof slide.id === 'string' && slide.id.startsWith('slide_praise_')) return true;
    if (slide.name && typeof slide.name === 'string' && (slide.name.startsWith('찬양:') || slide.name.startsWith('자막(템):'))) return true;
    return false;
}
```

## 2. 모니터 렌더링 분기 로직 (`viewer.js` / `monitor.html`)

- `isPraiseSlide(curSlide)` 가 `true` 인 경우:
  - 기존 2분할 모드 활성화 (`currentBox` 영역에 현재 자막, `nextBox` 영역에 다음 자막 표시).
- `isPraiseSlide(curSlide)` 가 `false` 인 경우 (성경/일반):
  - 1분할 모드 활성화: `nextBox` 영역은 감추고(`display: none` 또는 hidden), `currentBox` 영역에 현재 슬라이드 내용을 단일 렌더링.

## 3. 찬양 슬라이드 생성 시 속성 명시 (`editor-praise.js`)
- 찬양 탭에서 슬라이드를 새로 생성할 때 객체에 `slideType: 'praise'`, `isPraise: true` 속성을 내장하여 탐색 신뢰도 100% 확보.
