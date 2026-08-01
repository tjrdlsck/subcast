# Testing Strategy: PIP 미리보기 박스 비율 계산 및 줄바꿈 일치 수정 (CHG-015)

## 1. 테스트 항목

### 단위 및 API 회귀 테스트
- `.\venv\Scripts\python.exe -m pytest` 실행을 통해 기존 backend 및 monitor 관련 API 테스트(`test_monitor_api.py`, `test_e2e_monitor.py` 등) 전원 통과 여부 검증.

### 클라이언트 UI 렌더링 검증
- `frontend/js/viewer.js` 및 `frontend/monitor.html` 수정 후:
  - 무대 모니터 탭의 PIP 미리보기 박스(`pip-monitor-preview-box`) 내 text 폰트 크기가 반올림 없이 소수점 단위로 부모 컨테이너 비율과 정확히 1:1 대응하여 축소되는지 확인.
  - 메인 캔버스 가이드 박스에서 줄바꿈이 발생하지 않은 긴 한글/영문 텍스트가 PIP 미리보기 iframe에서도 동일하게 줄바꿈 없이 한 줄로 렌더링되는지 확인.
