# Impact Analysis: CHG-011-fix-monitor-default-shape-and-realtime-preview

## 1. 영향 범위 (Scope Boundaries)

### Allowed Scope
- `frontend/editor.html` (PIP iframe `src="/static/monitor.html?channel=preview"` 지정)
- `frontend/js/modules/editor-monitor.js` (실시간 미리보기 전송 `broadcastMonitorPreviewSettings` 추가)
- `frontend/js/viewer.js` (미리보기 채널 `channel=preview` 및 외부 송출 채널 `channel=monitor` 분리 처리)
- `tests/test_monitor_custom_elements.py` (테스트 DB cleanup 추가)
- `docs/changes/CHG-011-fix-monitor-default-shape-and-realtime-preview/*`
- `docs/project-state.md`

### Protected Scope
- `backend/` (DB 스키마 유지, DB 초기화 데이터 정제)
- `frontend/js/modules/editor-elements.js`
- `frontend/js/modules/editor-init.js`
- `frontend/js/modules/editor-slides.js`
- `run.py`

## 2. 리스크 및 영향도 평가 (Risk Analysis)
- `GAE_Bible.db` DB의 `custom_elements` 컬럼 잔여 데이터를 초기화하여 원이 표시되지 않게 안전하게 수정.
- BroadcastChannel 메시지 타입을 `MONITOR_PREVIEW_UPDATE`(에디터 PIP용)와 `MONITOR_LAYOUT_UPDATE`(외부 송출 뷰어 저장 전용)로 구분하여 외부 송출 오염을 방지.
