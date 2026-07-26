import pytest
import os
import shutil
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend.storage import PROJECTS_DIR, ACTIVE_PROJECT_FILE

client = TestClient(app)

created_test_project_ids = []

@pytest.fixture(autouse=True)
def setup_and_teardown_projects():
    yield
    # 테스트 종료 후 테스트에서 등록된 특정 프로젝트 ID만 안전하게 삭제
    for pid in created_test_project_ids:
        pfile = PROJECTS_DIR / f"{pid}.json"
        if pfile.exists():
            try:
                pfile.unlink()
            except Exception:
                pass
    created_test_project_ids.clear()

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
    created_test_project_ids.append(proj_id)
    assert created_proj["name"] == project_name
    assert proj_id.startswith("proj_")
    assert len(created_proj["slides"]) == 1
    assert created_proj["slides"][0]["elements"] == []

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

def test_global_template_sharing():
    # 프로젝트 A 생성
    res_a = client.post("/api/projects", json={"name": "프로젝트 A"})
    assert res_a.status_code == 200
    proj_a = res_a.json()
    proj_a_id = proj_a["id"]
    created_test_project_ids.append(proj_a_id)

    # 프로젝트 B 생성
    res_b = client.post("/api/projects", json={"name": "프로젝트 B"})
    assert res_b.status_code == 200
    proj_b = res_b.json()
    proj_b_id = proj_b["id"]
    created_test_project_ids.append(proj_b_id)

    # 프로젝트 A 선택 후 템플릿 확인
    select_a = client.post(f"/api/projects/{proj_a_id}/select").json()
    templates_a = select_a["project"]["templates"]

    # 프로젝트 B 선택 후 템플릿 확인 -> A와 동일한 템플릿 목록이어야 함
    select_b = client.post(f"/api/projects/{proj_b_id}/select").json()
    templates_b = select_b["project"]["templates"]

    assert templates_a == templates_b

def test_bulk_duplicate_and_delete():
    # 1. 두 개의 테스트 프로젝트 생성
    p1 = client.post("/api/projects", json={"name": "원본 프로젝트 1"}).json()
    p2 = client.post("/api/projects", json={"name": "원본 프로젝트 2"}).json()
    id1, id2 = p1["id"], p2["id"]
    created_test_project_ids.extend([id1, id2])

    # 2. 다중 복제 테스트 (Ctrl+C / Ctrl+V 에 대응)
    dup_res = client.post("/api/projects/duplicate-bulk", json={"ids": [id1, id2]})
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    assert dup_data["status"] == "success"
    duplicated_list = dup_data["duplicated"]
    assert len(duplicated_list) == 2
    dup_ids = [p["id"] for p in duplicated_list]
    created_test_project_ids.extend(dup_ids)

    assert duplicated_list[0]["name"] == "원본 프로젝트 1 (복사본)"
    assert duplicated_list[1]["name"] == "원본 프로젝트 2 (복사본)"

    # 3. 다중 삭제 테스트 (Delete 키에 대응)
    del_res = client.post("/api/projects/delete-bulk", json={"ids": dup_ids})
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # 목록 조회 시 복제본들이 지워졌는지 확인
    list_after_del = client.get("/api/projects").json()
    remaining = [p["id"] for p in list_after_del]
    for d_id in dup_ids:
        assert d_id not in remaining


