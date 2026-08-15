import json
import urllib.parse
from typing import List
from fastapi import APIRouter, HTTPException, UploadFile, File, Response

from backend.schemas import ProjectCreateRequest, ProjectUpdateRequest, ProjectBatchRequest
from backend.storage import (
    list_projects, create_project, update_project_name, delete_project,
    set_active_project_id, load_project_data,
    duplicate_projects_bulk, delete_projects_bulk, import_project_data
)
from backend.services.connection_manager import manager

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
async def get_projects():
    try:
        return await list_projects()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_new_project(req: ProjectCreateRequest):
    try:
        if not req.name or not req.name.strip():
            raise HTTPException(status_code=400, detail="프로젝트 이름을 입력해주세요.")
        proj = await create_project(req.name.strip())
        return proj
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{project_id}")
@router.put("/{project_id}")
async def rename_project(project_id: str, req: ProjectUpdateRequest):
    try:
        if not req.name or not req.name.strip():
            raise HTTPException(status_code=400, detail="프로젝트 이름을 입력해주세요.")
        proj = await update_project_name(project_id, req.name.strip())
        if manager.project_data and manager.project_data.id == project_id:
            manager.project_data.name = proj.name
            await manager.broadcast({
                "type": "INITIAL_SYNC",
                "data": manager.project_data.model_dump(),
                "lockedSlides": manager.locked_slides
            })
        return proj
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/select")
async def select_project(project_id: str):
    try:
        set_active_project_id(project_id)
        manager.project_data = await load_project_data(project_id)
        manager.project_history.clear()
        manager.locked_slides.clear()
        
        await manager.broadcast({
            "type": "INITIAL_SYNC",
            "data": manager.project_data.model_dump(),
            "lockedSlides": manager.locked_slides
        })
        return {"status": "success", "active_project_id": project_id, "project": manager.project_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_id}")
async def remove_project(project_id: str):
    try:
        new_active_id = await delete_project(project_id)
        if manager.project_data and manager.project_data.id == project_id:
            manager.project_data = await load_project_data(new_active_id)
            manager.project_history.clear()
            manager.locked_slides.clear()
            await manager.broadcast({
                "type": "INITIAL_SYNC",
                "data": manager.project_data.model_dump(),
                "lockedSlides": manager.locked_slides
            })
        return {"status": "success", "active_project_id": new_active_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/duplicate-bulk")
async def duplicate_projects_batch(req: ProjectBatchRequest):
    try:
        if not req.ids:
            raise HTTPException(status_code=400, detail="복제할 프로젝트 ID 목록이 비어있습니다.")
        duplicated = await duplicate_projects_bulk(req.ids)
        return {"status": "success", "duplicated": duplicated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/delete-bulk")
async def delete_projects_batch(req: ProjectBatchRequest):
    try:
        if not req.ids:
            raise HTTPException(status_code=400, detail="삭제할 프로젝트 ID 목록이 비어있습니다.")
        new_active_id = await delete_projects_bulk(req.ids)
        if manager.project_data and manager.project_data.id in req.ids:
            manager.project_data = await load_project_data(new_active_id)
            manager.project_history.clear()
            manager.locked_slides.clear()
            await manager.broadcast({
                "type": "INITIAL_SYNC",
                "data": manager.project_data.model_dump(),
                "lockedSlides": manager.locked_slides
            })
        return {"status": "success", "active_project_id": new_active_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/export")
async def export_project(project_id: str):
    try:
        project = await load_project_data(project_id)
        file_name = f"project_{project.name}_{project.id}.json"
        safe_filename = "".join(c for c in file_name if c.isalnum() or c in (' ', '_', '-')).rstrip() + ".json"
        encoded_filename = urllib.parse.quote(safe_filename)
        json_bytes = json.dumps(project.model_dump(), indent=2, ensure_ascii=False).encode('utf-8')
        return Response(
            content=json_bytes,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export-bulk")
async def export_projects_batch(req: ProjectBatchRequest):
    try:
        if not req.ids:
            raise HTTPException(status_code=400, detail="내보낼 프로젝트 ID 목록이 비어있습니다.")
        export_list = []
        for pid in req.ids:
            p = await load_project_data(pid)
            export_list.append(p.model_dump())
        json_bytes = json.dumps(export_list, indent=2, ensure_ascii=False).encode('utf-8')
        return Response(
            content=json_bytes,
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="projects_export.json"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import")
async def import_project_endpoint(file: UploadFile = File(...)):
    try:
        content = await file.read()
        raw = json.loads(content.decode('utf-8'))
        if isinstance(raw, list):
            imported_projects = []
            for item in raw:
                imported_projects.append(await import_project_data(item))
            return {"status": "success", "imported_count": len(imported_projects), "projects": imported_projects}
        else:
            imported_project = await import_project_data(raw)
            return {"status": "success", "imported_count": 1, "projects": [imported_project]}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="유효하지 않은 JSON 파일입니다.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"프로젝트 가져오기 실패: {str(e)}")
