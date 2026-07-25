import pytest
from pathlib import Path

def test_presenter_monitoring_button_and_modal():
    presenter_path = Path("frontend/presenter.html")
    assert presenter_path.exists(), "presenter.html 파일이 존재해야 합니다."
    
    content = presenter_path.read_text(encoding="utf-8")
    
    # 1. 헤더 우측 라이브 버튼 왼쪽에 '모니터링' 버튼 추가 검증
    assert 'id="btn-open-monitoring"' in content, "모니터링 버튼(#btn-open-monitoring)이 존재해야 합니다."
    assert '🖥️ 모니터링' in content or '모니터링' in content, "모니터링 버튼 텍스트가 존재해야 합니다."
    
    # 2. 모니터링 모달(#monitoring-modal) 마크업 검증
    assert 'id="monitoring-modal"' in content, "모니터링 모달(#monitoring-modal)이 존재해야 합니다."
    assert 'id="btn-close-monitoring"' in content, "모달 닫기 버튼이 존재해야 합니다."
    assert 'id="btn-save-monitoring"' in content, "설정 저장 버튼이 존재해야 합니다."
    assert 'id="btn-open-monitor-window"' in content, "모니터링 뷰어 실행 버튼이 존재해야 합니다."
    
    # 3. 설정 옵션 라디오 및 모달 내 실시간 미리보기 검증
    assert 'name="monitor-layout"' in content, "레이아웃 비율 옵션 라디오가 존재해야 합니다."
    assert 'name="monitor-bible"' in content, "성경 표출 옵션 라디오가 존재해야 합니다."
    assert 'id="monitor-preview-box"' in content, "모달 내 실시간 미리보기 컨테이너(#monitor-preview-box)가 존재해야 합니다."
    assert 'updateMonitorPreview' in content, "실시간 미리보기 업데이트 로직(updateMonitorPreview)이 존재해야 합니다."

def test_viewer_monitor_mode_support():
    viewer_path = Path("frontend/viewer.html")
    assert viewer_path.exists(), "viewer.html 파일이 존재해야 합니다."
    
    content = viewer_path.read_text(encoding="utf-8")
    
    # mode=monitor 쿼리 파라미터 감지 및 모니터링 레이아웃 렌더링 지원 검증
    assert "mode=monitor" in content or "urlParams.get('mode') === 'monitor'" in content, "mode=monitor 쿼리 파라미터 감지 로직이 존재해야 합니다."
    assert "renderMonitorView" in content, "renderMonitorView 함수가 존재해야 합니다."
