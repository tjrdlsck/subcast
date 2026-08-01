# Technical Design: CHG-001-remove-monitor-guide-ui

## 1. 변경 대상
- `frontend/editor.html`

## 2. 세부 변경 사항
무대 모니터 레이아웃 패널 (`#panel-monitor`) 내부에서 불필요한 아래 3개 HTML 블록 제거:

1) 이동/리사이즈 안내 텍스트:
```html
<div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; background: rgba(255,255,255,0.03); border: 1px solid var(--panel-border); border-radius: var(--radius-sm); padding: 10px;">
    🔴 CURRENT 및 🔵 NEXT 박스를 캔버스에서 직접 이동/리사이즈하여 무대 모니터 화면 배치를 조정하세요.
</div>
```

2) 텍스트 스타일 편집 안내:
```html
<div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: var(--radius-sm); padding: 12px; display: flex; flex-direction: column; gap: 8px;">
    <div style="font-weight: 600; font-size: 0.82rem; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
        💡 텍스트 스타일 편집 안내
    </div>
    <div style="font-size: 0.75rem; color: #cbd5e1; line-height: 1.5;">
        캔버스의 🔴 <strong>CURRENT</strong> 또는 🔵 <strong>NEXT</strong> 텍스트박스를 클릭하면, <strong>우측 [속성 설정] 패널</strong>에서 글꼴, 크기, 색상, 굵기, 정렬을 직관적으로 변경할 수 있습니다.
    </div>
</div>
```

3) 실시간 정규화 좌표 정보:
```html
<div style="background: rgba(0,0,0,0.2); border: 1px solid var(--panel-border); border-radius: var(--radius-sm); padding: 12px; display: flex; flex-direction: column; gap: 8px;">
    <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-main);">📐 실시간 정규화 좌표 정보</div>
    <div id="monitor-layout-info" style="font-family: monospace; font-size: 0.72rem; color: #cbd5e1; line-height: 1.6;">
        🔴 CURRENT: 로딩 중...<br>
        🔵 NEXT: 로딩 중...
    </div>
</div>
```
