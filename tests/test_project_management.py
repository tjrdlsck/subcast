import pytest
import os
import shutil
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend.storage import PROJECTS_DIR, ACTIVE_PROJECT_FILE

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_and_teardown_projects():
    # 테스트 전 실행: 임시 저장
    yield
    # 테스트 완료 후 생성된 프로젝트 cleanup (기본 프로젝트 제외)
    if PROJECTS_DIR.exists():
        for pfile in PROJECTS_DIR.glob("proj_*.json"):
            if pfile.stem != "proj_default":
                try:
                    pfile.unlink()
                except Exception:
                    pass

def test_get_projects_list():
    response = client.get("/api/projects")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # 기본 프로젝트 또는 활성 프로젝트 존재 확인
    has_active = any(item.get("isActive") for item in data)
    assert has_active is True

def test_create_and_select_and_delete_project():
    # 1. 새 프로젝트 생성
    project_name = "테스트용 신규 프로젝트"
    create_res = client.post("/api/projects", json={"name": project_name})
    assert create_res.status_code == 200
    created_proj = create_res.json()
    proj_id = created_proj["id"]
    assert created_proj["name"] == project_name
    assert proj_id.startswith("proj_")

    # 2. 프로젝트 목록에서 새로 생성된 프로젝트 확인
    list_res = client.get("/api/projects")
    assert list_res.status_code == 200
    proj_ids = [p["id"] for p in list_res.json()]
    assert proj_id in proj_ids

    # 3. 프로젝트 선택(전환)
    select_res = client.post(f"/api/projects/{proj_id}/select")
    assert select_res.status_code == 200
    select_data = select_res.json()
    assert select_data["status"] == "success"
    assert select_data["active_project_id"] == proj_id

    # 목록 조회 시 isActive 확인
    list_res_after_select = client.get("/api/projects")
    for p in list_res_after_select.json():
        if p["id"] == proj_id:
            assert p["isActive"] is True

    # 4. 프로젝트 삭제
    del_res = client.delete(f"/api/projects/{proj_id}")
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["status"] == "success"

    # 목록에서 제거되었는지 확인
    list_res_after_del = client.get("/api/projects")
    remaining_ids = [p["id"] for p in list_res_after_del.json()]
    assert proj_id not in remaining_ids
